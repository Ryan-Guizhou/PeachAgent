package com.peachsoft.peachagent.studio;

import com.peachsoft.peachagent.common.DomainException;

import java.util.Map;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

/**
 * 验证受控变量渲染、缺失或非法参数拒绝及表达式注入防护。
 * @Author Mr Shu
 * @Version 1.0.0
 * @CreateTime 2026/11/24 11:36
 */
class PromptTemplateTest {
    @Test
    void literalAndTypedVariables() {
        var schema = Map.<String, Object>of("name", Map.of("type", "string", "required", true));
        assertEquals("Hello {{other}}", PromptTemplate.render("Hello {{name}}", schema, Map.of("name", "{{other}}")));
        assertThrows(DomainException.class, () -> PromptTemplate.render("Hello {{name}}", schema, Map.of()));
        assertThrows(DomainException.class, () -> PromptTemplate.render("Hello {{name}}", schema, Map.of("name", 1)));
        assertThrows(DomainException.class, () -> PromptTemplate.validate("{{T(java.lang.Runtime)}}", Map.of()));
    }
}
