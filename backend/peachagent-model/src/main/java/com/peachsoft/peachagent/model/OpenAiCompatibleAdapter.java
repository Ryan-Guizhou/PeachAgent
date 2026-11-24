package com.peachsoft.peachagent.model;

import com.peachsoft.peachagent.common.DomainException;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Base64;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/** OpenAI-compatible 六类中的五类协议，按操作选择明确的 endpoint。 */
public final class OpenAiCompatibleAdapter implements ModelProtocolAdapter {
    private final JsonMapper mapper;
    private final String type,operation,path;
    private final ProtocolDescriptor descriptor;

    public OpenAiCompatibleAdapter(JsonMapper mapper,String key,String type,String operation,String path){
        this.mapper=mapper;this.type=type;this.operation=operation;this.path=path;
        Map<String,Object> properties=switch(type){
            case "LLM" -> Map.of("temperature",Map.of("type","number","minimum",0,"maximum",2),
                    "maxOutputTokens",Map.of("type","integer","minimum",1,"maximum",32768),
                    "contextWindow",Map.of("type","integer","minimum",512,"maximum",1048576),
                    "includeUsage",Map.of("type","boolean"),"completionTokenParameter",Map.of("type","boolean"));
            case "IMAGE" -> Map.of("size",Map.of("type","string","enum",List.of("256x256","512x512","1024x1024")));
            case "TTS" -> Map.of("voice",Map.of("type","string","maxLength",80));
            default -> Map.of();
        };
        descriptor=new ProtocolDescriptor(new ProtocolKey(key,"v1"),"peachagent."+key,"1.0.0",
                Map.of(type,Set.of(operation)),Set.of("BEARER","NONE"),
                Map.of("type","object","properties",Map.of(),"additionalProperties",false),
                Map.of("type","object","properties",properties,"additionalProperties",false),
                "LLM".equals(type),true,"Provider-reported usage; absent values remain unknown");
    }

    @Override public ProtocolDescriptor descriptor(){return descriptor;}

    @Override public void validate(ProtocolConfiguration config){
        if(!type.equals(config.modelType())||!descriptor.authMethods().contains(config.authMethod()))throw ProtocolSupport.invalid("Protocol/type/auth mismatch");
        ProtocolSupport.keys(config.connectionOptions(),Set.of());
        var options=config.modelOptions()==null?Map.<String,Object>of():config.modelOptions();
        @SuppressWarnings("unchecked") var properties=(Map<String,Object>)descriptor.modelSchema().get("properties");
        ProtocolSupport.keys(options,properties.keySet());
        ProtocolSupport.range(options,"temperature",0,2);ProtocolSupport.range(options,"maxOutputTokens",1,32768);
        ProtocolSupport.range(options,"contextWindow",512,1048576);
        for(String k:List.of("maxOutputTokens","contextWindow"))if(options.get(k) instanceof Number n&&n.doubleValue()!=n.longValue())throw ProtocolSupport.invalid("Expected integer "+k);
        for(String k:List.of("includeUsage","completionTokenParameter"))if(options.containsKey(k)&&!(options.get(k) instanceof Boolean))throw ProtocolSupport.invalid("Expected boolean "+k);
        if(options.containsKey("size")&&!Set.of("256x256","512x512","1024x1024").contains(options.get("size")))throw ProtocolSupport.invalid("Invalid size");
        if(options.containsKey("voice")&&(!(options.get("voice") instanceof String s)||s.isBlank()||s.length()>80))throw ProtocolSupport.invalid("Invalid voice");
    }

    @Override public ModelExecution execute(ModelExecutionRequest request,ModelExecutionContext context)throws Exception{
        if(!operation.equals(request.operation()))throw ProtocolSupport.invalid("Operation not supported");
        Map<String,Object> body=new HashMap<>();body.put("model",request.externalModelId());
        Map<String,Object> options=request.options()==null?Map.of():request.options();
        if("CHAT".equals(operation)){
            var messages=new ArrayList<Map<String,String>>();
            for(var msg:request.messages()){
                if(!Set.of("system","user","assistant").contains(msg.role()))throw ProtocolSupport.invalid("Unsupported message role");
                messages.add(Map.of("role",msg.role(),"content",msg.content()));
            }
            body.put("messages",messages);body.put("stream",true);
            if(!Boolean.FALSE.equals(options.get("includeUsage")))body.put("stream_options",Map.of("include_usage",true));
            body.put(Boolean.TRUE.equals(options.get("completionTokenParameter"))?"max_completion_tokens":"max_tokens",request.maxOutputTokens());
            if(options.containsKey("temperature"))body.put("temperature",options.get("temperature"));
            try(var response=context.transport().post(path,mapper.writeValueAsBytes(body),"application/json",Map.of(),context)){
                StringBuilder result=new StringBuilder();ModelExecution.Usage[] usage={ModelExecution.Usage.unknown()};
                boolean done=ProtocolSupport.sse(response,mapper,(event,node)->{
                    if(node.hasNonNull("error"))throw ProtocolSupport.invalidResponse();
                    JsonNode choices=node.path("choices");
                    if(choices.isArray()&&!choices.isEmpty()){
                        String delta=choices.get(0).path("delta").path("content").asText("");
                        if(result.length()+delta.length()>1024*1024)throw ProtocolSupport.invalidResponse();
                        result.append(delta);context.emit(delta);
                    }
                    if(node.hasNonNull("usage"))usage[0]=ProtocolSupport.usage(node.path("usage"),"prompt_tokens","completion_tokens","total_tokens");
                });
                if(!done)throw new DomainException("MODEL_STREAM_INTERRUPTED",502,"Model stream ended without terminal event");
                return new ModelExecution(Map.of("text",result.toString()),usage[0],null,null,response.requestId());
            }
        }
        if("EMBED".equals(operation))body.put("input",ProtocolSupport.text(request.input(),"text",65536));
        if("GENERATE_IMAGE".equals(operation)){
            body.put("prompt",ProtocolSupport.text(request.input(),"text",8000));body.put("n",1);
            body.put("response_format","b64_json");body.put("size",options.getOrDefault("size","1024x1024"));
        }
        if("SYNTHESIZE".equals(operation)){
            body.put("input",ProtocolSupport.text(request.input(),"text",8000));body.put("voice",options.getOrDefault("voice","alloy"));body.put("response_format","wav");
        }
        if("TRANSCRIBE".equals(operation)){
            byte[] audio=request.audio();
            if(!ProtocolSupport.wav(audio)||audio.length>10*1024*1024)throw ProtocolSupport.invalid("Only bounded WAV audio is supported");
            String boundary="PeachAgent"+UUID.randomUUID().toString().replace("-","");
            var multipart=new java.io.ByteArrayOutputStream();
            multipart.write(("--"+boundary+"\r\nContent-Disposition: form-data; name=\"model\"\r\n\r\n"+request.externalModelId()
                    +"\r\n--"+boundary+"\r\nContent-Disposition: form-data; name=\"file\"; filename=\"input.wav\"\r\nContent-Type: audio/wav\r\n\r\n").getBytes(StandardCharsets.UTF_8));
            multipart.write(audio);multipart.write(("\r\n--"+boundary+"--\r\n").getBytes(StandardCharsets.UTF_8));
            try(var response=context.transport().post(path,multipart.toByteArray(),"multipart/form-data; boundary="+boundary,Map.of(),context)){
                JsonNode json=ProtocolSupport.json(response,mapper);
                if(!json.path("text").isTextual())throw ProtocolSupport.invalidResponse();
                return new ModelExecution(Map.of("text",json.path("text").asText()),ModelExecution.Usage.unknown(),null,null,response.requestId());
            }
        }
        try(var response=context.transport().post(path,mapper.writeValueAsBytes(body),"application/json",Map.of(),context)){
            if("SYNTHESIZE".equals(operation)){
                byte[] audio;try(var in=response.stream(20L*1024*1024)){audio=in.readAllBytes();}
                if(!ProtocolSupport.wav(audio))throw ProtocolSupport.invalidResponse();
                return new ModelExecution(Map.of("bytes",audio.length),ModelExecution.Usage.unknown(),audio,"audio/wav",response.requestId());
            }
            JsonNode json=ProtocolSupport.json(response,mapper);
            if(json.hasNonNull("error"))throw ProtocolSupport.invalidResponse();
            if("EMBED".equals(operation)){
                JsonNode vector=json.path("data").path(0).path("embedding");
                if(!vector.isArray()||vector.isEmpty()||vector.size()>65536)throw ProtocolSupport.invalidResponse();
                List<Double> values=new ArrayList<>();
                for(JsonNode item:vector){
                    if(!item.isNumber()||!Double.isFinite(item.asDouble()))throw ProtocolSupport.invalidResponse();
                    values.add(item.asDouble());
                }
                return new ModelExecution(Map.of("dimensions",values.size(),"vector",values),
                        ProtocolSupport.usage(json.path("usage"),"prompt_tokens","completion_tokens","total_tokens"),null,null,response.requestId());
            }
            if("GENERATE_IMAGE".equals(operation)){
                String encoded=json.path("data").path(0).path("b64_json").asText("");
                if(encoded.isBlank()||encoded.length()>28*1024*1024)throw ProtocolSupport.invalidResponse();
                byte[] image=Base64.getDecoder().decode(encoded);
                if(image.length<8||image.length>20*1024*1024||(image[0]&255)!=137||image[1]!='P'||image[2]!='N'||image[3]!='G')
                    throw ProtocolSupport.invalidResponse();
                return new ModelExecution(Map.of("bytes",image.length),ModelExecution.Usage.unknown(),image,"image/png",response.requestId());
            }
            throw ProtocolSupport.invalidResponse();
        }
    }
}
