package com.peachsoft.peachagent.model;

import java.util.List;
import java.util.Map;

/** 输入统一契约；模型端点、密钥和供应商 SDK 对象不进入请求。 */
public record ModelExecutionRequest(String operation,String externalModelId,
        List<Message> messages, Map<String,Object> input, Map<String,Object> options,
        Integer maxOutputTokens, byte[] audio) {
    public record Message(String role,String content) { }
}
