package com.peachsoft.peachagent.runtime;

import com.peachsoft.peachagent.common.DomainException;
import com.peachsoft.peachagent.common.IdGenerator;
import com.peachsoft.peachagent.model.ModelExecution;
import com.peachsoft.peachagent.model.ModelExecutionContext;
import com.peachsoft.peachagent.model.ModelExecutionRequest;
import com.peachsoft.peachagent.model.ModelService;

import jakarta.annotation.PreDestroy;

import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.RejectedExecutionException;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.ScheduledFuture;
import java.util.concurrent.Semaphore;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.function.Supplier;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.annotation.Profile;
import org.springframework.dao.ConcurrencyFailureException;
import org.springframework.dao.TransientDataAccessException;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/**
 * 有界 Worker；租约过期中断，不隐式重放已经派发的模型请求。
 * @Author Mr Shu
 * @Version 1.0.0
 * @CreateTime 2026/11/24 11:41
 */
@Component
@Profile("worker")
public class RunWorker {
    private static final Logger log = LoggerFactory.getLogger(RunWorker.class);
    private final RunService runs;
    private final ModelService models;
    private final ArtifactStore artifacts;
    private final String owner;
    private final ExecutorService tasks = Executors.newVirtualThreadPerTaskExecutor();
    private final ScheduledExecutorService timers = Executors.newScheduledThreadPool(4);
    private final Semaphore capacity = new Semaphore(32);
    private final AtomicBoolean stopping = new AtomicBoolean();

    public RunWorker(RunService runs, ModelService models, ArtifactStore artifacts, IdGenerator ids) {
        this.runs = runs;
        this.models = models;
        this.artifacts = artifacts;
        this.owner = ids.nextId();
    }

    @Scheduled(fixedDelay = 40)
    public void poll() {
        if (stopping.get()) return;
        while (!stopping.get() && capacity.tryAcquire()) {
            RunService.Claim claim;
            try {
                claim = runs.claim(owner);
            } catch (Exception ex) {
                capacity.release();
                log.warn("Run claim failed type={}", ex.getClass().getSimpleName());
                return;
            }
            if (claim == null) {
                capacity.release();
                return;
            }
            try {
                tasks.submit(() -> {
                    try {
                        execute(claim);
                    } finally {
                        capacity.release();
                    }
                });
            } catch (RejectedExecutionException ex) {
                capacity.release();
                // 尚未派发外部调用；关闭期间归还本地槽并尽力结束已领取的任务。
                try {
                    runs.finish(claim, null, null, "WORKER_STOPPING", 0);
                } catch (Exception settlementError) {
                    log.warn("Rejected run settlement failed runId={}", claim.id());
                }
                return;
            }
        }
    }

    @Scheduled(fixedDelay = 5000)
    public void recover() {
        try {
            runs.recover();
        } catch (Exception ex) {
            log.warn("Run recovery failed");
        }
    }

    @Scheduled(fixedDelay = 60000)
    public void cleanup() {
        artifacts.cleanup();
    }

    private void execute(RunService.Claim c) {
        String call = null, code = null, stage = "prepare";
        ModelExecution result = null;
        long start = System.nanoTime();
        ModelExecutionContext context = null;
        ScheduledFuture<?> pulse = null;
        try {
            var p = c.payload();
            var prepared = models.prepare(c.scope(), p.model());
            stage = "reserve";
            call = retryLocal(
                    c, "reserve", () -> runs.startCall(c, prepared.credential().revision()));
            final String callId = call;
            StringBuilder buffer = new StringBuilder();
            long[] last = {0};
            context = new ModelExecutionContext(prepared.transport(), delta -> {
                buffer.append(delta);
                if (last[0] == 0 || buffer.length() >= 2048 || System.nanoTime() - last[0] >= 100_000_000L) {
                    runs.delta(c, callId, buffer.toString());
                    buffer.setLength(0);
                    last[0] = System.nanoTime();
                }
            });
            var active = context;
            pulse = timers.scheduleAtFixedRate(
                    () -> {
                        try {
                            if (!runs.heartbeat(c)) active.cancel();
                        } catch (Exception ex) {
                            active.cancel();
                        }
                    },
                    1,
                    1,
                    TimeUnit.SECONDS);
            byte[] audio = p.inputArtifactId() == null
                    ? null
                    : artifacts.read(c.scope(), c.id(), p.inputArtifactId()).bytes();
            // 在实际派发前重新检查版本、凭证与租约；不以旧快照绕过撤权。
            var latest = models.prepare(c.scope(), p.model());
            if (latest.credential().revision() != prepared.credential().revision())
                throw new DomainException("CREDENTIAL_CHANGED", 409, "Credential changed before dispatch");
            stage = "dispatch-intent";
            retryLocal(c, "dispatch-intent", () -> {
                runs.dispatch(c, callId);
                return null;
            });
            context.checkActive();
            stage = "provider-execution";
            try {
                result = prepared.adapter()
                        .execute(
                                new ModelExecutionRequest(
                                        p.model().operation(),
                                        p.model().externalModelId(),
                                        p.messages(),
                                        p.input(),
                                        p.model().options(),
                                        p.maxOutputTokens(),
                                        audio),
                                context);
            } finally {
                if (!buffer.isEmpty()) runs.delta(c, callId, buffer.toString());
            }
        } catch (DomainException ex) {
            code = ex.code();
            result = null;
        } catch (Exception ex) {
            code = "MODEL_EXECUTION_FAILED";
            result = null;
            Throwable cause = ex.getCause();
            log.warn(
                    "Run execution failed runId={} stage={} type={} cause={}",
                    c.id(),
                    stage,
                    ex.getClass().getSimpleName(),
                    cause == null ? "none" : cause.getClass().getSimpleName());
        } finally {
            if (pulse != null) pulse.cancel(false);
            if (context != null) context.cancel();
            settle(c, call, result, code, TimeUnit.NANOSECONDS.toMillis(System.nanoTime() - start));
        }
    }

    /** 仅对派发前明确回滚的数据库并发失败进行有限重试。 */
    private <T> T retryLocal(RunService.Claim claim, String phase, Supplier<T> action) {
        for (int attempt = 1; ; attempt++) {
            try {
                return action.get();
            } catch (ConcurrencyFailureException ex) {
                if (attempt >= 3) throw ex;
                log.warn(
                        "Transient local run transaction failure runId={} phase={} attempt={} type={}",
                        claim.id(),
                        phase,
                        attempt,
                        ex.getClass().getSimpleName());
                try {
                    Thread.sleep(20L * attempt);
                } catch (InterruptedException interrupted) {
                    Thread.currentThread().interrupt();
                    throw new DomainException("RUN_STOPPED", 409, "Worker interrupted");
                }
            }
        }
    }

    /** 只重试已回滚的本地结算事务，绝不再次执行供应商请求。 */
    private void settle(RunService.Claim claim, String call, ModelExecution result, String code, long elapsed) {
        for (int attempt = 1; attempt <= 3; attempt++) {
            try {
                runs.finish(claim, call, result, code, elapsed);
                return;
            } catch (TransientDataAccessException ex) {
                log.warn(
                        "Transient run settlement failure runId={} attempt={} type={}",
                        claim.id(),
                        attempt,
                        ex.getClass().getSimpleName());
                if (attempt == 3) break;
                try {
                    Thread.sleep(25L * attempt);
                } catch (InterruptedException interrupted) {
                    Thread.currentThread().interrupt();
                    break;
                }
            } catch (Exception ex) {
                log.error(
                        "Run settlement failed runId={} type={}",
                        claim.id(),
                        ex.getClass().getSimpleName());
                return;
            }
        }
        log.error("Run settlement deferred to lease recovery runId={}", claim.id());
    }

    @PreDestroy
    public void stop() {
        stopping.set(true);
        tasks.shutdownNow();
        timers.shutdownNow();
    }
}
