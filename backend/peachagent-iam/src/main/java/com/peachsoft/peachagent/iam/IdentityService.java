package com.peachsoft.peachagent.iam;

import cn.dev33.satoken.stp.StpUtil;
import com.peachsoft.peachagent.common.DomainException;
import com.peachsoft.peachagent.common.ScopeContext;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.util.List;
import java.util.Map;
import jakarta.servlet.DispatcherType;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.web.servlet.HandlerMapping;
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

    private static final String READ_IDENTITY=IdentityService.class.getName()+".readIdentity";

    private record ReadIdentity(Principal principal,ScopeContext project) { }

    private static HttpServletRequest readRequest(){
        var attributes=RequestContextHolder.getRequestAttributes();
        if(!(attributes instanceof ServletRequestAttributes servlet))return null;
        var request=servlet.getRequest();
        return request.getDispatcherType()==DispatcherType.REQUEST&&"GET".equals(request.getMethod())?request:null;
    }

    public Principal current() {
        var request=readRequest();
        if(request!=null&&request.getAttribute(READ_IDENTITY) instanceof ReadIdentity verified)return verified.principal();
        // getLoginIdAsString 自身执行登录态及活跃超时检查，无需先重复 checkLogin。
        String userId=StpUtil.getLoginIdAsString();
        Object variables=request==null?null:request.getAttribute(HandlerMapping.URI_TEMPLATE_VARIABLES_ATTRIBUTE);
        ReadIdentity verified;
        if(variables instanceof Map<?,?> path&&path.get("w") instanceof String workspaceId
                &&path.get("p") instanceof String projectId){
            verified=activeProject(userId,workspaceId,projectId);
        }else{
            verified=new ReadIdentity(active(userId),null);
        }
        Principal p=verified.principal();
        Object epoch=StpUtil.getTokenSession().get("authEpoch");
        if(epoch==null||!Long.toString(p.authEpoch()).equals(epoch.toString())){
            StpUtil.logout();
            throw new DomainException("SESSION_EXPIRED",401,"Session expired");
        }
        // 仅在完成 Token Session 与数据库认证纪元比对后的同步 GET 请求内复用；绝不跨请求缓存。
        if(request!=null)request.setAttribute(READ_IDENTITY,verified);
        return p;
    }

    private static Principal principal(ResultSet rs)throws SQLException{
        return new Principal(rs.getString("ID"),rs.getString("TENANT_ID"),
                rs.getString("EMAIL"),rs.getString("DISPLAY_NAME"),rs.getString("PLATFORM_ROLE"),
                rs.getString("DEFAULT_WORKSPACE_ID"),rs.getString("CURRENCY"),
                rs.getString("LOCALE"),rs.getString("THEME"),rs.getLong("AUTH_EPOCH"));
    }

    public Principal active(String userId) {
        List<Principal> rows=jdbc.query("""
                SELECT U.ID,T.ID AS TENANT_ID,U.EMAIL,U.DISPLAY_NAME,U.PLATFORM_ROLE,
                       T.DEFAULT_WORKSPACE_ID,T.CURRENCY,U.LOCALE,U.THEME,U.AUTH_EPOCH
                FROM IAM_USER U JOIN IAM_TENANT T ON T.OWNER_USER_ID = U.ID
                WHERE U.ID = ? AND U.STATUS = 'ACTIVE' AND T.STATUS = 'ACTIVE'
                """,(rs,n)->principal(rs),userId);
        if(rows.isEmpty())throw new DomainException("SESSION_EXPIRED",401,"Account unavailable");
        return rows.getFirst();
    }

    /** 同一语句读取当前身份与项目归属；LEFT JOIN 保持账号失效 401、项目不可访问 404 的区分。 */
    private ReadIdentity activeProject(String userId,String workspaceId,String projectId){
        List<ReadIdentity> rows=jdbc.query("""
                SELECT U.ID,T.ID AS TENANT_ID,U.EMAIL,U.DISPLAY_NAME,U.PLATFORM_ROLE,
                       T.DEFAULT_WORKSPACE_ID,T.CURRENCY,U.LOCALE,U.THEME,U.AUTH_EPOCH,
                       W.ID AS WORKSPACE_ID,P.ID AS PROJECT_ID
                FROM IAM_USER U JOIN IAM_TENANT T ON T.OWNER_USER_ID = U.ID
                LEFT JOIN IAM_WORKSPACE W ON W.TENANT_ID = T.ID AND W.ID = ? AND W.STATUS = 'ACTIVE'
                LEFT JOIN IAM_PROJECT P ON P.TENANT_ID = T.ID AND P.WORKSPACE_ID = W.ID
                    AND P.ID = ? AND P.STATUS = 'ACTIVE'
                WHERE U.ID = ? AND U.STATUS = 'ACTIVE' AND T.STATUS = 'ACTIVE'
                """,(rs,n)->{
            Principal p=principal(rs);
            String resolved=rs.getString("PROJECT_ID");
            ScopeContext scope=resolved==null?null:new ScopeContext(p.userId(),p.tenantId(),rs.getString("WORKSPACE_ID"),resolved);
            return new ReadIdentity(p,scope);
        },workspaceId,projectId,userId);
        if(rows.isEmpty())throw new DomainException("SESSION_EXPIRED",401,"Account unavailable");
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
        Principal principal=current();
        var request=readRequest();
        if(request!=null&&request.getAttribute(READ_IDENTITY) instanceof ReadIdentity verified
                &&verified.principal().equals(principal)&&verified.project()!=null){
            ScopeContext scope=verified.project();
            if(scope.workspaceId().equals(workspaceId)&&scope.projectId().equals(projectId))return scope;
        }
        return project(principal,workspaceId,projectId,false);
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
