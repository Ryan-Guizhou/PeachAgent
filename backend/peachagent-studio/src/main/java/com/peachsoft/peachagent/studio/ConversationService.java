package com.peachsoft.peachagent.studio;

import com.peachsoft.peachagent.common.DomainException;
import com.peachsoft.peachagent.common.IdGenerator;
import com.peachsoft.peachagent.common.JsonData;
import com.peachsoft.peachagent.common.ScopeContext;
import com.peachsoft.peachagent.iam.DatabaseTimeProvider;
import com.peachsoft.peachagent.iam.IdentityService;
import java.util.List;
import java.util.Map;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import tools.jackson.databind.json.JsonMapper;

/** 会话及消息持久化；执行请求由 Runtime 创建。 */
@Service
public class ConversationService {
    private final JdbcTemplate jdbc;private final IdGenerator ids;private final DatabaseTimeProvider time;private final JsonMapper mapper;
    public ConversationService(JdbcTemplate jdbc,IdGenerator ids,DatabaseTimeProvider time,JsonMapper mapper){
        this.jdbc=jdbc;this.ids=ids;this.time=time;this.mapper=mapper;
    }
    public record Create(String title) { }
    public record Feedback(String rating,String reason) { }

    public List<Map<String,Object>> list(ScopeContext s){
        return jdbc.queryForList("""
                SELECT ID,TITLE,STATUS,SELECTED_MODEL_ID,SELECTED_PROMPT_VERSION_ID,ACTIVE_RUN_ID,LAST_MESSAGE_AT,CREATED_AT,ROW_VERSION
                FROM CHAT_CONVERSATION WHERE TENANT_ID = ? AND WORKSPACE_ID = ? AND PROJECT_ID = ? AND OWNER_USER_ID = ?
                ORDER BY UPDATED_AT DESC,ID DESC LIMIT 100
                """,s.tenantId(),s.workspaceId(),s.requireProject(),s.userId()).stream().map(r->JsonData.view(mapper,r)).toList();
    }
    @Transactional
    public Map<String,Object> create(ScopeContext s,Create input){
        String title=JsonData.requiredText(input.title(),200),id=ids.nextId(),now=time.now();
        jdbc.update("""
                INSERT INTO CHAT_CONVERSATION (ID,TENANT_ID,WORKSPACE_ID,PROJECT_ID,OWNER_USER_ID,TITLE,STATUS,CREATED_AT,CREATED_BY,UPDATED_AT,UPDATED_BY)
                VALUES (?,?,?,?,?,?,'ACTIVE',?,?,?,?)
                """,id,s.tenantId(),s.workspaceId(),s.requireProject(),s.userId(),title,now,s.userId(),now,s.userId());
        return JsonData.view(mapper,require(s,id,false));
    }
    public Map<String,Object> require(ScopeContext s,String id,boolean lock){
        var rows=jdbc.queryForList("""
                SELECT ID,TITLE,STATUS,SELECTED_MODEL_ID,SELECTED_PROMPT_VERSION_ID,ACTIVE_RUN_ID,NEXT_MESSAGE_SEQ,LAST_MESSAGE_AT,ROW_VERSION
                FROM CHAT_CONVERSATION WHERE TENANT_ID = ? AND WORKSPACE_ID = ? AND PROJECT_ID = ? AND OWNER_USER_ID = ? AND ID = ?
                """+(lock?" FOR UPDATE":""),s.tenantId(),s.workspaceId(),s.requireProject(),s.userId(),id);
        if(rows.isEmpty())throw IdentityService.missing();return rows.getFirst();
    }
    public List<Map<String,Object>> messages(ScopeContext s,String id,long after,int limit){
        return messages(s,id,after,limit,null,false);
    }

    /** 新客户端读取尾页及严格向前游标；旧 after 语义保持不变，统一按消息顺序返回。 */
    public List<Map<String,Object>> messages(ScopeContext s,String id,long after,int limit,Long before,boolean latest){
        if(after<0||(before!=null&&before<1)||(after>0&&(latest||before!=null)))
            throw new DomainException("INVALID_CURSOR",422,"Invalid message cursor");
        require(s,id,false);
        boolean backwards=latest||before!=null;
        String sql="""
                SELECT M.ID,M.SEQ,M.ROLE,M.CONTENT,M.STATUS,M.REPLY_TO_MESSAGE_ID,M.PREFERRED_REPLY_ID,
                    M.FINISHED_AT,M.CREATED_AT,F.RATING AS FEEDBACK_RATING
                FROM CHAT_MESSAGE M LEFT JOIN CHAT_FEEDBACK F ON F.TENANT_ID = M.TENANT_ID
                    AND F.WORKSPACE_ID = M.WORKSPACE_ID AND F.PROJECT_ID = M.PROJECT_ID
                    AND F.CONVERSATION_ID = M.CONVERSATION_ID AND F.MESSAGE_ID = M.ID AND F.ACTOR_USER_ID = ?
                WHERE M.TENANT_ID = ? AND M.WORKSPACE_ID = ? AND M.PROJECT_ID = ? AND M.CONVERSATION_ID = ?
                """;
        sql+=backwards?" AND M.SEQ < ? ORDER BY M.SEQ DESC LIMIT ?":" AND M.SEQ > ? ORDER BY M.SEQ LIMIT ?";
        var rows=jdbc.queryForList(sql,s.userId(),s.tenantId(),s.workspaceId(),s.requireProject(),id,
                backwards?(before==null?Long.MAX_VALUE:before):after,Math.min(100,Math.max(1,limit)));
        return (backwards?rows.reversed():rows).stream().map(row->JsonData.view(mapper,row)).toList();
    }
    @Transactional
    public void feedback(ScopeContext s,String id,String message,Feedback input){
        require(s,id,false);
        if(!List.of("UP","DOWN").contains(input.rating())||input.reason()!=null&&input.reason().length()>500)
            throw new DomainException("INVALID_FEEDBACK",422,"Invalid feedback");
        Integer exists=jdbc.queryForObject("""
                SELECT COUNT(*) FROM CHAT_MESSAGE WHERE TENANT_ID = ? AND WORKSPACE_ID = ? AND PROJECT_ID = ? AND CONVERSATION_ID = ?
                AND ID = ? AND ROLE = 'ASSISTANT' AND STATUS = 'COMPLETE'
                """,Integer.class,s.tenantId(),s.workspaceId(),s.requireProject(),id,message);
        if(!Integer.valueOf(1).equals(exists))throw IdentityService.missing();
        String now=time.now();
        jdbc.update("""
                INSERT INTO CHAT_FEEDBACK (ID,TENANT_ID,WORKSPACE_ID,PROJECT_ID,CONVERSATION_ID,MESSAGE_ID,ACTOR_USER_ID,RATING,REASON,CREATED_AT,CREATED_BY,UPDATED_AT,UPDATED_BY)
                VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)
                ON DUPLICATE KEY UPDATE RATING = ?,REASON = ?,UPDATED_AT = ?,UPDATED_BY = ?,ROW_VERSION = ROW_VERSION + 1
                """,ids.nextId(),s.tenantId(),s.workspaceId(),s.requireProject(),id,message,s.userId(),input.rating(),input.reason(),now,s.userId(),now,s.userId(),input.rating(),input.reason(),now,s.userId());
    }
    @Transactional
    public void archive(ScopeContext s,String id,long revision,boolean archive){
        var row=require(s,id,true);idle(row);
        changed(jdbc.update("""
                UPDATE CHAT_CONVERSATION SET STATUS = ?,UPDATED_AT = ?,UPDATED_BY = ?,ROW_VERSION = ROW_VERSION + 1
                WHERE TENANT_ID = ? AND WORKSPACE_ID = ? AND PROJECT_ID = ? AND ID = ? AND ROW_VERSION = ? AND STATUS = ?
                """,archive?"ARCHIVED":"ACTIVE",time.now(),s.userId(),s.tenantId(),s.workspaceId(),s.requireProject(),id,revision,archive?"ACTIVE":"ARCHIVED"));
    }
    @Transactional
    public void redact(ScopeContext s,String id,long revision){
        var row=require(s,id,true);idle(row);
        String now=time.now();
        changed(jdbc.update("""
                UPDATE CHAT_CONVERSATION SET TITLE = 'Cleared conversation',STATUS = 'REDACTED',REDACTED_AT = ?,UPDATED_AT = ?,UPDATED_BY = ?,ROW_VERSION = ROW_VERSION + 1
                WHERE TENANT_ID = ? AND WORKSPACE_ID = ? AND PROJECT_ID = ? AND ID = ? AND ROW_VERSION = ? AND STATUS <> 'REDACTED'
                """,now,now,s.userId(),s.tenantId(),s.workspaceId(),s.requireProject(),id,revision));
        jdbc.update("""
                UPDATE CHAT_MESSAGE SET CONTENT = NULL,STATUS = 'REDACTED',REDACTED_AT = ?,UPDATED_AT = ?,ROW_VERSION = ROW_VERSION + 1
                WHERE TENANT_ID = ? AND WORKSPACE_ID = ? AND PROJECT_ID = ? AND CONVERSATION_ID = ?
                """,now,now,s.tenantId(),s.workspaceId(),s.requireProject(),id);
        jdbc.update("""
                UPDATE RT_RUN SET REQUEST_SNAPSHOT = NULL,REDACTED_AT = ?,UPDATED_AT = ?,ROW_VERSION = ROW_VERSION + 1
                WHERE TENANT_ID = ? AND WORKSPACE_ID = ? AND PROJECT_ID = ? AND CONVERSATION_ID = ?
                """,now,now,s.tenantId(),s.workspaceId(),s.requireProject(),id);
        jdbc.update("""
                UPDATE RT_RUN_EVENT E JOIN RT_RUN R ON E.RUN_ID = R.ID SET E.PAYLOAD = NULL
                WHERE R.TENANT_ID = ? AND R.WORKSPACE_ID = ? AND R.PROJECT_ID = ? AND R.CONVERSATION_ID = ?
                """,s.tenantId(),s.workspaceId(),s.requireProject(),id);
    }
    private static void idle(Map<String,Object> row){
        if(row.get("ACTIVE_RUN_ID")!=null)throw new DomainException("ACTIVE_RUNS",409,"Stop active run first");
    }
    private static void changed(int n){if(n!=1)throw new DomainException("VERSION_CONFLICT",409,"Conversation changed");}
}
