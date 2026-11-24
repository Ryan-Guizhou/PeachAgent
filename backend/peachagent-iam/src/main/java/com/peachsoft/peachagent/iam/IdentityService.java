package com.peachsoft.peachagent.iam;

import cn.dev33.satoken.stp.StpUtil;
import com.peachsoft.peachagent.common.DomainException;
import com.peachsoft.peachagent.common.ScopeContext;
import java.util.List;
import java.util.Map;
import jakarta.servlet.DispatcherType;
import org.springframework.web.context.request.RequestContextHolder;
import org.springframework.web.context.request.ServletRequestAttributes;
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

    private static final String READ_PRINCIPAL=IdentityService.class.getName()+".readPrincipal";

    public Principal current() {
        // 仅在同一个同步 GET 请求内复用已验证快照；写请求和 Worker/SSE 持续检查不使用缓存。
        var attributes=RequestContextHolder.getRequestAttributes();
        var request=attributes instanceof ServletRequestAttributes servlet?servlet.getRequest():null;
        boolean read=request!=null&&request.getDispatcherType()==DispatcherType.REQUEST&&"GET".equals(request.getMethod());
        if(read&&request.getAttribute(READ_PRINCIPAL) instanceof Principal verified)return verified;
        StpUtil.checkLogin();
        Principal p = active(StpUtil.getLoginIdAsString());
        Object epoch = StpUtil.getTokenSession().get("authEpoch");
        if (epoch == null || !Long.toString(p.authEpoch()).equals(epoch.toString())) {
            StpUtil.logout();
            throw new DomainException("SESSION_EXPIRED", 401, "Session expired");
        }
        if(read)request.setAttribute(READ_PRINCIPAL,p);
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
        // 复合归属与状态在同一个查询内验证，避免逐级重复获取连接。
        List<ScopeContext> found = jdbc.query("""
                SELECT W.ID AS WORKSPACE_ID,P.ID AS PROJECT_ID
                FROM IAM_PROJECT P JOIN IAM_WORKSPACE W ON W.TENANT_ID = P.TENANT_ID AND W.ID = P.WORKSPACE_ID
                WHERE P.TENANT_ID = ? AND P.WORKSPACE_ID = ? AND P.ID = ?
                  AND (W.STATUS = 'ACTIVE' OR ? = TRUE) AND (P.STATUS = 'ACTIVE' OR ? = TRUE)
                """, (rs,n) -> new ScopeContext(p.userId(),p.tenantId(),rs.getString("WORKSPACE_ID"),
                rs.getString("PROJECT_ID")),p.tenantId(),workspaceId,projectId,includeArchived,includeArchived);
        if (found.isEmpty()) throw missing();
        return found.getFirst();
    }

    public void assertCurrentScope(ScopeContext scope) {
        assertCurrentScope(active(scope.userId()),scope);
    }

    /** 调用方在本次操作中刚验证有效账号时，复用该身份快照；仍重新检查资源归属及状态。 */
    public void assertCurrentScope(Principal p,ScopeContext scope) {
        if (!p.userId().equals(scope.userId()) || !p.tenantId().equals(scope.tenantId())) throw missing();
        if (scope.projectId() == null) workspace(p, scope.workspaceId(), false);
        else project(p, scope.workspaceId(), scope.projectId(), false);
    }

    /** SSE 逐轮查询账号、认证纪元及完整资源状态，避免重复读取用户资料。 */
    public void assertStreamScope(ScopeContext scope,long authEpoch){
        Integer valid=jdbc.queryForObject("""
                SELECT COUNT(*) FROM IAM_USER U
                JOIN IAM_TENANT T ON T.OWNER_USER_ID = U.ID
                JOIN IAM_WORKSPACE W ON W.TENANT_ID = T.ID
                JOIN IAM_PROJECT P ON P.TENANT_ID = T.ID AND P.WORKSPACE_ID = W.ID
                WHERE U.ID = ? AND U.AUTH_EPOCH = ? AND U.STATUS = 'ACTIVE'
                  AND T.ID = ? AND T.STATUS = 'ACTIVE' AND W.ID = ? AND W.STATUS = 'ACTIVE'
                  AND P.ID = ? AND P.STATUS = 'ACTIVE'
                """,Integer.class,scope.userId(),authEpoch,scope.tenantId(),scope.workspaceId(),scope.requireProject());
        if(!Integer.valueOf(1).equals(valid))throw missing();
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
