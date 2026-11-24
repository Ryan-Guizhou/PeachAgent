package com.peachsoft.peachagent.runtime;

import com.peachsoft.peachagent.common.DomainException;
import com.peachsoft.peachagent.common.IdGenerator;
import com.peachsoft.peachagent.model.*;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicBoolean;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.annotation.Profile;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import jakarta.annotation.PreDestroy;

/** 有界 Worker；租约过期中断，不隐式重放已经派发的模型请求。 */
@Component
@Profile("worker")
public class RunWorker {
    private static final Logger log=LoggerFactory.getLogger(RunWorker.class);
    private final RunService runs;private final ModelService models;private final ArtifactStore artifacts;private final String owner;
    private final ExecutorService tasks=Executors.newVirtualThreadPerTaskExecutor();
    private final ScheduledExecutorService timers=Executors.newScheduledThreadPool(4);
    private final Semaphore capacity=new Semaphore(32);
    private final AtomicBoolean stopping=new AtomicBoolean();
    public RunWorker(RunService runs,ModelService models,ArtifactStore artifacts,IdGenerator ids){this.runs=runs;this.models=models;this.artifacts=artifacts;this.owner=ids.nextId();}
    @Scheduled(fixedDelay=250)
    public void poll(){
        if(stopping.get())return;
        while(capacity.tryAcquire()){
            RunService.Claim claim;
            try{claim=runs.claim(owner);}catch(Exception ex){capacity.release();log.warn("Run claim failed");return;}
            if(claim==null){capacity.release();return;}
            tasks.submit(()->{try{execute(claim);}finally{capacity.release();}});
        }
    }
    @Scheduled(fixedDelay=5000)
    public void recover(){try{runs.recover();}catch(Exception ex){log.warn("Run recovery failed");}}
    @Scheduled(fixedDelay=60000)
    public void cleanup(){artifacts.cleanup();}
    private void execute(RunService.Claim c){
        String call=null,code=null;ModelExecution result=null;long start=System.nanoTime();
        ModelExecutionContext context=null;ScheduledFuture<?> pulse=null;
        try{
            var p=c.payload();var prepared=models.prepare(c.scope(),p.model());
            call=runs.startCall(c,prepared.credential().revision());
            final String callId=call;
            StringBuilder buffer=new StringBuilder();long[] last={System.nanoTime()};
            context=new ModelExecutionContext(prepared.transport(),delta->{
                buffer.append(delta);
                if(buffer.length()>=2048||System.nanoTime()-last[0]>=100_000_000L){
                    runs.delta(c,callId,buffer.toString());buffer.setLength(0);last[0]=System.nanoTime();
                }
            });
            var active=context;
            pulse=timers.scheduleAtFixedRate(()->{
                try{if(!runs.heartbeat(c))active.cancel();}catch(Exception ex){active.cancel();}
            },0,1,TimeUnit.SECONDS);
            byte[] audio=p.inputArtifactId()==null?null:artifacts.read(c.scope(),c.id(),p.inputArtifactId()).bytes();
            // 在实际派发前重新检查版本、凭证与租约；不以旧快照绕过撤权。
            var latest=models.prepare(c.scope(),p.model());
            if(latest.credential().revision()!=prepared.credential().revision())throw new DomainException("CREDENTIAL_CHANGED",409,"Credential changed before dispatch");
            runs.dispatch(c,call);context.checkActive();
            try{result=prepared.adapter().execute(new ModelExecutionRequest(p.model().operation(),p.model().externalModelId(),p.messages(),p.input(),p.model().options(),p.maxOutputTokens(),audio),context);}
            finally{if(!buffer.isEmpty())runs.delta(c,callId,buffer.toString());}
        }catch(DomainException ex){code=ex.code();result=null;}
        catch(Exception ex){code="MODEL_EXECUTION_FAILED";result=null;log.warn("Run execution failed runId={}",c.id());}
        finally{
            if(pulse!=null)pulse.cancel(false);
            if(context!=null)context.cancel();
            try{runs.finish(c,call,result,code,TimeUnit.NANOSECONDS.toMillis(System.nanoTime()-start));}
            catch(Exception ex){log.error("Run settlement failed runId={}",c.id());}
        }
    }
    @PreDestroy public void stop(){stopping.set(true);tasks.shutdownNow();timers.shutdownNow();}
}
