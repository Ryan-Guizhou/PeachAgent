package com.peachsoft.peachagent.common;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.Set;
import tools.jackson.databind.json.JsonMapper;

/** 显式 SQL 投影转换为 API JSON，不将完整数据库行或秘密暴露给客户端。 */
public final class JsonData {
    private JsonData() { }

    @SuppressWarnings("unchecked")
    public static Map<String,Object> object(JsonMapper mapper,Object value) {
        if(value==null)return Map.of();
        if(value instanceof Map<?,?> map)return (Map<String,Object>)map;
        return mapper.readValue(value.toString(),Map.class);
    }

    public static Map<String,Object> view(JsonMapper mapper,Map<String,Object> row,String... jsonFields) {
        var result=new LinkedHashMap<String,Object>();
        row.forEach((key,value)->{
            String[] parts=key.toLowerCase(Locale.ROOT).split("_");
            var name=new StringBuilder(parts[0]);
            for(int i=1;i<parts.length;i++)name.append(Character.toUpperCase(parts[i].charAt(0))).append(parts[i].substring(1));
            result.put(name.toString(),value!=null&&List.of(jsonFields).contains(key.toUpperCase(Locale.ROOT))?mapper.readTree(value.toString()):value);
        });
        return result;
    }

    /** 列表的 JDBC 投影固定，只解析一次列名，不跨请求缓存用户数据。 */
    public static List<Map<String,Object>> viewRows(JsonMapper mapper,List<Map<String,Object>> rows,String... jsonFields){
        if(rows.isEmpty())return List.of();
        Map<String,String> columns=new LinkedHashMap<>();
        for(String key:rows.getFirst().keySet()){
            String[] parts=key.toLowerCase(Locale.ROOT).split("_");
            var name=new StringBuilder(parts[0]);
            for(int i=1;i<parts.length;i++)name.append(Character.toUpperCase(parts[i].charAt(0))).append(parts[i].substring(1));
            columns.put(key,name.toString());
        }
        Set<String> json=new HashSet<>(List.of(jsonFields));
        List<Map<String,Object>> result=new ArrayList<>(rows.size());
        for(var row:rows){
            Map<String,Object> item=new LinkedHashMap<>();
            columns.forEach((key,name)->{
                Object value=row.get(key);
                item.put(name,value!=null&&json.contains(key.toUpperCase(Locale.ROOT))?mapper.readTree(value.toString()):value);
            });
            result.add(item);
        }
        return result;
    }

    public static String requiredText(String value,int max) {
        if(value==null||value.isBlank()||value.length()>max)throw new DomainException("INVALID_FIELD",422,"Required field missing or too long");
        return value;
    }
}
