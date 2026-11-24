package com.peachsoft.peachagent.metering;

import com.peachsoft.peachagent.common.DomainException;
import com.peachsoft.peachagent.common.IdGenerator;
import com.peachsoft.peachagent.common.JsonData;
import com.peachsoft.peachagent.common.ScopeContext;
import com.peachsoft.peachagent.common.TimeCodec;
import com.peachsoft.peachagent.iam.DatabaseTimeProvider;
import java.math.BigDecimal;
import java.time.ZoneOffset;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import tools.jackson.databind.json.JsonMapper;

/** 租户、空间、项目三级预占。调用与结算必须在 Runtime 的事务内执行。 */
@Service
public class BudgetService {
    private final JdbcTemplate jdbc;
    private final IdGenerator ids;
    private final DatabaseTimeProvider time;
    private final JsonMapper mapper;
    public BudgetService(JdbcTemplate jdbc,IdGenerator ids,DatabaseTimeProvider time,JsonMapper mapper){
        this.jdbc=jdbc;this.ids=ids;this.time=time;this.mapper=mapper;
    }
    public record Limits(Long maxCalls,Long maxTokens,BigDecimal maxCost,Integer maxConcurrency,Integer maxRunSeconds,
                         Long maxRunTokens,BigDecimal maxRunCost,long rowVersion) { }

    private List<Map<String,Object>> policies(ScopeContext s,boolean lock){
        var rows=jdbc.queryForList("""
                SELECT ID,SCOPE_TYPE,SCOPE_ID,PERIOD_TYPE,MAX_CALLS,MAX_TOKENS,MAX_COST,CURRENCY,
                    MAX_CONCURRENCY,MAX_RUN_SECONDS,MAX_RUN_TOKENS,MAX_RUN_COST,INFLIGHT_COUNT,STATUS,ROW_VERSION
                FROM BUDGET_POLICY WHERE TENANT_ID = ? AND
                ((SCOPE_TYPE = 'TENANT' AND SCOPE_ID = ?) OR (SCOPE_TYPE = 'WORKSPACE' AND SCOPE_ID = ?) OR
                (SCOPE_TYPE = 'PROJECT' AND SCOPE_ID = ?))
                ORDER BY CASE SCOPE_TYPE WHEN 'TENANT' THEN 1 WHEN 'WORKSPACE' THEN 2 ELSE 3 END
                """+(lock?" FOR UPDATE":""),s.tenantId(),s.tenantId(),s.workspaceId(),s.requireProject());
        if(rows.size()!=3||rows.stream().anyMatch(x->!"ACTIVE".equals(x.get("STATUS"))))
            throw new DomainException("BUDGET_POLICY_MISSING",409,"Active budget policy required");
        return rows;
    }

    public int deadlineSeconds(ScopeContext s){
        return policies(s,false).stream().mapToInt(x->((Number)x.get("MAX_RUN_SECONDS")).intValue()).min().orElse(180);
    }

    public List<Map<String,Object>> list(ScopeContext s){
        return policies(s,false).stream().map(x->JsonData.view(mapper,x)).toList();
    }

    @Transactional
    public void change(ScopeContext s,String policyId,Limits input){
        if(input.maxConcurrency()==null||input.maxConcurrency()<1||input.maxConcurrency()>32||
                input.maxRunSeconds()==null||input.maxRunSeconds()<1||input.maxRunSeconds()>180)
            throw new DomainException("INVALID_BUDGET",422,"Invalid concurrency or duration");
        for(Long n:new Long[]{input.maxCalls(),input.maxTokens(),input.maxRunTokens()})
            if(n!=null&&n<0)throw new DomainException("INVALID_BUDGET",422,"Negative limit");
        for(BigDecimal n:new BigDecimal[]{input.maxCost(),input.maxRunCost()})
            if(n!=null&&(n.signum()<0||n.scale()>8||n.precision()-n.scale()>12))
                throw new DomainException("INVALID_BUDGET",422,"Invalid amount");
        var rows=policies(s,true);
        if(rows.stream().noneMatch(x->policyId.equals(x.get("ID"))))throw new DomainException("NOT_FOUND",404,"Policy not found");
        if(jdbc.update("""
                UPDATE BUDGET_POLICY SET MAX_CALLS = ?,MAX_TOKENS = ?,MAX_COST = ?,MAX_CONCURRENCY = ?,
                    MAX_RUN_SECONDS = ?,MAX_RUN_TOKENS = ?,MAX_RUN_COST = ?,UPDATED_AT = ?,UPDATED_BY = ?,ROW_VERSION = ROW_VERSION + 1
                WHERE ID = ? AND TENANT_ID = ? AND ROW_VERSION = ?
                """,input.maxCalls(),input.maxTokens(),input.maxCost(),input.maxConcurrency(),input.maxRunSeconds(),input.maxRunTokens(),
                input.maxRunCost(),time.now(),s.userId(),policyId,s.tenantId(),input.rowVersion())!=1)
            throw new DomainException("VERSION_CONFLICT",409,"Policy changed");
    }

    public record Period(String start,String end) { }
    public static Period period(String now,String kind){
        LocalDate date=TimeCodec.parse(now).atOffset(ZoneOffset.UTC).toLocalDate();
        LocalDate start="MONTH".equals(kind)?date.withDayOfMonth(1):date;
        LocalDate end="MONTH".equals(kind)?start.plusMonths(1):start.plusDays(1);
        return new Period(TimeCodec.format(start.atStartOfDay().toInstant(ZoneOffset.UTC)),TimeCodec.format(end.atStartOfDay().toInstant(ZoneOffset.UTC)));
    }
    private static long number(Map<String,Object> row,String name){return ((Number)row.get(name)).longValue();}
    private static BigDecimal amount(Map<String,Object> row,String name){return new BigDecimal(row.get(name).toString());}
    private static void check(Object limit,BigDecimal used,BigDecimal requested,boolean unknown){
        if(limit==null)return;
        if(requested==null||unknown)throw new DomainException("BUDGET_UNCERTAIN",409,"Cannot establish a safe bound for limited resource");
        if(used.add(requested).compareTo(new BigDecimal(limit.toString()))>0)
            throw new DomainException("BUDGET_EXCEEDED",409,"Budget exceeded");
    }
    private static BigDecimal decimal(Long n){return n==null?null:BigDecimal.valueOf(n);}

    @Transactional
    public void reserve(ScopeContext s,String callId,Long tokenBound,BigDecimal costBound){
        String now=time.now();
        for(var p:policies(s,true)){
            String policy=(String)p.get("ID");
            if(number(p,"INFLIGHT_COUNT")>=number(p,"MAX_CONCURRENCY"))throw new DomainException("CONCURRENCY_LIMIT",409,"Concurrency limit");
            Period period=period(now,(String)p.get("PERIOD_TYPE"));
            jdbc.update("""
                    INSERT INTO BUDGET_BUCKET (ID,TENANT_ID,POLICY_ID,PERIOD_START,PERIOD_END,CREATED_AT,UPDATED_AT)
                    VALUES (?,?,?,?,?,?,?) ON DUPLICATE KEY UPDATE ID = ID
                    """,ids.nextId(),s.tenantId(),policy,period.start(),period.end(),now,now);
            var b=jdbc.queryForMap("""
                    SELECT ID,CONSUMED_CALLS,CONSUMED_TOKENS,CONSUMED_COST,RESERVED_CALLS,RESERVED_TOKENS,RESERVED_COST,UNKNOWN_CALLS
                    FROM BUDGET_BUCKET WHERE TENANT_ID = ? AND POLICY_ID = ? AND PERIOD_START = ? FOR UPDATE
                    """,s.tenantId(),policy,period.start());
            boolean unknown=number(b,"UNKNOWN_CALLS")>0;
            check(p.get("MAX_CALLS"),amount(b,"CONSUMED_CALLS").add(amount(b,"RESERVED_CALLS")),BigDecimal.ONE,false);
            check(p.get("MAX_TOKENS"),amount(b,"CONSUMED_TOKENS").add(amount(b,"RESERVED_TOKENS")),decimal(tokenBound),unknown);
            check(p.get("MAX_COST"),amount(b,"CONSUMED_COST").add(amount(b,"RESERVED_COST")),costBound,unknown);
            check(p.get("MAX_RUN_TOKENS"),BigDecimal.ZERO,decimal(tokenBound),false);
            check(p.get("MAX_RUN_COST"),BigDecimal.ZERO,costBound,false);
            jdbc.update("""
                    INSERT INTO BUDGET_RESERVATION (ID,TENANT_ID,CALL_ID,BUCKET_ID,POLICY_ID,POLICY_REVISION,RESERVED_CALLS,
                        RESERVED_TOKENS,RESERVED_COST,STATE,CREATED_AT,UPDATED_AT)
                    VALUES (?,?,?,?,?,?,1,?,?,'HELD',?,?)
                    """,ids.nextId(),s.tenantId(),callId,b.get("ID"),policy,p.get("ROW_VERSION"),tokenBound,costBound,now,now);
            jdbc.update("""
                    UPDATE BUDGET_BUCKET SET RESERVED_CALLS = RESERVED_CALLS + 1,RESERVED_TOKENS = RESERVED_TOKENS + ?,
                        RESERVED_COST = RESERVED_COST + ?,UPDATED_AT = ? WHERE ID = ?
                    """,tokenBound==null?0:tokenBound,costBound==null?BigDecimal.ZERO:costBound,now,b.get("ID"));
            jdbc.update("UPDATE BUDGET_POLICY SET INFLIGHT_COUNT = INFLIGHT_COUNT + 1,UPDATED_AT = ? WHERE ID = ?",now,policy);
        }
    }

    @Transactional
    public void settle(ScopeContext s,String callId,boolean dispatched,Long tokens,BigDecimal cost){
        String now=time.now();
        // 策略锁始终按 tenant/workspace/project 顺序获取，防止与预占交叉死锁。
        for(var p:policies(s,true)){
            var rows=jdbc.queryForList("""
                    SELECT ID,BUCKET_ID,RESERVED_TOKENS,RESERVED_COST,STATE,CONCURRENCY_RELEASED
                    FROM BUDGET_RESERVATION WHERE TENANT_ID = ? AND CALL_ID = ? AND POLICY_ID = ? FOR UPDATE
                    """,s.tenantId(),callId,p.get("ID"));
            if(rows.isEmpty())continue;
            var x=rows.getFirst();
            if(!"HELD".equals(x.get("STATE")))continue;
            boolean uncertain=dispatched&&(tokens==null||cost==null);
            long freeTokens=(!dispatched||tokens!=null)&&x.get("RESERVED_TOKENS")!=null?number(x,"RESERVED_TOKENS"):0;
            BigDecimal freeCost=(!dispatched||cost!=null)&&x.get("RESERVED_COST")!=null?amount(x,"RESERVED_COST"):BigDecimal.ZERO;
            jdbc.update("""
                    UPDATE BUDGET_BUCKET SET RESERVED_CALLS = RESERVED_CALLS - 1,RESERVED_TOKENS = RESERVED_TOKENS - ?,
                        RESERVED_COST = RESERVED_COST - ?,CONSUMED_CALLS = CONSUMED_CALLS + ?,
                        CONSUMED_TOKENS = CONSUMED_TOKENS + ?,CONSUMED_COST = CONSUMED_COST + ?,
                        UNKNOWN_CALLS = UNKNOWN_CALLS + ?,UPDATED_AT = ? WHERE ID = ?
                    """,freeTokens,freeCost,dispatched?1:0,dispatched&&tokens!=null?tokens:0,
                    dispatched&&cost!=null?cost:BigDecimal.ZERO,uncertain?1:0,now,x.get("BUCKET_ID"));
            jdbc.update("""
                    UPDATE BUDGET_RESERVATION SET ACTUAL_CALLS = ?,ACTUAL_TOKENS = ?,ACTUAL_COST = ?,STATE = ?,
                        CONCURRENCY_RELEASED = TRUE,SETTLED_AT = ?,UPDATED_AT = ? WHERE ID = ? AND STATE = 'HELD'
                    """,dispatched?1:0,dispatched?tokens:Long.valueOf(0),dispatched?cost:BigDecimal.ZERO,
                    !dispatched?"RELEASED":uncertain?"UNCERTAIN":"SETTLED",now,now,x.get("ID"));
            jdbc.update("UPDATE BUDGET_POLICY SET INFLIGHT_COUNT = INFLIGHT_COUNT - 1,UPDATED_AT = ? WHERE ID = ? AND INFLIGHT_COUNT > 0",now,p.get("ID"));
        }
    }

    public List<Map<String,Object>> usage(ScopeContext s,String from,String to,int limit){
        TimeCodec.parse(from);TimeCodec.parse(to);
        if(from.compareTo(to)>=0)throw new DomainException("INVALID_RANGE",422,"Invalid usage range");
        return jdbc.queryForList("""
                SELECT ID,RUN_ID,MODEL_ID,MODEL_TYPE,PROTOCOL_KEY,STATUS,INPUT_TOKENS,OUTPUT_TOKENS,TOTAL_TOKENS,
                    CACHED_TOKENS,REASONING_TOKENS,USAGE_SOURCE,COST_AMOUNT,COST_CURRENCY,COST_SOURCE,CREATED_AT,FINISHED_AT
                FROM RT_MODEL_CALL WHERE TENANT_ID = ? AND WORKSPACE_ID = ? AND PROJECT_ID = ? AND CREATED_AT >= ? AND CREATED_AT < ?
                ORDER BY CREATED_AT DESC,ID DESC LIMIT ?
                """,s.tenantId(),s.workspaceId(),s.requireProject(),from,to,Math.max(1,Math.min(100,limit)))
                .stream().map(x->JsonData.view(mapper,x)).toList();
    }
}
