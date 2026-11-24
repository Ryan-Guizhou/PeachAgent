package com.peachsoft.peachagent.model;

import java.util.Map;

/**
 * 配置只含非秘密数据；真实密钥由受控传输层解析。
 * @Author Mr Shu
 * @Version 1.0.0
 * @CreateTime 2026/11/24 11:31
 */
public record ProtocolConfiguration(
        String authMethod,
        String modelType,
        Map<String, Object> connectionOptions,
        Map<String, Object> modelOptions,
        Map<String, Object> capabilities) {}
