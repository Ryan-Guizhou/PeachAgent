package com.peachsoft.peachagent.integration.metering;

import com.peachsoft.peachagent.common.DomainException;
import com.peachsoft.peachagent.common.IdGenerator;
import com.peachsoft.peachagent.common.ScopeContext;
import com.peachsoft.peachagent.iam.DatabaseTimeProvider;
import com.peachsoft.peachagent.metering.BudgetService;

import java.math.BigDecimal;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicReference;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.transaction.support.TransactionTemplate;

import tools.jackson.databind.json.JsonMapper;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * 使用实际 MySQL 表、外键及事务验证跨月预算结算，不改变生产数据库时钟。
 * @Author Mr Shu
 * @Version 1.0.0
 * @CreateTime 2026/11/24 15:55
 */
@EnabledIfEnvironmentVariable(named = "PEACHAGENT_ISOLATED_FAULT_TEST", matches = "1")
class BudgetRolloverDatabaseTest {

    private static final String OLD_TIME = "20301231235959";
    private static final String NEW_TIME = "20310101000001";
    private static final String OLD_START = "20301201000000";
    private static final String NEW_START = "20310101000000";

    @Test
    void settlesOriginalBucketAndRetainsUnknownAcrossPeriods() {
        assertEquals("true", System.getenv("GITHUB_ACTIONS"));
        assertEquals("jdbc:mysql://127.0.0.1:3306/peachagent", System.getenv("DB_URL"));
        var dataSource = new DriverManagerDataSource(
                System.getenv("DB_URL"), System.getenv("DB_USER"), System.getenv("DB_PASSWORD"));
        var jdbc = new JdbcTemplate(dataSource);
        var tx = new TransactionTemplate(new DataSourceTransactionManager(dataSource));
        AtomicReference<String> clock = new AtomicReference<>(OLD_TIME);
        var time = new DatabaseTimeProvider(jdbc) {
            @Override
            public String now() {
                return clock.get();
            }
        };
        IdGenerator ids = () -> UUID.randomUUID().toString();
        var budgets = new BudgetService(jdbc, ids, time, JsonMapper.builder().build());

        // 仅复用 CI 中真实 API 创建的测试项目、模型和供应商，新增独立的账本事实。
        Map<String, Object> fixture = jdbc.queryForMap(
                """
                SELECT C.ID,C.TENANT_ID,C.WORKSPACE_ID,C.PROJECT_ID,R.ACTOR_USER_ID
                FROM RT_MODEL_CALL C JOIN RT_RUN R ON R.ID = C.RUN_ID
                JOIN IAM_PROJECT P ON P.ID = C.PROJECT_ID
                WHERE P.NAME = 'Prompt reference QA' AND C.STATUS = 'SUCCEEDED'
                ORDER BY C.ID LIMIT 1
                """);
        ScopeContext scope = new ScopeContext(
                (String) fixture.get("ACTOR_USER_ID"),
                (String) fixture.get("TENANT_ID"),
                (String) fixture.get("WORKSPACE_ID"),
                (String) fixture.get("PROJECT_ID"));
        String template = (String) fixture.get("ID");
        String policy = (String) budgets.list(scope).stream()
                .filter(row -> "PROJECT".equals(row.get("scopeType")))
                .findFirst()
                .orElseThrow()
                .get("id");
        tx.executeWithoutResult(status -> {
            jdbc.update("UPDATE BUDGET_POLICY SET MAX_CONCURRENCY = 1 WHERE ID = ?", policy);
        });
        String first = seedCall(jdbc, ids, template, scope, OLD_TIME);
        String second = seedCall(jdbc, ids, template, scope, NEW_TIME);
        String third = seedCall(jdbc, ids, template, scope, NEW_TIME);

        tx.executeWithoutResult(status -> budgets.reserve(scope, first, 20L, new BigDecimal("0.10")));
        assertBuckets(jdbc, scope, OLD_START, 0, 0, "0", 1, 20, "0.10", 0);
        clock.set(NEW_TIME);
        assertTrue(
                budgets.overview(scope).stream().allMatch(row -> ((Number) row.get("inflightCount")).intValue() == 1));
        // 换桶不重置 policy 并发槽；失败事务不得留下新桶或部分预占。
        DomainException occupied = assertThrows(
                DomainException.class,
                () -> tx.executeWithoutResult(status -> budgets.reserve(scope, second, 20L, new BigDecimal("0.10"))));
        assertEquals("CONCURRENCY_LIMIT", occupied.code());
        assertEquals(0L, count(jdbc, "SELECT COUNT(*) FROM BUDGET_RESERVATION WHERE CALL_ID = ?", second));
        tx.executeWithoutResult(status -> budgets.settle(scope, first, true, 15L, new BigDecimal("0.07")));
        tx.executeWithoutResult(status -> budgets.settle(scope, first, true, 15L, new BigDecimal("0.07")));
        assertBuckets(jdbc, scope, OLD_START, 1, 15, "0.07", 0, 0, "0", 0);
        assertTrue(
                budgets.overview(scope).stream().allMatch(row -> ((Number) row.get("inflightCount")).intValue() == 0));

        tx.executeWithoutResult(status -> budgets.reserve(scope, second, 20L, new BigDecimal("0.10")));
        tx.executeWithoutResult(status -> budgets.settle(scope, second, true, null, null));
        tx.executeWithoutResult(status -> budgets.settle(scope, second, true, null, null));
        assertBuckets(jdbc, scope, NEW_START, 1, 0, "0", 0, 20, "0.10", 1);
        assertEquals(
                3L,
                count(
                        jdbc,
                        "SELECT COUNT(*) FROM BUDGET_RESERVATION WHERE CALL_ID = ? AND STATE = 'UNCERTAIN' AND CONCURRENCY_RELEASED = TRUE",
                        second));
        tx.executeWithoutResult(status -> jdbc.update("UPDATE BUDGET_POLICY SET MAX_COST = 5 WHERE ID = ?", policy));
        DomainException uncertain = assertThrows(
                DomainException.class,
                () -> tx.executeWithoutResult(status -> budgets.reserve(scope, third, 20L, new BigDecimal("0.10"))));
        assertEquals("BUDGET_UNCERTAIN", uncertain.code());
        assertEquals(0L, count(jdbc, "SELECT COUNT(*) FROM BUDGET_RESERVATION WHERE CALL_ID = ?", third));
        assertBuckets(jdbc, scope, OLD_START, 1, 15, "0.07", 0, 0, "0", 0);
        assertBuckets(jdbc, scope, NEW_START, 1, 0, "0", 0, 20, "0.10", 1);
        assertTrue(
                budgets.overview(scope).stream().allMatch(row -> ((Number) row.get("inflightCount")).intValue() == 0));
        System.out.println(
                "PASS: real MySQL UTC rollover, original bucket settlement, cross-period slot, idempotency and unknown reserve");
    }

    private static String seedCall(
            JdbcTemplate jdbc, IdGenerator ids, String template, ScopeContext scope, String now) {
        String run = ids.nextId(), call = ids.nextId(), trace = ids.nextId().replace("-", "");
        jdbc.update(
                """
                INSERT INTO RT_RUN (ID,TENANT_ID,WORKSPACE_ID,PROJECT_ID,ACTOR_USER_ID,RUN_TYPE,TRACE_ID,
                    IDEMPOTENCY_KEY,REQUEST_HASH,STATUS,LIMIT_SNAPSHOT,QUEUED_AT,DEADLINE_AT,FINISHED_AT,CREATED_AT,UPDATED_AT)
                VALUES (?,?,?,?,?,'MODEL_DEBUG',?,?,UNHEX(SHA2(?,256)),'SUCCEEDED',JSON_OBJECT(),?,?,?,?,?)
                """,
                run,
                scope.tenantId(),
                scope.workspaceId(),
                scope.requireProject(),
                scope.userId(),
                trace,
                "rollover-" + run,
                run,
                now,
                now,
                now,
                now,
                now);
        jdbc.update(
                """
                INSERT INTO RT_MODEL_CALL (ID,TENANT_ID,WORKSPACE_ID,PROJECT_ID,RUN_ID,ATTEMPT_NO,MODEL_ID,PROVIDER_ID,
                    MODEL_TYPE,PROTOCOL_KEY,PROTOCOL_VERSION,ADAPTER_KEY,ADAPTER_VERSION,MODEL_SNAPSHOT,TRACE_ID,SPAN_ID,
                    STATUS,USAGE_SOURCE,COST_CURRENCY,COST_SOURCE,CREATED_AT,UPDATED_AT)
                SELECT ?,TENANT_ID,WORKSPACE_ID,PROJECT_ID,?,1,MODEL_ID,PROVIDER_ID,MODEL_TYPE,PROTOCOL_KEY,
                    PROTOCOL_VERSION,ADAPTER_KEY,ADAPTER_VERSION,JSON_OBJECT(),?,?,'PREPARED','UNKNOWN',COST_CURRENCY,'UNKNOWN',?,?
                FROM RT_MODEL_CALL WHERE ID = ?
                """,
                call,
                run,
                trace,
                trace.substring(0, 16),
                now,
                now,
                template);
        return call;
    }

    private static long count(JdbcTemplate jdbc, String sql, Object arg) {
        return jdbc.queryForObject(sql, Long.class, arg);
    }

    private static void assertBuckets(
            JdbcTemplate jdbc,
            ScopeContext scope,
            String start,
            long calls,
            long tokens,
            String cost,
            long heldCalls,
            long heldTokens,
            String heldCost,
            long unknown) {
        List<Map<String, Object>> rows = jdbc.queryForList(
                """
                SELECT CONSUMED_CALLS,CONSUMED_TOKENS,CONSUMED_COST,RESERVED_CALLS,RESERVED_TOKENS,RESERVED_COST,UNKNOWN_CALLS
                FROM BUDGET_BUCKET B JOIN BUDGET_POLICY P ON P.ID = B.POLICY_ID
                WHERE B.TENANT_ID = ? AND B.PERIOD_START = ?
                  AND ((P.SCOPE_TYPE = 'TENANT' AND P.SCOPE_ID = ?) OR (P.SCOPE_TYPE = 'WORKSPACE' AND P.SCOPE_ID = ?)
                    OR (P.SCOPE_TYPE = 'PROJECT' AND P.SCOPE_ID = ?))
                """,
                scope.tenantId(),
                start,
                scope.tenantId(),
                scope.workspaceId(),
                scope.requireProject());
        assertEquals(3, rows.size());
        for (var row : rows) {
            assertEquals(calls, ((Number) row.get("CONSUMED_CALLS")).longValue());
            assertEquals(tokens, ((Number) row.get("CONSUMED_TOKENS")).longValue());
            assertEquals(0, new BigDecimal(row.get("CONSUMED_COST").toString()).compareTo(new BigDecimal(cost)));
            assertEquals(heldCalls, ((Number) row.get("RESERVED_CALLS")).longValue());
            assertEquals(heldTokens, ((Number) row.get("RESERVED_TOKENS")).longValue());
            assertEquals(0, new BigDecimal(row.get("RESERVED_COST").toString()).compareTo(new BigDecimal(heldCost)));
            assertEquals(unknown, ((Number) row.get("UNKNOWN_CALLS")).longValue());
        }
    }
}
