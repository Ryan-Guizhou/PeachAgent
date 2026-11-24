package com.peachsoft.peachagent.studio;

import com.peachsoft.peachagent.common.DomainException;

import java.util.HashSet;
import java.util.Map;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * 仅替换受控变量，不执行表达式或脚本，不递归解释用户值。
 * @Author Mr Shu
 * @Version 1.0.0
 * @CreateTime 2026/11/24 11:36
 */
public final class PromptTemplate {
    private static final Pattern VARIABLE = Pattern.compile("\\{\\{([A-Za-z_][A-Za-z0-9_]{0,63})\\}\\}");

    private PromptTemplate() {}

    public static void validate(String content, Map<String, Object> schema) {
        if (content == null || content.length() > 65536 || schema == null || schema.size() > 100)
            throw invalid("Invalid template");
        Set<String> found = new HashSet<>();
        Matcher matcher = VARIABLE.matcher(content);
        String without = matcher.replaceAll("");
        if (without.contains("{{") || without.contains("}}")) throw invalid("Invalid variable expression");
        matcher.reset();
        while (matcher.find()) found.add(matcher.group(1));
        if (!found.equals(schema.keySet())) throw invalid("Template variables and schema must match");
        for (var entry : schema.entrySet()) {
            if (!(entry.getValue() instanceof Map<?, ?> variable)
                    || !variable.keySet().stream()
                            .allMatch(key -> key instanceof String
                                    && Set.of("type", "required", "default").contains(key)))
                throw invalid("Invalid variable schema");
            if (!(variable.get("type") instanceof String type)
                    || !Set.of("string", "number", "boolean").contains(type)) throw invalid("Invalid variable type");
            if (variable.containsKey("required") && !(variable.get("required") instanceof Boolean))
                throw invalid("Invalid required flag");
            if (variable.containsKey("default")) check(variable, variable.get("default"));
        }
    }

    public static String render(String content, Map<String, Object> schema, Map<String, Object> values) {
        validate(content, schema);
        Map<String, Object> inputs = values == null ? Map.of() : values;
        if (!schema.keySet().containsAll(inputs.keySet())) throw invalid("Unknown variable");
        Matcher matcher = VARIABLE.matcher(content);
        StringBuilder result = new StringBuilder();
        while (matcher.find()) {
            Map<?, ?> def = (Map<?, ?>) schema.get(matcher.group(1));
            Object value = inputs.containsKey(matcher.group(1)) ? inputs.get(matcher.group(1)) : def.get("default");
            if (value == null && Boolean.TRUE.equals(def.get("required")))
                throw invalid("Required variable missing: " + matcher.group(1));
            if (value != null) check(def, value);
            matcher.appendReplacement(result, Matcher.quoteReplacement(value == null ? "" : value.toString()));
            if (result.length() > 65536) throw invalid("Rendered prompt too large");
        }
        matcher.appendTail(result);
        if (result.length() > 65536) throw invalid("Rendered prompt too large");
        return result.toString();
    }

    private static void check(Map<?, ?> schema, Object value) {
        boolean valid =
                switch (String.valueOf(schema.get("type"))) {
                    case "string" -> value instanceof String s && s.length() <= 65536;
                    case "number" -> value instanceof Number n && Double.isFinite(n.doubleValue());
                    case "boolean" -> value instanceof Boolean;
                    default -> false;
                };
        if (!valid) throw invalid("Variable value type mismatch");
    }

    private static DomainException invalid(String message) {
        return new DomainException("PROMPT_INVALID", 422, message);
    }
}
