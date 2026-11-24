package com.peachsoft.peachagent.studio.plugin;

import com.peachsoft.peachagent.common.DomainException;

import java.util.List;
import java.util.Map;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertThrows;

/**
 * 验证插件 Schema 子集中的类型、边界、唯一性及非法声明。
 * @Author Mr Shu
 * @Version 1.0.0
 * @CreateTime 2026/11/24 15:43
 */
class PluginSchemaValidatorTest {

    private static Map<String, Object> schema(Map<String, Object> property) {
        return Map.of(
                "type",
                "object",
                "properties",
                Map.of("value", property),
                "required",
                List.of("value"),
                "additionalProperties",
                false);
    }

    @Test
    void acceptsSupportedSchemaAndIdentifiers() {
        assertDoesNotThrow(() -> PluginSchemaValidator.validate(
                schema(Map.of("type", "integer", "minimum", 1, "maximum", 3, "enum", List.of(1, 2, 3)))));
        assertDoesNotThrow(
                () -> PluginSchemaValidator.validate(schema(Map.of("type", "boolean", "enum", List.of(true, false)))));
        assertDoesNotThrow(() -> PluginSchemaValidator.validateIdentifiers(List.of("tool:read", "model.invoke")));
    }

    @Test
    void rejectsMalformedAndUnsupportedDeclarations() {
        for (Map<String, Object> property : List.<Map<String, Object>>of(
                Map.of(),
                Map.of("type", "object"),
                Map.of("type", "string", "minimum", 1),
                Map.of("type", "number", "minimum", 5, "maximum", 1),
                Map.of("type", "integer", "enum", List.of(1.2)),
                Map.of("type", "number", "enum", List.of(1, 1.0)),
                Map.of("type", "string", "enum", List.of(1)),
                Map.of("type", "boolean", "enum", List.of()),
                Map.of("type", "string", "title", 42))) {
            assertThrows(DomainException.class, () -> PluginSchemaValidator.validate(schema(property)));
        }
        assertThrows(
                DomainException.class,
                () -> PluginSchemaValidator.validate(
                        Map.of("type", "object", "properties", Map.of(), "additionalProperties", "false")));
        assertThrows(
                DomainException.class,
                () -> PluginSchemaValidator.validate(Map.of(
                        "type",
                        "object",
                        "properties",
                        Map.of("x", Map.of("type", "string")),
                        "required",
                        List.of("x", "x"))));
        assertThrows(
                DomainException.class,
                () -> PluginSchemaValidator.validateIdentifiers(List.of("tool:read", "tool:read")));
    }
}
