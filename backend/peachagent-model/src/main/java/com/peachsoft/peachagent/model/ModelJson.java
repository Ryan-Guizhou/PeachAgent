package com.peachsoft.peachagent.model;

import com.peachsoft.peachagent.common.DomainException;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

import tools.jackson.databind.json.JsonMapper;

/**
 * JSON 配置与 JDBC 投影的安全转换，不透传任意表数据。
 * @Author Mr Shu
 * @Version 1.0.0
 * @CreateTime 2026/11/24 11:34
 */
public final class ModelJson {
    private ModelJson() {}

    @SuppressWarnings("unchecked")
    public static Map<String, Object> object(JsonMapper mapper, Object raw) {
        if (raw == null) return Map.of();
        if (raw instanceof Map<?, ?> value) return (Map<String, Object>) value;
        try {
            return mapper.readValue(raw.toString(), Map.class);
        } catch (RuntimeException ex) {
            throw new DomainException("INVALID_JSON", 422, "Invalid configuration JSON");
        }
    }

    public static String name(String value, int max) {
        if (value == null
                || value.isBlank()
                || value.strip().length() > max
                || value.contains("\r")
                || value.contains("\n")) throw new DomainException("INVALID_NAME", 422, "Invalid name or identifier");
        return value.strip();
    }

    public static String required(String value, int max) {
        if (value == null || value.isBlank() || value.length() > max || value.contains("\r") || value.contains("\n"))
            throw new DomainException("INVALID_FIELD", 422, "Invalid value");
        return value;
    }

    public static Map<String, Object> view(Map<String, Object> row, JsonMapper mapper, String... jsonColumns) {
        var result = new LinkedHashMap<String, Object>();
        row.forEach((k, v) -> {
            var parts = k.toLowerCase(Locale.ROOT).split("_");
            StringBuilder name = new StringBuilder(parts[0]);
            for (int i = 1; i < parts.length; i++)
                name.append(Character.toUpperCase(parts[i].charAt(0))).append(parts[i].substring(1));
            result.put(
                    name.toString(),
                    v != null && List.of(jsonColumns).contains(k.toUpperCase(Locale.ROOT)) ? object(mapper, v) : v);
        });
        return result;
    }

    public static void noSecret(Object value) {
        if (value instanceof Map<?, ?> map) {
            for (var e : map.entrySet()) {
                String k = e.getKey()
                        .toString()
                        .toLowerCase(Locale.ROOT)
                        .replace("_", "")
                        .replace("-", "");
                if (List.of(
                                "apikey",
                                "authorization",
                                "password",
                                "secret",
                                "token",
                                "headers",
                                "credential",
                                "baseurl",
                                "url")
                        .contains(k))
                    throw new DomainException(
                            "SECRET_CONFIG_DENIED", 422, "Secrets and endpoints must use dedicated fields");
                noSecret(e.getValue());
            }
        } else if (value instanceof List<?> list) {
            list.forEach(ModelJson::noSecret);
        }
    }
}
