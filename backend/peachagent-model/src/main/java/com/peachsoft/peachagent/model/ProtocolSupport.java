package com.peachsoft.peachagent.model;

import com.peachsoft.peachagent.common.DomainException;
import com.peachsoft.peachagent.model.stream.SseFrameReader;

import java.util.Map;
import java.util.Set;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/**
 * 协议参数校验和有界 SSE 解析的共享实现。
 * @Author Mr Shu
 * @Version 1.0.0
 * @CreateTime 2026/11/24 11:32
 */
final class ProtocolSupport {
    private ProtocolSupport() {}

    static void keys(Map<String, Object> values, Set<String> allowed) {
        if (values != null && !allowed.containsAll(values.keySet())) throw invalid("Unsupported protocol option");
    }

    static void range(Map<String, Object> options, String key, double min, double max) {
        Object v = options == null ? null : options.get(key);
        if (v != null
                && (!(v instanceof Number n)
                        || !Double.isFinite(n.doubleValue())
                        || n.doubleValue() < min
                        || n.doubleValue() > max)) throw invalid("Invalid " + key);
    }

    static String text(Map<String, Object> input, String key, int max) {
        Object v = input == null ? null : input.get(key);
        if (!(v instanceof String s) || s.isBlank() || s.length() > max) throw invalid("Invalid " + key);
        return s;
    }

    static DomainException invalid(String message) {
        return new DomainException("MODEL_CONFIG_INVALID", 422, message);
    }

    static DomainException invalidResponse() {
        return new DomainException("MODEL_RESPONSE_INVALID", 502, "Invalid model response");
    }

    static Long count(JsonNode node, String key) {
        JsonNode item = node.path(key);
        if (item.isIntegralNumber() && item.canConvertToLong() && item.asLong() >= 0) return item.asLong();
        return null;
    }

    static ModelExecution.Usage usage(JsonNode value, String in, String out, String total) {
        Long i = count(value, in), o = count(value, out), t = count(value, total);
        if (t == null && i != null && o != null)
            try {
                t = Math.addExact(i, o);
            } catch (ArithmeticException ignored) {
                t = null;
            }
        Long cached = count(value.path("prompt_tokens_details"), "cached_tokens");
        Long reasoning = count(value.path("completion_tokens_details"), "reasoning_tokens");
        return new ModelExecution.Usage(
                i, o, t, cached, reasoning, Map.of(), i != null || o != null || t != null ? "REPORTED" : "UNKNOWN");
    }

    static JsonNode json(ControlledTransport.Response response, JsonMapper mapper) throws Exception {
        try (var in = response.stream(32L * 1024 * 1024)) {
            return mapper.readTree(in);
        }
    }
    /**
     * 逐事件接收解码后的供应商 JSON 数据。
     * @Author Mr Shu
     * @Version 1.0.0
     * @CreateTime 2026/11/24 11:32
     */
    interface EventConsumer {
        void accept(String event, JsonNode json);
    }

    static boolean sse(ControlledTransport.Response response, JsonMapper mapper, EventConsumer consumer)
            throws Exception {
        if (response.contentType() == null || !response.contentType().contains("text/event-stream"))
            throw invalidResponse();
        try (var stream = response.stream(16L * 1024 * 1024)) {
            return SseFrameReader.read(stream, (event, data) -> consumer.accept(event, mapper.readTree(data)));
        }
    }

    static boolean wav(byte[] bytes) {
        return bytes != null
                && bytes.length >= 12
                && bytes[0] == 'R'
                && bytes[1] == 'I'
                && bytes[2] == 'F'
                && bytes[3] == 'F'
                && bytes[8] == 'W'
                && bytes[9] == 'A'
                && bytes[10] == 'V'
                && bytes[11] == 'E';
    }
}
