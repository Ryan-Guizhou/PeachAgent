package com.peachsoft.peachagent.iam;

import cn.dev33.satoken.stp.StpUtil;
import com.peachsoft.peachagent.common.DomainException;
import com.peachsoft.peachagent.common.ScopeContext;
import java.util.List;
import java.util.Map;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

/** 业务鉴权不依赖前端选中的空间，且每次读取当前账号状态。 */
@Service
public class IdentityService {
    private final JdbcTemplate jdbc;
    public IdentityService(JdbcTemplate jdbc) { this.jdbc = jdbc; }

    public record Principal(String userId, String tenantId, String email, String displayName,
                            String platformRole, String defaultWorkspaceId, String currency,
                            String locale, String theme, long authEpoch) { }

    public Principal current() {
        StpUtil.checkLogin();
        Principal p = active(StpUtil.getLoginIdAsString());
        Object epoch = StpUtil.getTokenSession().get("authEpoch");
        if (epoch == null || !Long.toString(p.authEpoch()).equals(epoch.toString())) {
            StpUtil.logout();
            throw new DomainException("SESSION_EXPIRED", 401, "Session expired");
        }
        return p;
    }

    public Principal active(String userId) {
        List<Principal> rows = jdbc.query("""
                SELECT U.ID, T.ID AS TENANT_ID, U.EMAIL, U.DISPLAY_NAME, U.PLATFORM_ROLE,
                       T.DEFAULT_WORKSPACE_ID, T.CURRENCY, U.LOCALE, U.THEME, U.AUTH_EPOCH
                FROM IAM_USER U JOIN IAM_TENANT T ON T.OWNER_USER_ID = U.ID
                WHERE U.ID = ? AND U.STATUS = 'ACTIVE' AND T.STATUS = 'ACTIVE'
                """, (rs, n) -> new Principal(rs.getString("ID"), rs.getString("TENANT_ID"),
                rs.getString("EMAIL"), rs.getString("DISPLAY_NAME"), rs.getString("PLATFORM_ROLE"),
                rs.getString("DEFAULT_WORKSPACE_ID"), rs.getString("CURRENCY"),
                rs.getString("LOCALE"), rs.getString("THEME"), rs.getLong("AUTH_EPOCH")), userId);
        if (rows.isEmpty()) throw new DomainException("SESSION_EXPIRED", 401, "Account unavailable");
        return rows.getFirst();
    }

    public ScopeContext workspace(String workspaceId) {
        return workspace(current(), workspaceId, false);
    }

    public ScopeContext workspace(Principal p, String workspaceId, boolean includeArchived) {
        List<String> found = jdbc.queryForList("""
                SELECT ID FROM IAM_WORKSPACE
                WHERE TENANT_ID = ? AND ID = ? AND (STATUS = 'ACTIVE' OR ? = TRUE)
                """, String.class, p.tenantId(), workspaceId, includeArchived);
        if (found.isEmpty()) throw missing();
        return new ScopeContext(p.userId(), p.tenantId(), found.getFirst(), null);
    }

    public ScopeContext project(String workspaceId, String projectId) {
        return project(current(), workspaceId, projectId, false);
    }

    public ScopeContext project(Principal p, String workspaceId, String projectId, boolean includeArchived) {
        ScopeContext scope = workspace(p, workspaceId, includeArchived);
        List<String> found = jdbc.queryForList("""
                SELECT ID FROM IAM_PROJECT
                WHERE TENANT_ID = ? AND WORKSPACE_ID = ? AND ID = ?
                AND (STATUS = 'ACTIVE' OR ? = TRUE)
                """, String.class, scope.tenantId(), scope.workspaceId(), projectId, includeArchived);
        if (found.isEmpty()) throw missing();
        return new ScopeContext(p.userId(), p.tenantId(), scope.workspaceId(), found.getFirst());
    }

    public void assertCurrentScope(ScopeContext scope) {
        Principal p = active(scope.userId());
        if (!p.tenantId().equals(scope.tenantId())) throw missing();
        if (scope.projectId() == null) workspace(p, scope.workspaceId(), false);
        else project(p, scope.workspaceId(), scope.projectId(), false);
    }

    public static DomainException missing() {
        return new DomainException("NOT_FOUND", 404, "Resource not found");
    }

    public Map<String, Object> sessionView(Principal p) {
        return Map.of("userId", p.userId(), "tenantId", p.tenantId(), "email", p.email(),
                "displayName", p.displayName(), "platformRole", p.platformRole(),
                "defaultWorkspaceId", p.defaultWorkspaceId(), "currency", p.currency(),
                "locale", p.locale(), "theme", p.theme(),
                "csrfToken", StpUtil.getTokenSession().get("csrfToken"));
    }
}
