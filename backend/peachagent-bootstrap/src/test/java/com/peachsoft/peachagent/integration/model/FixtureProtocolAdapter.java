package com.peachsoft.peachagent.integration.model;

import com.peachsoft.peachagent.common.DomainException;
import com.peachsoft.peachagent.model.ModelExecution;
import com.peachsoft.peachagent.model.ModelExecutionContext;
import com.peachsoft.peachagent.model.ModelExecutionRequest;
import com.peachsoft.peachagent.model.ModelProtocolAdapter;
import com.peachsoft.peachagent.model.ProtocolConfiguration;
import com.peachsoft.peachagent.model.ProtocolDescriptor;
import com.peachsoft.peachagent.model.ProtocolKey;

import java.util.List;
import java.util.Map;
import java.util.Set;

import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Component;

import tools.jackson.databind.json.JsonMapper;

/**
 * 仅测试 classpath 可见的独立 SPI，用于验证新增协议无需修改内置注册表或前端。
 * @Author Mr Shu
 * @Version 1.0.0
 * @CreateTime 2026/11/24 16:42
 */
@Component
@Profile("qa-protocol")
public final class FixtureProtocolAdapter implements ModelProtocolAdapter {

    private static final ProtocolDescriptor DESCRIPTOR = new ProtocolDescriptor(
            new ProtocolKey("qa.native", "v1"),
            "qa.adapter",
            "1.0.0",
            Map.of("LLM", Set.of("CHAT")),
            Set.of("NONE"),
            Map.of("type", "object", "properties", Map.of(), "additionalProperties", false),
            Map.of(
                    "type",
                    "object",
                    "properties",
                    Map.of(
                            "qaPrefix", Map.of("type", "string", "maxLength", 32),
                            "qaRepeat", Map.of("type", "integer", "minimum", 1, "maximum", 3)),
                    "required",
                    List.of("qaPrefix", "qaRepeat"),
                    "additionalProperties",
                    false),
            false,
            true,
            "Fixture-reported token usage");
    private final JsonMapper mapper;

    public FixtureProtocolAdapter(JsonMapper mapper) {
        if (!"1".equals(System.getenv("PEACHAGENT_ISOLATED_PROTOCOL_TEST"))) {
            throw new IllegalStateException("QA protocol requires isolated test environment");
        }
        this.mapper = mapper;
    }

    @Override
    public ProtocolDescriptor descriptor() {
        return DESCRIPTOR;
    }

    @Override
    public void validate(ProtocolConfiguration configuration) {
        if (!"NONE".equals(configuration.authMethod())
                || !"LLM".equals(configuration.modelType())
                || !configuration.connectionOptions().isEmpty()) {
            throw invalid();
        }
        var options = configuration.modelOptions();
        if (!options.keySet().equals(Set.of("qaPrefix", "qaRepeat"))
                || !(options.get("qaPrefix") instanceof String prefix)
                || prefix.isBlank()
                || prefix.length() > 32
                || !(options.get("qaRepeat") instanceof Number repeat)
                || repeat.intValue() != repeat.doubleValue()
                || repeat.intValue() < 1
                || repeat.intValue() > 3) {
            throw invalid();
        }
    }

    @Override
    public ModelExecution execute(ModelExecutionRequest request, ModelExecutionContext context) throws Exception {
        if (!"CHAT".equals(request.operation()) || request.messages().isEmpty()) throw invalid();
        Map<String, Object> body = Map.of(
                "model",
                request.externalModelId(),
                "text",
                request.messages().getLast().content(),
                "prefix",
                request.options().get("qaPrefix"),
                "repeat",
                request.options().get("qaRepeat"));
        try (var response = context.transport()
                        .post("qa/completion", mapper.writeValueAsBytes(body), "application/json", Map.of(), context);
                var stream = response.stream(65536)) {
            var result = mapper.readTree(stream);
            if (!result.path("text").isTextual()
                    || result.path("inputTokens").asLong(-1) < 0
                    || result.path("outputTokens").asLong(-1) < 0) throw invalid();
            String text = result.path("text").asText();
            long in = result.path("inputTokens").asLong(),
                    out = result.path("outputTokens").asLong();
            context.emit(text);
            return new ModelExecution(
                    Map.of("text", text),
                    new ModelExecution.Usage(in, out, in + out, null, null, Map.of(), "REPORTED"),
                    null,
                    null,
                    response.requestId());
        }
    }

    private static DomainException invalid() {
        return new DomainException("MODEL_CONFIG_INVALID", 422, "Invalid QA protocol configuration");
    }
}
