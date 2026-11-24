package com.peachsoft.peachagent.iam;

import com.peachsoft.peachagent.common.DomainException;
import com.peachsoft.peachagent.common.IdGenerator;
import com.peachsoft.peachagent.common.ScopeContext;
import com.peachsoft.peachagent.common.TimeCodec;

import java.util.List;
import java.util.Locale;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * 工作空间和项目的事务边界及默认预算初始化。
 * @Author Mr Shu
 * @Version 1.0.0
 * @CreateTime 2026/11/24 11:29
 */
@Service
public class WorkspaceService {
    private final JdbcTemplate jdbc;
    private final IdGenerator ids;
    private final DatabaseTimeProvider time;
    private final IdentityService identity;
    private final AuditService audit;

    /**
     * 工作空间的公开投影，不包含认证或模型密钥。
     * @Author Mr Shu
     * @Version 1.0.0
     * @CreateTime 2026/11/24 11:29
     */
    public record Workspace(
            String id,
            String code,
            String name,
            String description,
            String status,
            String defaultProjectId,
            String createdAt,
            long rowVersion) {}
    /**
     * 项目的公开投影与更新版本。
     * @Author Mr Shu
     * @Version 1.0.0
     * @CreateTime 2026/11/24 11:29
     */
    public record Project(
            String id,
            String workspaceId,
            String code,
            String name,
            String description,
            String status,
            String createdAt,
            long rowVersion) {}
    /**
     * 资源创建参数，归属由服务端身份确定。
     * @Author Mr Shu
     * @Version 1.0.0
     * @CreateTime 2026/11/24 11:29
     */
    public record Create(String name, String description) {}
    /**
     * 资源修改参数，版本号用于乐观并发控制。
     * @Author Mr Shu
     * @Version 1.0.0
     * @CreateTime 2026/11/24 11:29
     */
    public record Update(String name, String description, long rowVersion) {}

    public WorkspaceService(
            JdbcTemplate jdbc,
            IdGenerator ids,
            DatabaseTimeProvider time,
            IdentityService identity,
            AuditService audit) {
        this.jdbc = jdbc;
        this.ids = ids;
        this.time = time;
        this.identity = identity;
        this.audit = audit;
    }

    private static String name(String value) {
        if (value == null || value.isBlank() || value.strip().length() > 100) {
            throw new DomainException("INVALID_NAME", 422, "Name must contain 1-100 characters");
        }
        return value.strip();
    }

    private static String description(String value) {
        if (value != null && value.length() > 500)
            throw new DomainException("INVALID_DESCRIPTION", 422, "Description too long");
        return value;
    }

    private static int limit(int value) {
        return Math.min(Math.max(value, 1), 100);
    }

    private static String cursorTime(String value) {
        if (value == null) return "00010101000000";
        try {
            TimeCodec.parse(value);
            return value;
        } catch (RuntimeException ex) {
            throw new DomainException("INVALID_CURSOR", 422, "Invalid time cursor");
        }
    }

    public List<Workspace> listWorkspaces(String afterTime, String afterId, int limit) {
        var p = identity.current();
        String cursor = cursorTime(afterTime);
        return jdbc.query(
                """
                SELECT ID,WORKSPACE_CODE,NAME,DESCRIPTION,STATUS,DEFAULT_PROJECT_ID,CREATED_AT,ROW_VERSION
                FROM IAM_WORKSPACE WHERE TENANT_ID = ?
                AND (CREATED_AT > ? OR (CREATED_AT = ? AND ID > ?))
                ORDER BY CREATED_AT,ID LIMIT ?
                """,
                (rs, n) -> new Workspace(
                        rs.getString(1),
                        rs.getString(2),
                        rs.getString(3),
                        rs.getString(4),
                        rs.getString(5),
                        rs.getString(6),
                        rs.getString(7),
                        rs.getLong(8)),
                p.tenantId(),
                cursor,
                cursor,
                afterId == null ? "" : afterId,
                limit(limit));
    }

    public List<Project> listProjects(String workspaceId, String afterTime, String afterId, int limit) {
        var scope = identity.workspace(identity.current(), workspaceId, true);
        String cursor = cursorTime(afterTime);
        return jdbc.query(
                """
                SELECT ID,WORKSPACE_ID,PROJECT_CODE,NAME,DESCRIPTION,STATUS,CREATED_AT,ROW_VERSION
                FROM IAM_PROJECT WHERE TENANT_ID = ? AND WORKSPACE_ID = ?
                AND (CREATED_AT > ? OR (CREATED_AT = ? AND ID > ?))
                ORDER BY CREATED_AT,ID LIMIT ?
                """,
                (rs, n) -> new Project(
                        rs.getString(1),
                        rs.getString(2),
                        rs.getString(3),
                        rs.getString(4),
                        rs.getString(5),
                        rs.getString(6),
                        rs.getString(7),
                        rs.getLong(8)),
                scope.tenantId(),
                scope.workspaceId(),
                cursor,
                cursor,
                afterId == null ? "" : afterId,
                limit(limit));
    }

    public Workspace workspace(String id) {
        var s = identity.workspace(identity.current(), id, true);
        return jdbc.queryForObject(
                """
                SELECT ID,WORKSPACE_CODE,NAME,DESCRIPTION,STATUS,DEFAULT_PROJECT_ID,CREATED_AT,ROW_VERSION
                FROM IAM_WORKSPACE WHERE TENANT_ID = ? AND ID = ?
                """,
                (rs, n) -> new Workspace(
                        rs.getString(1),
                        rs.getString(2),
                        rs.getString(3),
                        rs.getString(4),
                        rs.getString(5),
                        rs.getString(6),
                        rs.getString(7),
                        rs.getLong(8)),
                s.tenantId(),
                s.workspaceId());
    }

    public Project project(String workspace, String project) {
        var s = identity.project(identity.current(), workspace, project, true);
        return jdbc.queryForObject(
                """
                SELECT ID,WORKSPACE_ID,PROJECT_CODE,NAME,DESCRIPTION,STATUS,CREATED_AT,ROW_VERSION
                FROM IAM_PROJECT WHERE TENANT_ID = ? AND WORKSPACE_ID = ? AND ID = ?
                """,
                (rs, n) -> new Project(
                        rs.getString(1),
                        rs.getString(2),
                        rs.getString(3),
                        rs.getString(4),
                        rs.getString(5),
                        rs.getString(6),
                        rs.getString(7),
                        rs.getLong(8)),
                s.tenantId(),
                s.workspaceId(),
                s.projectId());
    }

    @Transactional
    public Workspace createWorkspace(Create input) {
        var p = identity.current();
        lockTenant(p.tenantId());
        String id = initializeWorkspace(
                p.userId(), p.tenantId(), p.currency(), name(input.name()), description(input.description()));
        audit.record(p.tenantId(), id, null, p.userId(), "WORKSPACE_CREATE", "WORKSPACE", id, "SUCCESS", null);
        return workspace(id);
    }

    @Transactional
    public Project createProject(String workspace, Create input) {
        var p = identity.current();
        var s = identity.workspace(p, workspace, false);
        lockTenant(s.tenantId());
        String id = initializeProject(
                p.userId(),
                s.tenantId(),
                s.workspaceId(),
                p.currency(),
                name(input.name()),
                description(input.description()));
        audit.record(s.tenantId(), s.workspaceId(), id, s.userId(), "PROJECT_CREATE", "PROJECT", id, "SUCCESS", null);
        return project(workspace, id);
    }

    public String initializeWorkspace(String user, String tenant, String currency, String value, String description) {
        String id = ids.nextId(), now = time.now();
        jdbc.update(
                """
                INSERT INTO IAM_WORKSPACE (ID,TENANT_ID,WORKSPACE_CODE,NAME,NAME_KEY,DESCRIPTION,STATUS,CREATED_AT,CREATED_BY,UPDATED_AT,UPDATED_BY)
                VALUES (?,?,?,?,?,?,'ACTIVE',?,?,?,?)
                """,
                id,
                tenant,
                "W-" + id,
                value,
                value.toLowerCase(Locale.ROOT),
                description,
                now,
                user,
                now,
                user);
        initializeBudget(tenant, id, null, "WORKSPACE", id, currency, 4, user, now);
        String project = initializeProject(user, tenant, id, currency, "默认项目", null);
        jdbc.update(
                "UPDATE IAM_WORKSPACE SET DEFAULT_PROJECT_ID = ? WHERE TENANT_ID = ? AND ID = ?", project, tenant, id);
        return id;
    }

    public String initializeProject(
            String user, String tenant, String workspace, String currency, String value, String description) {
        String id = ids.nextId(), now = time.now();
        jdbc.update(
                """
                INSERT INTO IAM_PROJECT (ID,TENANT_ID,WORKSPACE_ID,PROJECT_CODE,NAME,NAME_KEY,DESCRIPTION,STATUS,CREATED_AT,CREATED_BY,UPDATED_AT,UPDATED_BY)
                VALUES (?,?,?,?,?,?,?,'ACTIVE',?,?,?,?)
                """,
                id,
                tenant,
                workspace,
                "P-" + id,
                value,
                value.toLowerCase(Locale.ROOT),
                description,
                now,
                user,
                now,
                user);
        initializeBudget(tenant, workspace, id, "PROJECT", id, currency, 2, user, now);
        return id;
    }

    public void initializeBudget(
            String tenant,
            String workspace,
            String project,
            String scopeType,
            String scopeId,
            String currency,
            int concurrency,
            String user,
            String now) {
        jdbc.update(
                """
                INSERT INTO BUDGET_POLICY (ID,TENANT_ID,WORKSPACE_ID,PROJECT_ID,SCOPE_TYPE,SCOPE_ID,PERIOD_TYPE,CURRENCY,
                MAX_CONCURRENCY,MAX_RUN_SECONDS,INFLIGHT_COUNT,STATUS,CREATED_AT,CREATED_BY,UPDATED_AT,UPDATED_BY)
                VALUES (?,?,?,?,?,?,'MONTH',?,?,180,0,'ACTIVE',?,?,?,?)
                """,
                ids.nextId(),
                tenant,
                workspace,
                project,
                scopeType,
                scopeId,
                currency,
                concurrency,
                now,
                user,
                now,
                user);
    }

    private void lockTenant(String tenant) {
        jdbc.queryForObject("SELECT ID FROM IAM_TENANT WHERE ID = ? FOR UPDATE", String.class, tenant);
    }

    @Transactional
    public Workspace updateWorkspace(String id, Update input) {
        var s = identity.workspace(id);
        String value = name(input.name());
        int changed = jdbc.update(
                """
                UPDATE IAM_WORKSPACE SET NAME = ?,NAME_KEY = ?,DESCRIPTION = ?,UPDATED_AT = ?,UPDATED_BY = ?,ROW_VERSION = ROW_VERSION + 1
                WHERE TENANT_ID = ? AND ID = ? AND ROW_VERSION = ? AND STATUS = 'ACTIVE'
                """,
                value,
                value.toLowerCase(Locale.ROOT),
                description(input.description()),
                time.now(),
                s.userId(),
                s.tenantId(),
                s.workspaceId(),
                input.rowVersion());
        version(changed);
        audit.record(
                s.tenantId(),
                s.workspaceId(),
                null,
                s.userId(),
                "WORKSPACE_UPDATE",
                "WORKSPACE",
                s.workspaceId(),
                "SUCCESS",
                null);
        return workspace(id);
    }

    @Transactional
    public Project updateProject(String workspace, String id, Update input) {
        var s = identity.project(workspace, id);
        String value = name(input.name());
        int changed = jdbc.update(
                """
                UPDATE IAM_PROJECT SET NAME = ?,NAME_KEY = ?,DESCRIPTION = ?,UPDATED_AT = ?,UPDATED_BY = ?,ROW_VERSION = ROW_VERSION + 1
                WHERE TENANT_ID = ? AND WORKSPACE_ID = ? AND ID = ? AND ROW_VERSION = ? AND STATUS = 'ACTIVE'
                """,
                value,
                value.toLowerCase(Locale.ROOT),
                description(input.description()),
                time.now(),
                s.userId(),
                s.tenantId(),
                s.workspaceId(),
                s.projectId(),
                input.rowVersion());
        version(changed);
        audit.record(
                s.tenantId(),
                s.workspaceId(),
                s.projectId(),
                s.userId(),
                "PROJECT_UPDATE",
                "PROJECT",
                s.projectId(),
                "SUCCESS",
                null);
        return project(workspace, id);
    }

    @Transactional
    public Workspace changeWorkspace(String id, boolean archive, long rowVersion) {
        var p = identity.current();
        var s = identity.workspace(p, id, true);
        lockTenant(s.tenantId());
        if (archive && s.workspaceId().equals(p.defaultWorkspaceId()))
            throw new DomainException("DEFAULT_RESOURCE", 409, "Default workspace cannot be archived");
        if (archive) assertNoRuns(s);
        int count = jdbc.update(
                """
                UPDATE IAM_WORKSPACE SET STATUS = ?,ARCHIVED_AT = ?,UPDATED_AT = ?,UPDATED_BY = ?,ROW_VERSION = ROW_VERSION + 1
                WHERE TENANT_ID = ? AND ID = ? AND ROW_VERSION = ? AND STATUS = ?
                """,
                archive ? "ARCHIVED" : "ACTIVE",
                archive ? time.now() : null,
                time.now(),
                s.userId(),
                s.tenantId(),
                s.workspaceId(),
                rowVersion,
                archive ? "ACTIVE" : "ARCHIVED");
        version(count);
        audit.record(
                s.tenantId(),
                s.workspaceId(),
                null,
                s.userId(),
                archive ? "WORKSPACE_ARCHIVE" : "WORKSPACE_RESTORE",
                "WORKSPACE",
                s.workspaceId(),
                "SUCCESS",
                null);
        return workspace(id);
    }

    @Transactional
    public Project changeProject(String workspace, String id, boolean archive, long rowVersion) {
        var p = identity.current();
        var s = identity.project(p, workspace, id, true);
        lockTenant(s.tenantId());
        var w = identity.workspace(p, workspace, false);
        String defaultId = jdbc.queryForObject(
                "SELECT DEFAULT_PROJECT_ID FROM IAM_WORKSPACE WHERE TENANT_ID = ? AND ID = ?",
                String.class,
                w.tenantId(),
                w.workspaceId());
        if (archive && s.projectId().equals(defaultId))
            throw new DomainException("DEFAULT_RESOURCE", 409, "Default project cannot be archived");
        if (archive) assertNoRuns(s);
        int count = jdbc.update(
                """
                UPDATE IAM_PROJECT SET STATUS = ?,ARCHIVED_AT = ?,UPDATED_AT = ?,UPDATED_BY = ?,ROW_VERSION = ROW_VERSION + 1
                WHERE TENANT_ID = ? AND WORKSPACE_ID = ? AND ID = ? AND ROW_VERSION = ? AND STATUS = ?
                """,
                archive ? "ARCHIVED" : "ACTIVE",
                archive ? time.now() : null,
                time.now(),
                s.userId(),
                s.tenantId(),
                s.workspaceId(),
                s.projectId(),
                rowVersion,
                archive ? "ACTIVE" : "ARCHIVED");
        version(count);
        audit.record(
                s.tenantId(),
                s.workspaceId(),
                s.projectId(),
                s.userId(),
                archive ? "PROJECT_ARCHIVE" : "PROJECT_RESTORE",
                "PROJECT",
                s.projectId(),
                "SUCCESS",
                null);
        return project(workspace, id);
    }

    private void assertNoRuns(ScopeContext s) {
        Integer active = s.projectId() == null
                ? jdbc.queryForObject(
                        """
                SELECT COUNT(*) FROM RT_RUN WHERE TENANT_ID = ? AND WORKSPACE_ID = ?
                AND STATUS IN ('QUEUED','RUNNING','CANCEL_REQUESTED')
                """,
                        Integer.class,
                        s.tenantId(),
                        s.workspaceId())
                : jdbc.queryForObject(
                        """
                SELECT COUNT(*) FROM RT_RUN WHERE TENANT_ID = ? AND WORKSPACE_ID = ? AND PROJECT_ID = ?
                AND STATUS IN ('QUEUED','RUNNING','CANCEL_REQUESTED')
                """,
                        Integer.class,
                        s.tenantId(),
                        s.workspaceId(),
                        s.projectId());
        if (active != null && active > 0)
            throw new DomainException("ACTIVE_RUNS", 409, "Stop active runs before archiving");
    }

    private static void version(int changed) {
        if (changed != 1) throw new DomainException("VERSION_CONFLICT", 409, "Resource changed; reload and retry");
    }
}
