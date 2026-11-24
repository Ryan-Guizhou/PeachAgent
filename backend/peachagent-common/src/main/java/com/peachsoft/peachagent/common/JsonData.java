package com.peachsoft.peachagent.common;

import java.sql.ResultSet;
import java.sql.ResultSetMetaData;
import java.sql.SQLException;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

import tools.jackson.databind.json.JsonMapper;

/**
 * 显式 SQL 投影转换为 API JSON，不将完整数据库行或秘密暴露给客户端。
 * @Author Mr Shu
 * @Version 1.0.0
 * @CreateTime 2026/11/24 11:36
 */
public final class JsonData {
    private JsonData() {}

    @SuppressWarnings("unchecked")
    public static Map<String, Object> object(JsonMapper mapper, Object value) {
        if (value == null) return Map.of();
        if (value instanceof Map<?, ?> map) return (Map<String, Object>) map;
        return mapper.readValue(value.toString(), Map.class);
    }

    public static Map<String, Object> view(JsonMapper mapper, Map<String, Object> row, String... jsonFields) {
        var result = new LinkedHashMap<String, Object>();
        row.forEach((key, value) -> {
            String[] parts = key.toLowerCase(Locale.ROOT).split("_");
            var name = new StringBuilder(parts[0]);
            for (int i = 1; i < parts.length; i++)
                name.append(Character.toUpperCase(parts[i].charAt(0))).append(parts[i].substring(1));
            result.put(
                    name.toString(),
                    value != null && List.of(jsonFields).contains(key.toUpperCase(Locale.ROOT))
                            ? mapper.readTree(value.toString())
                            : value);
        });
        return result;
    }

    /** JDBC 直接映射固定投影，避免每行构造中间大小写无关 Map。 */
    public static List<Map<String, Object>> readRows(ResultSet rs) throws SQLException {
        ResultSetMetaData meta = rs.getMetaData();
        int count = meta.getColumnCount();
        String[] names = new String[count];
        for (int index = 0; index < count; index++) {
            String[] parts =
                    meta.getColumnLabel(index + 1).toLowerCase(Locale.ROOT).split("_");
            var name = new StringBuilder(parts[0]);
            for (int i = 1; i < parts.length; i++)
                name.append(Character.toUpperCase(parts[i].charAt(0))).append(parts[i].substring(1));
            names[index] = name.toString();
        }
        List<Map<String, Object>> rows = new ArrayList<>();
        while (rs.next()) {
            Map<String, Object> row = new LinkedHashMap<>();
            for (int index = 0; index < count; index++) row.put(names[index], rs.getObject(index + 1));
            rows.add(row);
        }
        return rows;
    }

    public static String requiredText(String value, int max) {
        if (value == null || value.isBlank() || value.length() > max)
            throw new DomainException("INVALID_FIELD", 422, "Required field missing or too long");
        return value;
    }
}
