package com.peachsoft.peachagent.common;

import java.util.Objects;

/**
 * 服务端完成授权后构造的可信业务范围，不接受请求体反序列化。
 * @Author Mr Shu
 * @Version 1.0.0
 * @CreateTime 2026/11/24 11:27
 */
public record ScopeContext(String userId, String tenantId, String workspaceId, String projectId) {
    public ScopeContext {
        Objects.requireNonNull(userId);
        Objects.requireNonNull(tenantId);
        Objects.requireNonNull(workspaceId);
    }

    public String requireProject() {
        return Objects.requireNonNull(projectId, "Project scope required");
    }
}
