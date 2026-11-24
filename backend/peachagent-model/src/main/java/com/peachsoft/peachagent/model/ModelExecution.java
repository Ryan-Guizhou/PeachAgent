package com.peachsoft.peachagent.model;

import java.util.Map;

/** 同步完成结果；流式 delta 由上下文有序输出，二进制由 Runtime 私有存储。 */
public record ModelExecution(Map<String,Object> result, Usage usage, byte[] artifact,
                             String mimeType, String providerRequestId) {
    public record Usage(Long inputTokens, Long outputTokens, Long totalTokens, Long cachedTokens,
                        Long reasoningTokens, Map<String,Object> detail, String source) {
        public static Usage unknown() { return new Usage(null,null,null,null,null,Map.of(),"UNKNOWN"); }
    }
}
