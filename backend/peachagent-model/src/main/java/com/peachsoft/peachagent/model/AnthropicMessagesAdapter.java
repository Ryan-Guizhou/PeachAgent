package com.peachsoft.peachagent.model;

import com.peachsoft.peachagent.common.DomainException;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.Map;
import java.util.Set;

import org.springframework.stereotype.Component;

import tools.jackson.databind.json.JsonMapper;

/**
 * Anthropic Messages 原生流协议，不把它当作 OpenAI 请求。
 * @Author Mr Shu
 * @Version 1.0.0
 * @CreateTime 2026/11/24 11:32
 */
@Component
public class AnthropicMessagesAdapter implements ModelProtocolAdapter {
    private final JsonMapper mapper;

    public AnthropicMessagesAdapter(JsonMapper mapper) {
        this.mapper = mapper;
    }

    @Override
    public ProtocolDescriptor descriptor() {
        return new ProtocolDescriptor(
                new ProtocolKey("anthropic.messages", "v1"),
                "peachagent.anthropic.messages",
                "1.0.0",
                Map.of("LLM", Set.of("CHAT")),
                Set.of("API_KEY"),
                Map.of("type", "object", "properties", Map.of(), "additionalProperties", false),
                Map.of(
                        "type",
                        "object",
                        "properties",
                        Map.of(
                                "temperature",
                                Map.of("type", "number", "minimum", 0, "maximum", 1),
                                "maxOutputTokens",
                                Map.of("type", "integer", "minimum", 1, "maximum", 32768),
                                "contextWindow",
                                Map.of("type", "integer", "minimum", 512, "maximum", 1048576)),
                        "additionalProperties",
                        false),
                true,
                true,
                "Input and output reported in message_start/message_delta");
    }

    @Override
    public void validate(ProtocolConfiguration c) {
        if (!"API_KEY".equals(c.authMethod()) || !"LLM".equals(c.modelType()))
            throw ProtocolSupport.invalid("Protocol/type/auth mismatch");
        ProtocolSupport.keys(c.connectionOptions(), Set.of());
        ProtocolSupport.keys(c.modelOptions(), Set.of("temperature", "maxOutputTokens", "contextWindow"));
        ProtocolSupport.range(c.modelOptions(), "temperature", 0, 1);
        ProtocolSupport.range(c.modelOptions(), "maxOutputTokens", 1, 32768);
        ProtocolSupport.range(c.modelOptions(), "contextWindow", 512, 1048576);
    }

    @Override
    public ModelExecution execute(ModelExecutionRequest r, ModelExecutionContext c) throws Exception {
        if (!"CHAT".equals(r.operation())) throw ProtocolSupport.invalid("Unsupported operation");
        var body = new HashMap<String, Object>();
        body.put("model", r.externalModelId());
        body.put("stream", true);
        body.put("max_tokens", r.maxOutputTokens());
        var messages = new ArrayList<Map<String, String>>();
        var system = new ArrayList<String>();
        for (var m : r.messages()) {
            if ("system".equals(m.role())) system.add(m.content());
            else if (Set.of("user", "assistant").contains(m.role()))
                messages.add(Map.of("role", m.role(), "content", m.content()));
            else throw ProtocolSupport.invalid("Unsupported role");
        }
        if (!system.isEmpty()) body.put("system", String.join("\n\n", system));
        body.put("messages", messages);
        if (r.options().containsKey("temperature"))
            body.put("temperature", r.options().get("temperature"));
        try (var response = c.transport()
                .post(
                        "messages",
                        mapper.writeValueAsBytes(body),
                        "application/json",
                        Map.of("anthropic-version", "2023-06-01"),
                        c)) {
            StringBuilder result = new StringBuilder();
            Long[] usage = {null, null};
            boolean[] stopped = {false};
            ProtocolSupport.sse(response, mapper, (event, node) -> {
                String kind = node.path("type").asText(event);
                switch (kind) {
                    case "message_start" -> {
                        usage[0] = ProtocolSupport.count(node.path("message").path("usage"), "input_tokens");
                        usage[1] = ProtocolSupport.count(node.path("message").path("usage"), "output_tokens");
                    }
                    case "content_block_delta" -> {
                        String text = node.path("delta").path("text").asText("");
                        if (result.length() + text.length() > 1024 * 1024) throw ProtocolSupport.invalidResponse();
                        result.append(text);
                        c.emit(text);
                    }
                    case "message_delta" -> {
                        Long count = ProtocolSupport.count(node.path("usage"), "output_tokens");
                        if (count != null) usage[1] = count;
                    }
                    case "message_stop" -> stopped[0] = true;
                    case "error" -> throw ProtocolSupport.invalidResponse();
                    default -> {}
                }
            });
            if (!stopped[0])
                throw new DomainException("MODEL_STREAM_INTERRUPTED", 502, "Model stream ended without terminal event");
            Long total = usage[0] != null && usage[1] != null ? Math.addExact(usage[0], usage[1]) : null;
            return new ModelExecution(
                    Map.of("text", result.toString()),
                    new ModelExecution.Usage(
                            usage[0], usage[1], total, null, null, Map.of(), total == null ? "UNKNOWN" : "REPORTED"),
                    null,
                    null,
                    response.requestId());
        }
    }
}
