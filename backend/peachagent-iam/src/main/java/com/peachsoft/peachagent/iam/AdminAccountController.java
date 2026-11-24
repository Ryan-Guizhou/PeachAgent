package com.peachsoft.peachagent.iam;

import com.peachsoft.peachagent.common.DomainException;

import cn.dev33.satoken.stp.StpUtil;

import java.util.List;
import java.util.Map;

import org.springframework.context.annotation.Profile;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * 管理员只管理账号状态，不获得私有空间、会话或秘密读取权。
 * @Author Mr Shu
 * @Version 1.0.0
 * @CreateTime 2026/11/24 11:33
 */
@RestController
@RequestMapping("/api/v1/admin/users")
@Profile("api")
public class AdminAccountController {
    private final JdbcTemplate jdbc;
    private final IdentityService identity;
    private final DatabaseTimeProvider time;
    private final AuditService audit;

    public AdminAccountController(
            JdbcTemplate jdbc, IdentityService identity, DatabaseTimeProvider time, AuditService audit) {
        this.jdbc = jdbc;
        this.identity = identity;
        this.time = time;
        this.audit = audit;
    }
    /**
     * 账号状态更新参数，版本号用于防止并发覆盖。
     * @Author Mr Shu
     * @Version 1.0.0
     * @CreateTime 2026/11/24 11:33
     */
    public record AccountStatus(String status, long rowVersion) {}

    private IdentityService.Principal admin() {
        var p = identity.current();
        if (!"ADMIN".equals(p.platformRole())) throw new DomainException("FORBIDDEN", 403, "Administrator required");
        return p;
    }

    @GetMapping
    public List<Map<String, Object>> users(
            @RequestParam(defaultValue = "") String afterId, @RequestParam(defaultValue = "50") int limit) {
        admin();
        return jdbc.queryForList(
                "SELECT ID,EMAIL,DISPLAY_NAME,PLATFORM_ROLE,STATUS,CREATED_AT,ROW_VERSION FROM IAM_USER WHERE ID > ? ORDER BY ID LIMIT ?",
                afterId,
                Math.min(Math.max(limit, 1), 100));
    }

    @PatchMapping("/{id}/status")
    @Transactional
    public void change(@PathVariable String id, @RequestBody AccountStatus input) {
        var p = admin();
        if (p.userId().equals(id) || !List.of("ACTIVE", "DISABLED").contains(input.status()))
            throw new DomainException("INVALID_STATUS", 422, "Invalid account status change");
        int changed = jdbc.update(
                """
                UPDATE IAM_USER SET STATUS = ?,AUTH_EPOCH = AUTH_EPOCH + 1,UPDATED_AT = ?,UPDATED_BY = ?,ROW_VERSION = ROW_VERSION + 1
                WHERE ID = ? AND PLATFORM_ROLE = 'USER' AND ROW_VERSION = ?
                """,
                input.status(),
                time.now(),
                p.userId(),
                id,
                input.rowVersion());
        if (changed != 1) throw new DomainException("VERSION_CONFLICT", 409, "Account unavailable or changed");
        audit.record(null, null, null, p.userId(), "ACCOUNT_STATUS", "USER", id, "SUCCESS", input.status());
        TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
            @Override
            public void afterCommit() {
                StpUtil.logout(id);
            }
        });
    }
}
