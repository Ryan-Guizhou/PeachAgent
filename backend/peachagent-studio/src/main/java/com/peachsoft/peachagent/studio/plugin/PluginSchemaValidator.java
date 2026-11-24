package com.peachsoft.peachagent.studio.plugin;

import com.peachsoft.peachagent.common.DomainException;
import java.math.BigDecimal;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.regex.Pattern;

/** P1 仅验证私有插件配置声明，不加载代码或授予权限。 */
public final class PluginSchemaValidator {

    private static final Set<String> ROOT_KEYS = Set.of("type","properties","required","additionalProperties");
    private static final Set<String> PROPERTY_KEYS = Set.of("type","title","description","enum","minimum","maximum");
    private static final Set<String> TYPES = Set.of("string","number","integer","boolean");
    private static final Pattern NAME = Pattern.compile("[A-Za-z_][A-Za-z0-9_]{0,63}");
    private static final Pattern IDENTIFIER = Pattern.compile("[a-z][a-z0-9._:-]{0,63}");

    private PluginSchemaValidator() {
    }

    /** 校验 P1 支持的有限 Schema 子集，拒绝未知字段与无效约束。 */
    public static void validate(Map<String,Object> schema) {
        if (schema == null || !hasOnlyKeys(schema,ROOT_KEYS) || !"object".equals(schema.get("type"))
                || !(schema.get("properties") instanceof Map<?,?> properties) || properties.size() > 50) {
            throw invalid();
        }
        if (schema.containsKey("additionalProperties") && !(schema.get("additionalProperties") instanceof Boolean)) {
            throw invalid();
        }
        for (var entry : properties.entrySet()) {
            if (!(entry.getKey() instanceof String name) || !NAME.matcher(name).matches()
                    || !(entry.getValue() instanceof Map<?,?> spec)) {
                throw invalid();
            }
            validateProperty(spec);
        }
        if (schema.containsKey("required")) {
            if (!(schema.get("required") instanceof List<?> required)
                    || required.size() > properties.size() || new HashSet<>(required).size() != required.size()
                    || !required.stream().allMatch(x -> x instanceof String && properties.containsKey(x))) {
                throw invalid();
            }
        }
    }

    /** 仅允许去重后的合法权限/扩展点标识；声明不改变实际授权。 */
    public static void validateIdentifiers(List<String> identifiers) {
        if (identifiers == null || identifiers.size() > 20
                || new HashSet<>(identifiers).size() != identifiers.size()
                || identifiers.stream().anyMatch(x -> x == null || !IDENTIFIER.matcher(x).matches())) {
            throw invalid();
        }
    }

    private static boolean hasOnlyKeys(Map<?,?> map,Set<String> allowed) {
        return map.keySet().stream().allMatch(key -> key instanceof String && allowed.contains(key));
    }

    private static void validateProperty(Map<?,?> spec) {
        if (!hasOnlyKeys(spec,PROPERTY_KEYS) || !(spec.get("type") instanceof String type) || !TYPES.contains(type)) {
            throw invalid();
        }
        text(spec,"title",100);
        text(spec,"description",500);
        boolean numeric = "number".equals(type) || "integer".equals(type);
        BigDecimal minimum = bound(spec,"minimum",numeric);
        BigDecimal maximum = bound(spec,"maximum",numeric);
        if (minimum != null && maximum != null && minimum.compareTo(maximum) > 0) {
            throw invalid();
        }
        if (spec.containsKey("enum")) {
            if (!(spec.get("enum") instanceof List<?> values) || values.isEmpty() || values.size() > 100) {
                throw invalid();
            }
            Set<Object> unique = new HashSet<>();
            for (Object value : values) {
                Object normalized = switch (type) {
                    case "string" -> value instanceof String s && s.length() <= 4096 ? s : null;
                    case "boolean" -> value instanceof Boolean ? value : null;
                    default -> numericValue(value,type,minimum,maximum);
                };
                if (normalized == null || !unique.add(normalized)) {
                    throw invalid();
                }
            }
        }
    }

    private static void text(Map<?,?> spec,String key,int max) {
        if (spec.containsKey(key) && (!(spec.get(key) instanceof String s) || s.length() > max)) {
            throw invalid();
        }
    }

    private static BigDecimal bound(Map<?,?> spec,String key,boolean numeric) {
        if (!spec.containsKey(key)) {
            return null;
        }
        if (!numeric) {
            throw invalid();
        }
        return decimal(spec.get(key));
    }

    private static BigDecimal decimal(Object value) {
        if (!(value instanceof Number number)) {
            throw invalid();
        }
        try {
            BigDecimal decimal = new BigDecimal(number.toString());
            if (decimal.precision() > 64 || Math.abs((long)decimal.scale()) > 64) {
                throw invalid();
            }
            return decimal.stripTrailingZeros();
        } catch (NumberFormatException ex) {
            throw invalid();
        }
    }

    private static Object numericValue(Object value,String type,BigDecimal minimum,BigDecimal maximum) {
        BigDecimal number = decimal(value);
        if (("integer".equals(type) && number.scale() > 0)
                || (minimum != null && number.compareTo(minimum) < 0)
                || (maximum != null && number.compareTo(maximum) > 0)) {
            throw invalid();
        }
        return number;
    }

    private static DomainException invalid() {
        return new DomainException("INVALID_MANIFEST",422,"Invalid plugin declaration");
    }
}
