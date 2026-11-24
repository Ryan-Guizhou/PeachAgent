package com.peachsoft.peachagent.model;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import org.springframework.stereotype.Component;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/** DashScope 原生重排序协议。 */
@Component
public class DashScopeRerankAdapter implements ModelProtocolAdapter {
    private final JsonMapper mapper;
    public DashScopeRerankAdapter(JsonMapper mapper){this.mapper=mapper;}
    @Override public ProtocolDescriptor descriptor(){
        return new ProtocolDescriptor(new ProtocolKey("dashscope.text-rerank","v1"),"peachagent.dashscope.text-rerank","1.0.0",
                Map.of("RERANK",Set.of("RERANK")),Set.of("BEARER"),
                Map.of("type","object","properties",Map.of(),"additionalProperties",false),
                Map.of("type","object","properties",Map.of("topN",Map.of("type","integer","minimum",1,"maximum",100)),"additionalProperties",false),
                false,true,"Reported provider usage, otherwise unknown");
    }
    @Override public void validate(ProtocolConfiguration c){
        if(!"RERANK".equals(c.modelType())||!"BEARER".equals(c.authMethod()))throw ProtocolSupport.invalid("Protocol/type/auth mismatch");
        ProtocolSupport.keys(c.connectionOptions(),Set.of());ProtocolSupport.keys(c.modelOptions(),Set.of("topN"));
        ProtocolSupport.range(c.modelOptions(),"topN",1,100);
    }
    @Override public ModelExecution execute(ModelExecutionRequest r,ModelExecutionContext c)throws Exception{
        if(!"RERANK".equals(r.operation()))throw ProtocolSupport.invalid("Unsupported operation");
        String query=ProtocolSupport.text(r.input(),"query",16000);
        Object input=r.input().get("documents");
        if(!(input instanceof List<?> docs)||docs.isEmpty()||docs.size()>100||
                docs.stream().anyMatch(d->!(d instanceof String s)||s.isBlank()||s.length()>16000))throw ProtocolSupport.invalid("Invalid documents");
        int n=r.options().get("topN") instanceof Number value?Math.min(docs.size(),value.intValue()):Math.min(10,docs.size());
        var body=Map.of("model",r.externalModelId(),"input",Map.of("query",query,"documents",docs),
                "parameters",Map.of("top_n",n,"return_documents",false));
        try(var response=c.transport().post("services/rerank/text-rerank/text-rerank",mapper.writeValueAsBytes(body),"application/json",Map.of(),c)){
            JsonNode json=ProtocolSupport.json(response,mapper),result=json.path("output").path("results");
            if(!result.isArray()||result.size()>n)throw ProtocolSupport.invalidResponse();
            var seen=new HashSet<Integer>();var scores=new ArrayList<Map<String,Object>>();
            for(JsonNode item:result){
                if(!item.path("index").isIntegralNumber()||!item.path("relevance_score").isNumber())throw ProtocolSupport.invalidResponse();
                int index=item.path("index").asInt();double score=item.path("relevance_score").asDouble();
                if(index<0||index>=docs.size()||!seen.add(index)||!Double.isFinite(score))throw ProtocolSupport.invalidResponse();
                scores.add(Map.of("index",index,"score",score));
            }
            return new ModelExecution(Map.of("results",scores),ProtocolSupport.usage(json.path("usage"),"input_tokens","output_tokens","total_tokens"),null,null,response.requestId());
        }
    }
}
