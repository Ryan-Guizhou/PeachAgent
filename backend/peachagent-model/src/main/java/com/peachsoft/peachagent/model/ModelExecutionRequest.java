package com.peachsoft.peachagent.model;

import java.util.List;
import java.util.Map;

/**
 * 输入统一契约；模型端点、密钥和供应商 SDK 对象不进入请求。
 * @Author Mr Shu
 * @Version 1.0.0
 * @CreateTime 2026/11/24 11:31
 */
public record ModelExecutionRequest(
        String operation,
        String externalModelId,
        List<Message> messages,
        Map<String, Object> input,
        Map<String, Object> options,
        Integer maxOutputTokens,
        byte[] audio) {
    /**
     * 按模型协议传递的角色及正文。
     * @Author Mr Shu
     * @Version 1.0.0
     * @CreateTime 2026/11/24 11:31
     */
    public record Message(String role, String content) {}
}
