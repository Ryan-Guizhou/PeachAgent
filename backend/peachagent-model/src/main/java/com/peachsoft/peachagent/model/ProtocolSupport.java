package com.peachsoft.peachagent.model;

import com.peachsoft.peachagent.common.DomainException;
import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.util.Map;
import java.util.Set;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/** 协议参数校验和有界 SSE 解析的共享实现。 */
final class ProtocolSupport {
    private ProtocolSupport() { }

    static void keys(Map<String,Object> values,Set<String> allowed) {
        if(values!=null&&!allowed.containsAll(values.keySet()))throw invalid("Unsupported protocol option");
    }
    static void range(Map<String,Object> options,String key,double min,double max) {
        Object v=options==null?null:options.get(key);
        if(v!=null&&(!(v instanceof Number n)||!Double.isFinite(n.doubleValue())||n.doubleValue()<min||n.doubleValue()>max))
            throw invalid("Invalid "+key);
    }
    static String text(Map<String,Object> input,String key,int max) {
        Object v=input==null?null:input.get(key);
        if(!(v instanceof String s)||s.isBlank()||s.length()>max)throw invalid("Invalid "+key);
        return s;
    }
    static DomainException invalid(String message){return new DomainException("MODEL_CONFIG_INVALID",422,message);}
    static DomainException invalidResponse(){return new DomainException("MODEL_RESPONSE_INVALID",502,"Invalid model response");}
    static Long count(JsonNode node,String key) {
        JsonNode item=node.path(key);
        if(item.isIntegralNumber()&&item.canConvertToLong()&&item.asLong()>=0)return item.asLong();
        return null;
    }
    static ModelExecution.Usage usage(JsonNode value,String in,String out,String total) {
        Long i=count(value,in),o=count(value,out),t=count(value,total);
        if(t==null&&i!=null&&o!=null)try{t=Math.addExact(i,o);}catch(ArithmeticException ignored){t=null;}
        Long cached=count(value.path("prompt_tokens_details"),"cached_tokens");
        Long reasoning=count(value.path("completion_tokens_details"),"reasoning_tokens");
        return new ModelExecution.Usage(i,o,t,cached,reasoning,Map.of(),i!=null||o!=null||t!=null?"REPORTED":"UNKNOWN");
    }
    static JsonNode json(ControlledTransport.Response response,JsonMapper mapper)throws Exception{
        try(var in=response.stream(32L*1024*1024)){return mapper.readTree(in);}
    }
    interface EventConsumer {void accept(String event,JsonNode json);}
    static boolean sse(ControlledTransport.Response response,JsonMapper mapper,EventConsumer consumer)throws Exception{
        if(response.contentType()==null||!response.contentType().contains("text/event-stream"))throw invalidResponse();
        boolean done=false;
        try(var reader=new BufferedReader(new InputStreamReader(response.stream(16L*1024*1024),StandardCharsets.UTF_8))){
            String line,event="";StringBuilder data=new StringBuilder();
            while((line=reader.readLine())!=null){
                if(line.length()>1024*1024)throw invalidResponse();
                if(line.isEmpty()){
                    if(!data.isEmpty()){
                        String value=data.toString();
                        if("[DONE]".equals(value)){done=true;break;}
                        consumer.accept(event,mapper.readTree(value));data.setLength(0);
                    }
                    event="";
                }else if(line.startsWith("event:"))event=line.substring(6).strip();
                else if(line.startsWith("data:")){
                    if(!data.isEmpty())data.append('\n');
                    data.append(line.substring(5).stripLeading());
                    if(data.length()>1024*1024)throw invalidResponse();
                }
            }
            if(!data.isEmpty()&&!done){
                if("[DONE]".equals(data.toString()))done=true;
                else consumer.accept(event,mapper.readTree(data.toString()));
            }
        }
        return done;
    }
    static boolean wav(byte[] bytes){
        return bytes!=null&&bytes.length>=12&&bytes[0]=='R'&&bytes[1]=='I'&&bytes[2]=='F'&&bytes[3]=='F'
                &&bytes[8]=='W'&&bytes[9]=='A'&&bytes[10]=='V'&&bytes[11]=='E';
    }
}
