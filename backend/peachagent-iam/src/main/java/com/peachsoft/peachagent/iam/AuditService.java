package com.peachsoft.peachagent.iam;

import com.peachsoft.peachagent.common.IdGenerator;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

/** 审计仅保存受控动作、标识和结果，不接受原始请求或秘密。 */
@Component
public class AuditService {
    private final JdbcTemplate jdbc;
    private final IdGenerator ids;
    private final DatabaseTimeProvider time;

    public AuditService(JdbcTemplate jdbc, IdGenerator ids, DatabaseTimeProvider time) {
        this.jdbc = jdbc;
        this.ids = ids;
        this.time = time;
    }

    public void record(String tenant, String workspace, String project, String user,
                       String action, String targetType, String targetId, String result, String reason) {
        jdbc.update("""
                INSERT INTO IAM_AUDIT_LOG
                (ID,TENANT_ID,WORKSPACE_ID,PROJECT_ID,ACTOR_USER_ID,ACTION,TARGET_TYPE,TARGET_ID,REQUEST_ID,RESULT,REASON_CODE,CREATED_AT)
                VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
                """, ids.nextId(), tenant, workspace, project, user, action, targetType,
                targetId, ids.nextId(), result, reason, time.now());
    }
}
