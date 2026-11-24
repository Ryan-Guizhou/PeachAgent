package com.peachsoft.peachagent.studio;

import com.peachsoft.peachagent.common.DomainException;
import com.peachsoft.peachagent.common.IdGenerator;
import com.peachsoft.peachagent.common.JsonData;
import com.peachsoft.peachagent.common.ScopeContext;
import com.peachsoft.peachagent.iam.AuditService;
import com.peachsoft.peachagent.iam.DatabaseTimeProvider;
import com.peachsoft.peachagent.iam.IdentityService;
import com.peachsoft.peachagent.iam.SecurityTokens;

import java.util.List;
import java.util.Locale;
import java.util.Map;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import tools.jackson.databind.json.JsonMapper;

/**
 * Prompt 草稿、不可变版本及同空间显式引用。
 * @Author Mr Shu
 * @Version 1.0.0
 * @CreateTime 2026/11/24 11:36
 */
@Service
public class PromptService {
    private final JdbcTemplate jdbc;
    private final IdGenerator ids;
    private final DatabaseTimeProvider time;
    private final IdentityService identity;
    private final AuditService audit;
    private final JsonMapper mapper;

    public PromptService(
            JdbcTemplate jdbc,
            IdGenerator ids,
            DatabaseTimeProvider time,
            IdentityService identity,
            AuditService audit,
            JsonMapper mapper) {
        this.jdbc = jdbc;
        this.ids = ids;
        this.time = time;
        this.identity = identity;
        this.audit = audit;
        this.mapper = mapper;
    }
    /**
     * Prompt 草稿及变量定义，更新使用乐观锁。
     * @Author Mr Shu
     * @Version 1.0.0
     * @CreateTime 2026/11/24 11:36
     */
    public record Draft(
            String name, String description, String content, Map<String, Object> variables, Long rowVersion) {}
    /**
     * 发布固定版本时的变更说明和乐观锁版本。
     * @Author Mr Shu
     * @Version 1.0.0
     * @CreateTime 2026/11/24 11:36
     */
    public record Publish(String changeNote, long rowVersion) {}
    /**
     * 同一空间中源项目的固定 Prompt 版本引用。
     * @Author Mr Shu
     * @Version 1.0.0
     * @CreateTime 2026/11/24 11:36
     */
    public record Reference(String sourceProjectId, String versionId, String alias) {}
    /**
     * 预览指定 Prompt 版本或草稿时的变量值。
     * @Author Mr Shu
     * @Version 1.0.0
     * @CreateTime 2026/11/24 11:36
     */
    public record Preview(String versionId, Map<String, Object> values) {}

    public List<Map<String, Object>> list(ScopeContext s) {
        return jdbc
                .queryForList(
                        """
                SELECT ID,NAME,DESCRIPTION,DRAFT_CONTENT,DRAFT_VARIABLES,STATUS,LATEST_VERSION_ID,ROW_VERSION,UPDATED_AT
                FROM STUDIO_PROMPT WHERE TENANT_ID = ? AND WORKSPACE_ID = ? AND PROJECT_ID = ? ORDER BY UPDATED_AT DESC,ID DESC LIMIT 100
                """,
                        s.tenantId(),
                        s.workspaceId(),
                        s.requireProject())
                .stream()
                .map(r -> JsonData.view(mapper, r, "DRAFT_VARIABLES"))
                .toList();
    }

    private Map<String, Object> prompt(ScopeContext s, String id, boolean lock) {
        var rows = jdbc.queryForList(
                """
                SELECT ID,NAME,DESCRIPTION,DRAFT_CONTENT,DRAFT_VARIABLES,STATUS,LATEST_VERSION_ID,NEXT_VERSION_NO,ROW_VERSION,UPDATED_AT
                FROM STUDIO_PROMPT WHERE TENANT_ID = ? AND WORKSPACE_ID = ? AND PROJECT_ID = ? AND ID = ?
                """
                        + (lock ? " FOR UPDATE" : ""),
                s.tenantId(),
                s.workspaceId(),
                s.requireProject(),
                id);
        if (rows.isEmpty()) throw IdentityService.missing();
        return rows.getFirst();
    }

    @Transactional
    public Map<String, Object> save(ScopeContext s, String id, Draft d) {
        String name = JsonData.requiredText(d.name(), 100).strip();
        if (name.isEmpty()) throw invalid("Name required");
        if (d.description() != null && d.description().length() > 500) throw invalid("Description too long");
        PromptTemplate.validate(d.content(), d.variables());
        String now = time.now(), schema = mapper.writeValueAsString(d.variables());
        if (id == null) {
            id = ids.nextId();
            jdbc.update(
                    """
                    INSERT INTO STUDIO_PROMPT (ID,TENANT_ID,WORKSPACE_ID,PROJECT_ID,NAME,NAME_KEY,DESCRIPTION,DRAFT_CONTENT,DRAFT_VARIABLES,STATUS,CREATED_AT,CREATED_BY,UPDATED_AT,UPDATED_BY)
                    VALUES (?,?,?,?,?,?,?,?,?,'ACTIVE',?,?,?,?)
                    """,
                    id,
                    s.tenantId(),
                    s.workspaceId(),
                    s.requireProject(),
                    name,
                    name.toLowerCase(Locale.ROOT),
                    d.description(),
                    d.content(),
                    schema,
                    now,
                    s.userId(),
                    now,
                    s.userId());
        } else
            version(jdbc.update(
                    """
                UPDATE STUDIO_PROMPT SET NAME = ?,NAME_KEY = ?,DESCRIPTION = ?,DRAFT_CONTENT = ?,DRAFT_VARIABLES = ?,UPDATED_AT = ?,UPDATED_BY = ?,ROW_VERSION = ROW_VERSION + 1
                WHERE TENANT_ID = ? AND WORKSPACE_ID = ? AND PROJECT_ID = ? AND ID = ? AND STATUS = 'ACTIVE' AND ROW_VERSION = ?
                """,
                    name,
                    name.toLowerCase(Locale.ROOT),
                    d.description(),
                    d.content(),
                    schema,
                    now,
                    s.userId(),
                    s.tenantId(),
                    s.workspaceId(),
                    s.requireProject(),
                    id,
                    d.rowVersion()));
        return JsonData.view(mapper, prompt(s, id, false), "DRAFT_VARIABLES");
    }

    @Transactional
    public Map<String, Object> publish(ScopeContext s, String id, Publish input) {
        var p = prompt(s, id, true);
        if (!"ACTIVE".equals(p.get("STATUS")) || ((Number) p.get("ROW_VERSION")).longValue() != input.rowVersion())
            throw conflict();
        if (input.changeNote() != null && input.changeNote().length() > 500) throw invalid("Change note too long");
        String content = (String) p.get("DRAFT_CONTENT"),
                schema = p.get("DRAFT_VARIABLES").toString(),
                versionId = ids.nextId(),
                now = time.now();
        int next = ((Number) p.get("NEXT_VERSION_NO")).intValue();
        jdbc.update(
                """
                INSERT INTO STUDIO_PROMPT_VERSION (ID,TENANT_ID,WORKSPACE_ID,PROJECT_ID,PROMPT_ID,VERSION_NO,CONTENT,VARIABLE_SCHEMA,CONTENT_HASH,CHANGE_NOTE,CREATED_BY,CREATED_AT)
                VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
                """,
                versionId,
                s.tenantId(),
                s.workspaceId(),
                s.requireProject(),
                id,
                next,
                content,
                schema,
                SecurityTokens.digest(content + "\n" + schema),
                input.changeNote(),
                s.userId(),
                now);
        version(jdbc.update(
                """
                UPDATE STUDIO_PROMPT SET LATEST_VERSION_ID = ?,NEXT_VERSION_NO = NEXT_VERSION_NO + 1,UPDATED_AT = ?,UPDATED_BY = ?,ROW_VERSION = ROW_VERSION + 1
                WHERE TENANT_ID = ? AND WORKSPACE_ID = ? AND PROJECT_ID = ? AND ID = ? AND ROW_VERSION = ?
                """,
                versionId,
                now,
                s.userId(),
                s.tenantId(),
                s.workspaceId(),
                s.requireProject(),
                id,
                input.rowVersion()));
        audit.record(
                s.tenantId(),
                s.workspaceId(),
                s.projectId(),
                s.userId(),
                "PROMPT_PUBLISH",
                "PROMPT_VERSION",
                versionId,
                "SUCCESS",
                null);
        return Map.of("id", versionId, "versionNo", next);
    }

    public List<Map<String, Object>> versions(ScopeContext s, String id) {
        prompt(s, id, false);
        return jdbc
                .queryForList(
                        """
                SELECT ID,PROMPT_ID,VERSION_NO,CONTENT,VARIABLE_SCHEMA,CHANGE_NOTE,CREATED_AT FROM STUDIO_PROMPT_VERSION
                WHERE TENANT_ID = ? AND WORKSPACE_ID = ? AND PROJECT_ID = ? AND PROMPT_ID = ? ORDER BY VERSION_NO DESC LIMIT 100
                """,
                        s.tenantId(),
                        s.workspaceId(),
                        s.requireProject(),
                        id)
                .stream()
                .map(r -> JsonData.view(mapper, r, "VARIABLE_SCHEMA"))
                .toList();
    }

    public String preview(ScopeContext s, String id, Preview input) {
        var p = prompt(s, id, false);
        if (input.versionId() == null)
            return PromptTemplate.render(
                    (String) p.get("DRAFT_CONTENT"), JsonData.object(mapper, p.get("DRAFT_VARIABLES")), input.values());
        var v = ownVersion(s, id, input.versionId());
        return PromptTemplate.render(
                (String) v.get("CONTENT"), JsonData.object(mapper, v.get("VARIABLE_SCHEMA")), input.values());
    }

    private Map<String, Object> ownVersion(ScopeContext s, String id, String versionId) {
        var rows = jdbc.queryForList(
                """
                SELECT ID,PROMPT_ID,VERSION_NO,CONTENT,VARIABLE_SCHEMA FROM STUDIO_PROMPT_VERSION
                WHERE TENANT_ID = ? AND WORKSPACE_ID = ? AND PROJECT_ID = ? AND PROMPT_ID = ? AND ID = ?
                """,
                s.tenantId(),
                s.workspaceId(),
                s.requireProject(),
                id,
                versionId);
        if (rows.isEmpty()) throw IdentityService.missing();
        return rows.getFirst();
    }

    @Transactional
    public void archive(ScopeContext s, String id, long revision, boolean archive) {
        String now = time.now();
        version(jdbc.update(
                """
                UPDATE STUDIO_PROMPT SET STATUS = ?,ARCHIVED_AT = ?,UPDATED_AT = ?,UPDATED_BY = ?,ROW_VERSION = ROW_VERSION + 1
                WHERE TENANT_ID = ? AND WORKSPACE_ID = ? AND PROJECT_ID = ? AND ID = ? AND ROW_VERSION = ? AND STATUS = ?
                """,
                archive ? "ARCHIVED" : "ACTIVE",
                archive ? now : null,
                now,
                s.userId(),
                s.tenantId(),
                s.workspaceId(),
                s.requireProject(),
                id,
                revision,
                archive ? "ACTIVE" : "ARCHIVED"));
    }

    @Transactional
    public void reference(ScopeContext s, Reference input) {
        if (s.projectId().equals(input.sourceProjectId())) throw invalid("Reference must come from another project");
        identity.project(identity.active(s.userId()), s.workspaceId(), input.sourceProjectId(), false);
        var rows = jdbc.queryForList(
                """
                SELECT V.PROMPT_ID,V.ID FROM STUDIO_PROMPT_VERSION V JOIN STUDIO_PROMPT P ON V.PROMPT_ID = P.ID
                WHERE V.TENANT_ID = ? AND V.WORKSPACE_ID = ? AND V.PROJECT_ID = ? AND V.ID = ? AND P.STATUS = 'ACTIVE'
                """,
                s.tenantId(),
                s.workspaceId(),
                input.sourceProjectId(),
                input.versionId());
        if (rows.isEmpty()) throw IdentityService.missing();
        String alias = JsonData.requiredText(input.alias(), 100), now = time.now();
        jdbc.update(
                """
                INSERT INTO STUDIO_PROMPT_REFERENCE (ID,TENANT_ID,WORKSPACE_ID,SOURCE_PROJECT_ID,TARGET_PROJECT_ID,PROMPT_ID,PROMPT_VERSION_ID,ALIAS,STATUS,CREATED_AT,CREATED_BY,UPDATED_AT,UPDATED_BY)
                VALUES (?,?,?,?,?,?,?,?,'ACTIVE',?,?,?,?)
                ON DUPLICATE KEY UPDATE ALIAS = ?,STATUS = 'ACTIVE',REVOKED_AT = NULL,UPDATED_AT = ?,UPDATED_BY = ?,ROW_VERSION = ROW_VERSION + 1
                """,
                ids.nextId(),
                s.tenantId(),
                s.workspaceId(),
                input.sourceProjectId(),
                s.requireProject(),
                rows.getFirst().get("PROMPT_ID"),
                input.versionId(),
                alias,
                now,
                s.userId(),
                now,
                s.userId(),
                alias,
                now,
                s.userId());
    }

    public List<Map<String, Object>> references(ScopeContext s) {
        return jdbc
                .queryForList(
                        """
                SELECT R.ID,R.SOURCE_PROJECT_ID,R.PROMPT_ID,R.PROMPT_VERSION_ID,R.ALIAS,R.STATUS,V.VERSION_NO,R.ROW_VERSION
                FROM STUDIO_PROMPT_REFERENCE R JOIN STUDIO_PROMPT_VERSION V ON R.PROMPT_VERSION_ID = V.ID
                WHERE R.TENANT_ID = ? AND R.WORKSPACE_ID = ? AND R.TARGET_PROJECT_ID = ? ORDER BY R.CREATED_AT,R.ID LIMIT 100
                """,
                        s.tenantId(),
                        s.workspaceId(),
                        s.requireProject())
                .stream()
                .map(r -> JsonData.view(mapper, r))
                .toList();
    }

    @Transactional
    public void revoke(ScopeContext s, String id, long revision) {
        String now = time.now();
        version(jdbc.update(
                """
                UPDATE STUDIO_PROMPT_REFERENCE SET STATUS = 'REVOKED',REVOKED_AT = ?,UPDATED_AT = ?,UPDATED_BY = ?,ROW_VERSION = ROW_VERSION + 1
                WHERE TENANT_ID = ? AND WORKSPACE_ID = ? AND TARGET_PROJECT_ID = ? AND ID = ? AND STATUS = 'ACTIVE' AND ROW_VERSION = ?
                """,
                now,
                now,
                s.userId(),
                s.tenantId(),
                s.workspaceId(),
                s.requireProject(),
                id,
                revision));
    }

    public String renderVersion(ScopeContext s, String versionId, Map<String, Object> values) {
        if (versionId == null) return "";
        var rows = jdbc.queryForList(
                """
                SELECT V.CONTENT,V.VARIABLE_SCHEMA FROM STUDIO_PROMPT_VERSION V
                JOIN STUDIO_PROMPT P ON V.PROMPT_ID = P.ID JOIN IAM_PROJECT J ON V.PROJECT_ID = J.ID
                WHERE V.TENANT_ID = ? AND V.WORKSPACE_ID = ? AND V.ID = ? AND P.STATUS = 'ACTIVE' AND J.STATUS = 'ACTIVE'
                AND (V.PROJECT_ID = ? OR EXISTS (SELECT 1 FROM STUDIO_PROMPT_REFERENCE R
                WHERE R.TENANT_ID = V.TENANT_ID AND R.WORKSPACE_ID = V.WORKSPACE_ID AND R.PROMPT_VERSION_ID = V.ID
                AND R.TARGET_PROJECT_ID = ? AND R.STATUS = 'ACTIVE'))
                """,
                s.tenantId(),
                s.workspaceId(),
                versionId,
                s.requireProject(),
                s.requireProject());
        if (rows.isEmpty()) throw IdentityService.missing();
        var v = rows.getFirst();
        return PromptTemplate.render(
                (String) v.get("CONTENT"), JsonData.object(mapper, v.get("VARIABLE_SCHEMA")), values);
    }

    private static void version(int changed) {
        if (changed != 1) throw conflict();
    }

    private static DomainException conflict() {
        return new DomainException("VERSION_CONFLICT", 409, "Resource changed or unavailable");
    }

    private static DomainException invalid(String message) {
        return new DomainException("PROMPT_INVALID", 422, message);
    }
}
