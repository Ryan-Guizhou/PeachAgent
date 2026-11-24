package com.peachsoft.peachagent.runtime;

import com.peachsoft.peachagent.common.*;
import com.peachsoft.peachagent.iam.*;
import com.peachsoft.peachagent.model.*;
import com.peachsoft.peachagent.studio.*;
import com.peachsoft.peachagent.metering.BudgetService;
import com.peachsoft.peachagent.runtime.lease.LeaseFence;
import com.peachsoft.peachagent.common.pagination.PageCursor;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.nio.charset.StandardCharsets;
import java.util.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.ResultSetExtractor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.transaction.support.TransactionCallback;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.dao.ConcurrencyFailureException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import tools.jackson.databind.json.JsonMapper;

/** 持久 Run 状态机。外部推理始终在事务之外，派发意图与预算先落库。 */
@Service
public class RunService {
    private static final Logger log=LoggerFactory.getLogger(RunService.class);
    private final JdbcTemplate jdbc;
    private final IdGenerator ids;
    private final DatabaseTimeProvider time;
    private final IdentityService identity;
    private final ConversationService chat;
    private final PromptService prompts;
    private final ModelService models;
    private final BudgetService budgets;
    private final JsonMapper mapper;
    private final TransactionTemplate tx;
    private final ArtifactStore artifacts;
    public RunService(JdbcTemplate jdbc,IdGenerator ids,DatabaseTimeProvider time,IdentityService identity,
            ConversationService chat,PromptService prompts,ModelService models,BudgetService budgets,
            JsonMapper mapper,TransactionTemplate tx,ArtifactStore artifacts){
        this.jdbc=jdbc;this.ids=ids;this.time=time;this.identity=identity;this.chat=chat;this.prompts=prompts;
        this.models=models;this.budgets=budgets;this.mapper=mapper;this.artifacts=artifacts;
        // 只调整 Runtime 短事务，不改变 IAM、配置及其他模块的事务隔离。
        this.tx=new TransactionTemplate(tx.getTransactionManager());
        this.tx.setIsolationLevel(TransactionDefinition.ISOLATION_READ_COMMITTED);
    }
    public record ChatInput(String modelId,String text,String promptVersionId,Map<String,Object> variables,Integer maxOutputTokens) { }
    public record DebugInput(Map<String,Object> input,String audioBase64,Integer maxOutputTokens) { }
    public record Payload(ModelService.Snapshot model,List<ModelExecutionRequest.Message> messages,Map<String,Object> input,
                          String inputArtifactId,String promptVersionId,Map<String,Object> variables,int maxOutputTokens) { }
    public record Claim(String id,ScopeContext scope,long epoch,String owner,Payload payload,String runType) { }
    private static final String PROJECTION="ID,RUN_TYPE,TRACE_ID,CONVERSATION_ID,USER_MESSAGE_ID,ASSISTANT_MESSAGE_ID,RETRY_OF_RUN_ID,STATUS,QUEUED_AT,STARTED_AT,DEADLINE_AT,CANCEL_REQUESTED_AT,FINISHED_AT,ERROR_CODE,ERROR_SUMMARY,CREATED_AT,UPDATED_AT";
    private static final Set<String> TERMINAL=Set.of("SUCCEEDED","FAILED","CANCELLED","INTERRUPTED");
    private static long n(Map<String,Object> m,String k){return ((Number)m.get(k)).longValue();}
    private static String str(Map<String,Object> m,String k){return (String)m.get(k);}
    private static DomainException conflict(String code,String msg){return new DomainException(code,409,msg);}
    private String json(Object x){return mapper.writeValueAsString(x);}
    private void tenantLock(ScopeContext s){
        jdbc.queryForObject("SELECT ID FROM IAM_TENANT WHERE ID = ? FOR UPDATE",String.class,s.tenantId());
        identity.assertCurrentScope(s);
    }

    /** 所有产生子表记录的 Runtime 事务先获取租户父行共享锁，再锁 Run/Call/预算；受理及归档仍用排他锁。 */
    private void tenantShare(String tenantId){
        jdbc.queryForObject("SELECT ID FROM IAM_TENANT WHERE ID = ? FOR SHARE",String.class,tenantId);
    }

    /** 受理事务明确回滚才重试；原幂等键及摘要不变，不进行任何外部派发。 */
    private <T> T createTransaction(TransactionCallback<T> callback){
        for(int attempt=1;;attempt++){
            try{return tx.execute(callback);}
            catch(ConcurrencyFailureException ex){
                if(attempt>=3)throw new DomainException("RUN_BUSY",409,"Run admission busy; retry with the same idempotency key");
                log.warn("Run admission transaction retry attempt={} type={}",attempt,ex.getClass().getSimpleName());
                try{Thread.sleep(15L*attempt);}
                catch(InterruptedException interrupted){
                    Thread.currentThread().interrupt();
                    throw new DomainException("RUN_BUSY",409,"Run admission interrupted");
                }
            }
        }
    }
    private Map<String,Object> row(String id,boolean lock){
        var rows=jdbc.queryForList("SELECT * FROM RT_RUN WHERE ID = ?"+(lock?" FOR UPDATE":""),id);
        if(rows.isEmpty())throw IdentityService.missing();return rows.getFirst();
    }
    private Map<String,Object> scoped(ScopeContext s,String id,boolean lock){
        var rows=jdbc.queryForList("SELECT * FROM RT_RUN WHERE TENANT_ID = ? AND WORKSPACE_ID = ? AND PROJECT_ID = ? AND ACTOR_USER_ID = ? AND ID = ?"+(lock?" FOR UPDATE":""),
                s.tenantId(),s.workspaceId(),s.requireProject(),s.userId(),id);
        if(rows.isEmpty())throw IdentityService.missing();return rows.getFirst();
    }
    private Map<String,Object> view(Map<String,Object> row){
        Map<String,Object> result=new LinkedHashMap<>();
        for(String k:PROJECTION.split(","))result.put(k,row.get(k));
        return JsonData.view(mapper,result);
    }
    public Map<String,Object> get(ScopeContext s,String id){return view(scoped(s,id,false));}
    public List<Map<String,Object>> list(ScopeContext s,String before,int limit){
        return list(s,before,null,limit);
    }

    /** 同秒多条记录使用 ID 严格分页，避免重复或遗漏。 */
    public List<Map<String,Object>> list(ScopeContext s,String before,String beforeId,int limit){
        PageCursor cursor=PageCursor.of(before,beforeId);
        String sql="SELECT "+PROJECTION+" FROM RT_RUN WHERE TENANT_ID = ? AND WORKSPACE_ID = ? AND PROJECT_ID = ? AND ACTOR_USER_ID = ?";
        List<Object> args=new ArrayList<>(List.of(s.tenantId(),s.workspaceId(),s.requireProject(),s.userId()));
        if(cursor.hasTieBreaker()){
            sql+=" AND (CREATED_AT < ? OR (CREATED_AT = ? AND ID < ?))";
            args.add(cursor.time());args.add(cursor.time());args.add(cursor.id());
        }else if(cursor.time()!=null){
            sql+=" AND CREATED_AT <= ?";
            args.add(cursor.time());
        }else{
            sql+=" AND CREATED_AT <= DATE_FORMAT(UTC_TIMESTAMP(), '%Y%m%d%H%i%s')";
        }
        args.add(Math.max(1,Math.min(limit,100)));
        ResultSetExtractor<List<Map<String,Object>>> projection=JsonData::readRows;
        return jdbc.query(sql+" ORDER BY CREATED_AT DESC,ID DESC LIMIT ?",projection,args.toArray());
    }
    /** 同一个 Run 状态快照的事件高水位，只有全部交付后才允许关闭终态流。 */
    public record EventPage(List<Map<String,Object>> events,boolean terminal,long lastSequence) {
        public boolean drained(long deliveredSequence){
            return terminal && deliveredSequence >= lastSequence;
        }
    }

    public EventPage eventPage(ScopeContext s,String id,long after,long authEpoch){
        // 每轮同时验证认证纪元、完整资源归属及事件高水位；无跨请求权限缓存。
        var rows=jdbc.queryForList("""
                SELECT R.STATUS,R.NEXT_EVENT_SEQ FROM RT_RUN R
                JOIN IAM_USER U ON U.ID = R.ACTOR_USER_ID AND U.STATUS = 'ACTIVE'
                JOIN IAM_TENANT T ON T.ID = R.TENANT_ID AND T.OWNER_USER_ID = U.ID AND T.STATUS = 'ACTIVE'
                JOIN IAM_WORKSPACE W ON W.TENANT_ID = T.ID AND W.ID = R.WORKSPACE_ID AND W.STATUS = 'ACTIVE'
                JOIN IAM_PROJECT P ON P.TENANT_ID = T.ID AND P.WORKSPACE_ID = W.ID
                    AND P.ID = R.PROJECT_ID AND P.STATUS = 'ACTIVE'
                WHERE R.TENANT_ID = ? AND R.WORKSPACE_ID = ? AND R.PROJECT_ID = ?
                  AND R.ACTOR_USER_ID = ? AND R.ID = ? AND U.AUTH_EPOCH = ?
                """,s.tenantId(),s.workspaceId(),s.requireProject(),s.userId(),id,authEpoch);
        if(rows.isEmpty())throw IdentityService.missing();
        var row=rows.getFirst();
        long lastSequence=n(row,"NEXT_EVENT_SEQ")-1;
        boolean terminal=TERMINAL.contains(row.get("STATUS"));
        if(after>=lastSequence)return new EventPage(List.of(),terminal,lastSequence);
        var events=jdbc.queryForList("""
                SELECT SEQ,EVENT_TYPE,PAYLOAD,CREATED_AT FROM RT_RUN_EVENT
                WHERE TENANT_ID = ? AND WORKSPACE_ID = ? AND PROJECT_ID = ? AND RUN_ID = ?
                AND SEQ > ? AND SEQ <= ? ORDER BY SEQ LIMIT 100
                """,s.tenantId(),s.workspaceId(),s.requireProject(),id,Math.max(0,after),lastSequence)
                .stream().map(x->JsonData.view(mapper,x,"PAYLOAD")).toList();
        return new EventPage(events,terminal,lastSequence);
    }
    private Map<String,Object> existing(ScopeContext s,String key,byte[] hash){
        if(key==null||!key.matches("[A-Za-z0-9._-]{1,80}"))throw new DomainException("IDEMPOTENCY_REQUIRED",422,"Idempotency-Key required");
        var rows=jdbc.queryForList("""
                SELECT * FROM RT_RUN WHERE TENANT_ID = ? AND WORKSPACE_ID = ? AND PROJECT_ID = ? AND ACTOR_USER_ID = ? AND IDEMPOTENCY_KEY = ?
                """,s.tenantId(),s.workspaceId(),s.requireProject(),s.userId(),key);
        if(rows.isEmpty())return null;
        var old=rows.getFirst();
        if(!Arrays.equals((byte[])old.get("REQUEST_HASH"),hash))throw conflict("IDEMPOTENCY_CONFLICT","Key already used for another request");
        return view(old);
    }
    private void queueLimit(ScopeContext s){
        var counts=jdbc.queryForMap("""
                SELECT COUNT(*) AS TOTAL_COUNT,COALESCE(SUM(PROJECT_ID = ?),0) AS PROJECT_COUNT
                FROM RT_RUN WHERE TENANT_ID = ? AND STATUS IN ('QUEUED','RUNNING','CANCEL_REQUESTED')
                """,s.requireProject(),s.tenantId());
        if(n(counts,"TOTAL_COUNT")>=128||n(counts,"PROJECT_COUNT")>=32)throw conflict("QUEUE_FULL","Run queue full");
    }
    private int output(ModelService.Snapshot m,Integer requested){
        int max=m.options().get("maxOutputTokens") instanceof Number n?Math.min(32768,n.intValue()):2048;
        int actual=requested==null?max:requested;
        if(actual<1||actual>max)throw new DomainException("INVALID_LIMIT",422,"Output limit exceeds configured model limit");
        return actual;
    }
    private long size(String text){return text==null?0:text.getBytes(StandardCharsets.UTF_8).length;}
    private List<ModelExecutionRequest.Message> context(ScopeContext s,String conversation,String system,String user,int output,ModelService.Snapshot model){
        long cap=model.options().get("contextWindow") instanceof Number n?Math.min(65536,n.longValue()):8192;
        long used=size(system)+size(user)+32+output;
        if(used>cap)throw new DomainException("CONTEXT_LIMIT",422,"Latest input exceeds conservative context limit");
        var past=jdbc.queryForList("""
                SELECT U.CONTENT AS USER_CONTENT,A.CONTENT AS ASSISTANT_CONTENT FROM CHAT_MESSAGE U
                JOIN CHAT_MESSAGE A ON A.ID = U.PREFERRED_REPLY_ID AND A.CONVERSATION_ID = U.CONVERSATION_ID
                WHERE U.TENANT_ID = ? AND U.WORKSPACE_ID = ? AND U.PROJECT_ID = ? AND U.CONVERSATION_ID = ?
                  AND U.ROLE = 'USER' AND U.STATUS = 'COMPLETE' AND A.STATUS = 'COMPLETE'
                ORDER BY U.SEQ DESC LIMIT 100
                """,s.tenantId(),s.workspaceId(),s.requireProject(),conversation);
        List<ModelExecutionRequest.Message> history=new ArrayList<>();
        for(var item:past){
            String u=str(item,"USER_CONTENT"),a=str(item,"ASSISTANT_CONTENT");long cost=size(u)+size(a)+32;
            if(used+cost>cap)break;
            used+=cost;history.addFirst(new ModelExecutionRequest.Message("assistant",a));history.addFirst(new ModelExecutionRequest.Message("user",u));
        }
        if(system!=null&&!system.isEmpty())history.addFirst(new ModelExecutionRequest.Message("system",system));
        history.add(new ModelExecutionRequest.Message("user",user));return List.copyOf(history);
    }
    public Map<String,Object> submit(ScopeContext s,String conversation,ChatInput input,String key){
        JsonData.requiredText(input.text(),65536);
        if(size(input.text())>65536)throw new DomainException("INVALID_FIELD",422,"Input exceeds 64 KiB");
        byte[] hash=SecurityTokens.digest("CHAT:"+conversation+":"+json(input));
        return createTransaction(status->{
            tenantLock(s);var old=existing(s,key,hash);if(old!=null)return old;queueLimit(s);
            var c=chat.require(s,conversation,true);
            if(!"ACTIVE".equals(c.get("STATUS"))||c.get("ACTIVE_RUN_ID")!=null)throw conflict("CONVERSATION_BUSY","Conversation unavailable or active");
            var model=models.snapshot(s,input.modelId(),false);
            if(!"CHAT".equals(model.operation()))throw new DomainException("MODEL_TYPE_INVALID",422,"Chat model required");
            String system=prompts.renderVersion(s,input.promptVersionId(),input.variables());
            int max=output(model,input.maxOutputTokens());
            var payload=new Payload(model,context(s,conversation,system,input.text(),max,model),Map.of(),null,input.promptVersionId(),input.variables(),max);
            String now=time.now(),uid=ids.nextId(),aid=ids.nextId(),id=ids.nextId();long seq=n(c,"NEXT_MESSAGE_SEQ");
            message(s,conversation,uid,seq,"USER",input.text(),"COMPLETE",null,now);
            message(s,conversation,aid,seq+1,"ASSISTANT","","PENDING",uid,now);
            insert(s,id,"CHAT",conversation,uid,aid,null,key,hash,payload,now);
            jdbc.update("UPDATE CHAT_CONVERSATION SET ACTIVE_RUN_ID = ?,NEXT_MESSAGE_SEQ = NEXT_MESSAGE_SEQ + 2,SELECTED_MODEL_ID = ?,SELECTED_PROMPT_VERSION_ID = ?,LAST_MESSAGE_AT = ?,UPDATED_AT = ?,ROW_VERSION = ROW_VERSION + 1 WHERE ID = ?",
                    id,model.modelId(),input.promptVersionId(),now,now,conversation);
            return view(row(id,false));
        });
    }
    public Map<String,Object> debug(ScopeContext s,String modelId,DebugInput input,String key){
        Map<String,Object> values=input.input()==null?Map.of():input.input();
        if(json(values).length()>65536)throw new DomainException("INVALID_FIELD",422,"Debug input too large");
        byte[] hash=SecurityTokens.digest("DEBUG:"+modelId+":"+json(input));
        return createTransaction(status->{
            tenantLock(s);var old=existing(s,key,hash);if(old!=null)return old;queueLimit(s);
            var model=models.snapshot(s,modelId,true);int max=output(model,input.maxOutputTokens());String now=time.now(),id=ids.nextId();
            List<ModelExecutionRequest.Message> messages="CHAT".equals(model.operation())?List.of(new ModelExecutionRequest.Message("user",JsonData.requiredText((String)values.get("text"),65536))):List.of();
            String artifactId="TRANSCRIBE".equals(model.operation())?ids.nextId():null;
            var payload=new Payload(model,messages,values,artifactId,null,Map.of(),max);
            insert(s,id,"MODEL_DEBUG",null,null,null,null,key,hash,payload,now);
            if(artifactId!=null)artifacts.input(s,id,artifactId,input.audioBase64());
            return view(row(id,false));
        });
    }
    public Map<String,Object> retry(ScopeContext s,String id,String key,boolean acknowledgeUnknown){
        byte[] hash=SecurityTokens.digest("RETRY:"+id+":"+acknowledgeUnknown);
        return createTransaction(status->{
            tenantLock(s);var old=existing(s,key,hash);if(old!=null)return old;queueLimit(s);
            var prior=scoped(s,id,false);
            if(!"CHAT".equals(prior.get("RUN_TYPE"))||!TERMINAL.contains(prior.get("STATUS"))||prior.get("REQUEST_SNAPSHOT")==null)
                throw conflict("RETRY_NOT_ALLOWED","Only retained terminal chat runs can be retried");
            String conversation=str(prior,"CONVERSATION_ID"),uid=str(prior,"USER_MESSAGE_ID");
            var c=chat.require(s,conversation,true);
            if(!"ACTIVE".equals(c.get("STATUS"))||c.get("ACTIVE_RUN_ID")!=null)throw conflict("CONVERSATION_BUSY","Conversation unavailable or active");
            String latest=jdbc.queryForObject("SELECT ID FROM CHAT_MESSAGE WHERE CONVERSATION_ID = ? AND ROLE = 'USER' ORDER BY SEQ DESC LIMIT 1",String.class,conversation);
            if(!uid.equals(latest))throw conflict("RETRY_NOT_LATEST","Only latest turn can be retried");
            Integer unknown=jdbc.queryForObject("SELECT COUNT(*) FROM RT_MODEL_CALL WHERE RUN_ID = ? AND STATUS = 'UNKNOWN'",Integer.class,id);
            if(unknown>0&&!acknowledgeUnknown)throw conflict("RETRY_ACK_REQUIRED","Previous charge may be unknown");
            Payload payload=mapper.readValue(prior.get("REQUEST_SNAPSHOT").toString(),Payload.class);
            models.snapshot(s,payload.model().modelId(),false);
            String now=time.now(),rid=ids.nextId(),aid=ids.nextId();
            message(s,conversation,aid,n(c,"NEXT_MESSAGE_SEQ"),"ASSISTANT","","PENDING",uid,now);
            insert(s,rid,"CHAT",conversation,uid,aid,id,key,hash,payload,now);
            jdbc.update("UPDATE CHAT_CONVERSATION SET ACTIVE_RUN_ID = ?,NEXT_MESSAGE_SEQ = NEXT_MESSAGE_SEQ + 1,UPDATED_AT = ?,ROW_VERSION = ROW_VERSION + 1 WHERE ID = ?",rid,now,conversation);
            return view(row(rid,false));
        });
    }
    private void message(ScopeContext s,String conversation,String id,long seq,String role,String content,String status,String reply,String now){
        jdbc.update("""
                INSERT INTO CHAT_MESSAGE (ID,TENANT_ID,WORKSPACE_ID,PROJECT_ID,CONVERSATION_ID,SEQ,ROLE,CONTENT,STATUS,REPLY_TO_MESSAGE_ID,CREATED_AT,UPDATED_AT,CREATED_BY,UPDATED_BY)
                VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)
                """,id,s.tenantId(),s.workspaceId(),s.requireProject(),conversation,seq,role,content,status,reply,now,now,s.userId(),s.userId());
    }
    private void insert(ScopeContext s,String id,String type,String conversation,String uid,String aid,String retry,String key,byte[] hash,Payload p,String now){
        int seconds=Math.min(180,budgets.deadlineSeconds(s));
        jdbc.update("""
                INSERT INTO RT_RUN (ID,TENANT_ID,WORKSPACE_ID,PROJECT_ID,ACTOR_USER_ID,RUN_TYPE,TRACE_ID,CONVERSATION_ID,USER_MESSAGE_ID,ASSISTANT_MESSAGE_ID,
                    RETRY_OF_RUN_ID,IDEMPOTENCY_KEY,REQUEST_HASH,STATUS,REQUEST_SNAPSHOT,LIMIT_SNAPSHOT,QUEUED_AT,DEADLINE_AT,CREATED_AT,UPDATED_AT,CREATED_BY,UPDATED_BY)
                VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,'QUEUED',?,?,?,?,?,?,?,?)
                """,id,s.tenantId(),s.workspaceId(),s.requireProject(),s.userId(),type,ids.nextId().replace("-",""),conversation,uid,aid,retry,key,hash,
                json(p),json(Map.of("maxRunSeconds",seconds,"maxOutputTokens",p.maxOutputTokens())),now,TimeCodec.plusSeconds(now,seconds),now,now,s.userId(),s.userId());
        event(row(id,true),"status",Map.of("status","QUEUED"),now);
    }
    private void event(Map<String,Object> r,String type,Object payload,String now){
        jdbc.update("""
                INSERT INTO RT_RUN_EVENT (ID,TENANT_ID,WORKSPACE_ID,PROJECT_ID,RUN_ID,SEQ,EVENT_TYPE,PAYLOAD,CREATED_AT)
                VALUES (?,?,?,?,?,?,?,?,?)
                """,ids.nextId(),r.get("TENANT_ID"),r.get("WORKSPACE_ID"),r.get("PROJECT_ID"),r.get("ID"),n(r,"NEXT_EVENT_SEQ"),type,json(payload),now);
        jdbc.update("UPDATE RT_RUN SET NEXT_EVENT_SEQ = NEXT_EVENT_SEQ + 1 WHERE ID = ?",r.get("ID"));
    }
    private ScopeContext scope(Map<String,Object> r){return new ScopeContext(str(r,"ACTOR_USER_ID"),str(r,"TENANT_ID"),str(r,"WORKSPACE_ID"),str(r,"PROJECT_ID"));}
    public Claim claim(String owner){
        return tx.execute(status->{
            String now=time.now();
            // 先无锁找候选，再按租户父行 -> Run 顺序领取，避免队列扫描锁阻塞新受理。
            var candidates=jdbc.queryForList("""
                    SELECT ID,TENANT_ID FROM RT_RUN WHERE STATUS = 'QUEUED' AND DEADLINE_AT > ? ORDER BY QUEUED_AT,ID LIMIT 1
                    """,now);
            if(candidates.isEmpty())return null;
            var candidate=candidates.getFirst();
            tenantShare(str(candidate,"TENANT_ID"));
            var rows=jdbc.queryForList("""
                    SELECT * FROM RT_RUN WHERE ID = ? AND STATUS = 'QUEUED' AND DEADLINE_AT > ? FOR UPDATE SKIP LOCKED
                    """,candidate.get("ID"),time.now());
            if(rows.isEmpty())return null;
            var r=rows.getFirst();long epoch=n(r,"LEASE_EPOCH")+1;String id=str(r,"ID");
            jdbc.update("""
                    UPDATE RT_RUN SET STATUS = 'RUNNING',LEASE_OWNER = ?,LEASE_EPOCH = ?,LEASE_UNTIL = ?,HEARTBEAT_AT = ?,STARTED_AT = ?,UPDATED_AT = ? WHERE ID = ?
                    """,owner,epoch,TimeCodec.plusSeconds(now,30),now,now,now,id);
            event(r,"status",Map.of("status","RUNNING"),now);
            return new Claim(id,scope(r),epoch,owner,mapper.readValue(r.get("REQUEST_SNAPSHOT").toString(),Payload.class),str(r,"RUN_TYPE"));
        });
    }
    /** 持有同一代租约且尚未过期，才允许变更运行事实。 */
    private boolean owned(Map<String,Object> r,Claim c,String now){
        return !TERMINAL.contains(r.get("STATUS"))
                && LeaseFence.isCurrent(c.owner(),c.epoch(),str(r,"LEASE_OWNER"),n(r,"LEASE_EPOCH"),str(r,"LEASE_UNTIL"),now);
    }
    private void ensure(Map<String,Object> r,Claim c){
        String now=time.now();
        if(!owned(r,c,now)||!"RUNNING".equals(r.get("STATUS"))||str(r,"DEADLINE_AT").compareTo(now)<=0)
            throw conflict("RUN_STOPPED","Run no longer dispatchable");
    }
    public boolean heartbeat(Claim c){
        String now=time.now();
        return jdbc.update("""
                UPDATE RT_RUN SET HEARTBEAT_AT = ?,LEASE_UNTIL = ? WHERE ID = ? AND LEASE_OWNER = ? AND LEASE_EPOCH = ? AND STATUS = 'RUNNING' AND DEADLINE_AT > ? AND LEASE_UNTIL > ?
                """,now,TimeCodec.plusSeconds(now,30),c.id(),c.owner(),c.epoch(),now,now)==1;
    }
    public String startCall(Claim c,long credentialRevision){
        return tx.execute(status->{
            tenantShare(c.scope().tenantId());
            var r=row(c.id(),true);ensure(r,c);identity.assertCurrentScope(c.scope());
            if(c.payload().promptVersionId()!=null)prompts.renderVersion(c.scope(),c.payload().promptVersionId(),c.payload().variables());
            var p=c.payload().model();String id=ids.nextId(),now=time.now();ScopeContext s=c.scope();
            jdbc.update("""
                    INSERT INTO RT_MODEL_CALL (ID,TENANT_ID,WORKSPACE_ID,PROJECT_ID,RUN_ID,ATTEMPT_NO,MODEL_ID,PROVIDER_ID,CREDENTIAL_ID,CREDENTIAL_REVISION,MODEL_TYPE,
                        PROTOCOL_KEY,PROTOCOL_VERSION,ADAPTER_KEY,ADAPTER_VERSION,MODEL_SNAPSHOT,PRICE_SNAPSHOT,TRACE_ID,SPAN_ID,STATUS,USAGE_SOURCE,COST_CURRENCY,COST_SOURCE,CREATED_AT,UPDATED_AT,CREATED_BY,UPDATED_BY)
                    VALUES (?,?,?,?,?,1,?,?,?,?,?,?,?,?,?,?,?,?,?,'PREPARED','UNKNOWN',?,'UNKNOWN',?,?,?,?)
                    """,id,s.tenantId(),s.workspaceId(),s.requireProject(),c.id(),p.modelId(),p.providerId(),p.credentialId(),credentialRevision,p.modelType(),
                    p.protocol().key(),p.protocol().version(),p.adapterKey(),p.adapterVersion(),json(p),json(p.pricing()),r.get("TRACE_ID"),
                    ids.nextId().replace("-","").substring(16),p.currency(),now,now,s.userId(),s.userId());
            // 无可靠供应商 Token 上限时不假设可严格封顶。固定按次价格可建立金额上限。
            BigDecimal bound=p.pricing().keySet().stream().allMatch(k->Set.of("currency","perRequest").contains(k))?price(p.pricing(),"perRequest"):null;
            budgets.reserve(s,id,null,bound);
            return id;
        });
    }
    public void dispatch(Claim c,String call){
        tx.executeWithoutResult(status->{
            tenantShare(c.scope().tenantId());
            var r=row(c.id(),true);ensure(r,c);identity.assertCurrentScope(c.scope());String now=time.now();
            if(jdbc.update("UPDATE RT_MODEL_CALL SET STATUS = 'DISPATCHING',DISPATCH_INTENT_AT = ?,UPDATED_AT = ? WHERE ID = ? AND RUN_ID = ? AND STATUS = 'PREPARED'",now,now,call,c.id())!=1)
                throw conflict("CALL_STATE","Call already dispatched");
        });
    }
    public void delta(Claim c,String call,String text){
        if(text.isEmpty())return;
        tx.executeWithoutResult(status->{
            tenantShare(c.scope().tenantId());
            var r=row(c.id(),true);ensure(r,c);String now=time.now();
            jdbc.update("UPDATE RT_MODEL_CALL SET FIRST_TOKEN_AT = COALESCE(FIRST_TOKEN_AT,?),UPDATED_AT = ? WHERE ID = ? AND RUN_ID = ?",now,now,call,c.id());
            if(r.get("ASSISTANT_MESSAGE_ID")!=null)jdbc.update("UPDATE CHAT_MESSAGE SET CONTENT = CONCAT(COALESCE(CONTENT,''),?),UPDATED_AT = ? WHERE ID = ?",text,now,r.get("ASSISTANT_MESSAGE_ID"));
            event(r,"delta",Map.of("text",text),now);
        });
    }
    private static BigDecimal price(Map<String,Object> p,String key){return p.get(key)==null?null:new BigDecimal(p.get(key).toString());}
    private static BigDecimal cost(ModelService.Snapshot p,ModelExecution.Usage usage){
        if(p.pricing().isEmpty()||!p.pricing().keySet().stream().allMatch(k->Set.of("currency","perRequest","inputPerMillion","outputPerMillion").contains(k)))return null;
        BigDecimal total=BigDecimal.ZERO;boolean known=false;
        for(String key:List.of("perRequest","inputPerMillion","outputPerMillion")){
            BigDecimal rate=price(p.pricing(),key);if(rate==null)continue;known=true;
            if("perRequest".equals(key))total=total.add(rate);
            else{
                Long tokens="inputPerMillion".equals(key)?usage.inputTokens():usage.outputTokens();if(tokens==null)return null;
                total=total.add(rate.multiply(BigDecimal.valueOf(tokens)).movePointLeft(6));
            }
        }
        return known?total.setScale(8,RoundingMode.CEILING):null;
    }
    public void finish(Claim c,String call,ModelExecution result,String failure,long elapsed){
        tx.executeWithoutResult(status->{
            tenantShare(c.scope().tenantId());
            var r=row(c.id(),true);
            String now=time.now();
            if(!owned(r,c,now))return;
            boolean cancelled="CANCEL_REQUESTED".equals(r.get("STATUS"));
            String state=cancelled?"CANCELLED":result!=null?"SUCCEEDED":"FAILED";
            if(call!=null){
                var cr=jdbc.queryForMap("SELECT STATUS,DISPATCH_INTENT_AT FROM RT_MODEL_CALL WHERE ID = ? AND RUN_ID = ? FOR UPDATE",call,c.id());
                boolean sent=cr.get("DISPATCH_INTENT_AT")!=null;
                var usage=result==null||result.usage()==null?ModelExecution.Usage.unknown():result.usage();
                BigDecimal cost=result==null?null:cost(c.payload().model(),usage);
                String callState=result!=null?"SUCCEEDED":sent?"UNKNOWN":cancelled?"CANCELLED":"FAILED";
                jdbc.update("""
                        UPDATE RT_MODEL_CALL SET STATUS = ?,FINISHED_AT = ?,DURATION_MS = ?,INPUT_TOKENS = ?,OUTPUT_TOKENS = ?,TOTAL_TOKENS = ?,CACHED_TOKENS = ?,
                            REASONING_TOKENS = ?,USAGE_DETAIL = ?,USAGE_SOURCE = ?,COST_AMOUNT = ?,COST_SOURCE = ?,PROVIDER_REQUEST_ID = ?,ERROR_CODE = ?,UPDATED_AT = ?
                        WHERE ID = ? AND RUN_ID = ?
                        """,callState,now,Math.max(0,elapsed),usage.inputTokens(),usage.outputTokens(),usage.totalTokens(),usage.cachedTokens(),usage.reasoningTokens(),
                        json(usage.detail()),usage.source(),cost,cost==null?"UNKNOWN":"ESTIMATED",result==null?null:result.providerRequestId(),failure,now,call,c.id());
                // 模型诊断的版本更新先于预算策略锁，避免与并发插入调用的模型 FK 锁形成逆序。
                if(result!=null&&!cancelled&&"MODEL_DEBUG".equals(c.runType()))
                    models.markVerified(c.scope(),c.payload().model(),credentialRevision(call));
                budgets.settle(c.scope(),call,sent,usage.totalTokens(),cost);
                if(result!=null&&!cancelled){
                    Map<String,Object> payload=new LinkedHashMap<>(result.result()==null?Map.of():result.result());
                    if(result.artifact()!=null)payload.put("artifactId",artifacts.output(c.scope(),c.id(),call,result.artifact(),result.mimeType()));
                    event(row(c.id(),true),"result",payload,now);
                }
            }
            terminal(r,state,failure,now,result==null?null:result.result());
        });
    }
    private long credentialRevision(String call){return jdbc.queryForObject("SELECT CREDENTIAL_REVISION FROM RT_MODEL_CALL WHERE ID = ?",Long.class,call);}
    private void terminal(Map<String,Object> r,String state,String code,String now,Map<String,Object> result){
        jdbc.update("""
                UPDATE RT_RUN SET STATUS = ?,FINISHED_AT = ?,ERROR_CODE = ?,LEASE_OWNER = NULL,LEASE_UNTIL = NULL,UPDATED_AT = ?,ROW_VERSION = ROW_VERSION + 1 WHERE ID = ?
                """,state,now,code,now,r.get("ID"));
        if(r.get("ASSISTANT_MESSAGE_ID")!=null){
            Object content=result==null?null:result.get("text");
            jdbc.update("UPDATE CHAT_MESSAGE SET STATUS = ?,CONTENT = COALESCE(?,CONTENT),FINISHED_AT = ?,UPDATED_AT = ? WHERE ID = ?",
                    "SUCCEEDED".equals(state)?"COMPLETE":"CANCELLED".equals(state)?"CANCELLED":"ERROR",content,now,now,r.get("ASSISTANT_MESSAGE_ID"));
            if("SUCCEEDED".equals(state))jdbc.update("UPDATE CHAT_MESSAGE SET PREFERRED_REPLY_ID = ?,UPDATED_AT = ? WHERE ID = ?",r.get("ASSISTANT_MESSAGE_ID"),now,r.get("USER_MESSAGE_ID"));
            jdbc.update("UPDATE CHAT_CONVERSATION SET ACTIVE_RUN_ID = NULL,LAST_MESSAGE_AT = ?,UPDATED_AT = ?,ROW_VERSION = ROW_VERSION + 1 WHERE ID = ? AND ACTIVE_RUN_ID = ?",
                    now,now,r.get("CONVERSATION_ID"),r.get("ID"));
        }
        Map<String,Object> payload=new LinkedHashMap<>();payload.put("status",state);payload.put("errorCode",code);
        event(row(str(r,"ID"),true),"terminal",payload,now);
    }
    public Map<String,Object> cancel(ScopeContext s,String id){
        return tx.execute(status->{
            tenantShare(s.tenantId());identity.assertCurrentScope(s);
            var r=scoped(s,id,true);String now=time.now();
            if("QUEUED".equals(r.get("STATUS")))terminal(r,"CANCELLED",null,now,null);
            else if("RUNNING".equals(r.get("STATUS"))){
                jdbc.update("UPDATE RT_RUN SET STATUS = 'CANCEL_REQUESTED',CANCEL_REQUESTED_AT = ?,UPDATED_AT = ? WHERE ID = ?",now,now,id);
                event(r,"status",Map.of("status","CANCEL_REQUESTED"),now);
            }
            return view(row(id,false));
        });
    }
    public void recover(){
        String cutoff=time.now();
        for(var candidate:jdbc.queryForList("""
                SELECT ID,TENANT_ID FROM RT_RUN WHERE (STATUS = 'QUEUED' AND DEADLINE_AT <= ?) OR
                (STATUS IN ('RUNNING','CANCEL_REQUESTED') AND LEASE_UNTIL <= ?) LIMIT 32
                """,cutoff,cutoff)){
            tx.executeWithoutResult(status->{
                tenantShare(str(candidate,"TENANT_ID"));
                String id=str(candidate,"ID");
                var r=row(id,true);String now=time.now();
                if(TERMINAL.contains(r.get("STATUS")))return;
                boolean queued="QUEUED".equals(r.get("STATUS"));
                if((queued?str(r,"DEADLINE_AT"):str(r,"LEASE_UNTIL")).compareTo(now)>0)return;
                var calls=jdbc.queryForList("SELECT ID,DISPATCH_INTENT_AT FROM RT_MODEL_CALL WHERE RUN_ID = ? AND STATUS IN ('PREPARED','DISPATCHING') FOR UPDATE",id);
                for(var call:calls){
                    boolean sent=call.get("DISPATCH_INTENT_AT")!=null;
                    jdbc.update("UPDATE RT_MODEL_CALL SET STATUS = ?,FINISHED_AT = ?,ERROR_CODE = 'WORKER_INTERRUPTED',UPDATED_AT = ? WHERE ID = ?",
                            sent?"UNKNOWN":"CANCELLED",now,now,call.get("ID"));
                    budgets.settle(scope(r),str(call,"ID"),sent,null,null);
                }
                terminal(r,"INTERRUPTED",queued?"QUEUE_DEADLINE":"WORKER_INTERRUPTED",now,null);
            });
        }
    }
}
