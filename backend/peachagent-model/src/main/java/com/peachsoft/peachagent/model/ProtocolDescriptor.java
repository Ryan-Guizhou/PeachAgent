package com.peachsoft.peachagent.model;

import java.util.Map;
import java.util.Set;

/** 可发现的类型、操作、配置与传输能力契约。 */
public record ProtocolDescriptor(
        ProtocolKey protocol, String adapterKey, String adapterVersion,
        Map<String, Set<String>> operations, Set<String> authMethods,
        Map<String, Object> connectionSchema, Map<String, Object> modelSchema,
        boolean streaming, boolean cancellable, String usageSemantics) {
    public boolean supports(String type, String operation) {
        return operations.getOrDefault(type, Set.of()).contains(operation);
    }
}
