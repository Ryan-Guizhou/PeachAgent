package com.peachsoft.peachagent.runtime;

import cn.dev33.satoken.stp.StpUtil;
import com.peachsoft.peachagent.common.DomainException;
import com.peachsoft.peachagent.iam.IdentityService;
import java.nio.charset.StandardCharsets;
import java.util.*;
import java.util.concurrent.Semaphore;
import org.springframework.context.annotation.Profile;
import org.springframework.http.*;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.servlet.mvc.method.annotation.StreamingResponseBody;
import tools.jackson.databind.json.JsonMapper;

@RestController
@Profile("api")
@RequestMapping("/api/v1/workspaces/{w}/projects/{p}")
public class RunController {
    private final IdentityService identity;private final RunService runs;private final ArtifactStore artifacts;private final JsonMapper mapper;
    private final Semaphore streams=new Semaphore(64);
    public RunController(IdentityService identity,RunService runs,ArtifactStore artifacts,JsonMapper mapper){this.identity=identity;this.runs=runs;this.artifacts=artifacts;this.mapper=mapper;}
    public record Retry(boolean acknowledgeUnknown) { }
    @PostMapping("/conversations/{id}/runs")
    public Map<String,Object> submit(@PathVariable String w,@PathVariable String p,@PathVariable String id,
            @RequestHeader("Idempotency-Key") String key,@RequestBody RunService.ChatInput input){return runs.submit(identity.project(w,p),id,input,key);}
    @PostMapping("/models/{id}/debug")
    public Map<String,Object> debug(@PathVariable String w,@PathVariable String p,@PathVariable String id,
            @RequestHeader("Idempotency-Key") String key,@RequestBody RunService.DebugInput input){return runs.debug(identity.project(w,p),id,input,key);}
    @GetMapping("/runs")
    public List<Map<String,Object>> list(@PathVariable String w,@PathVariable String p,@RequestParam(required=false) String before,
            @RequestParam(required=false) String beforeId,@RequestParam(defaultValue="50") int limit){
        return runs.list(identity.project(w,p),before,beforeId,limit);
    }
    @GetMapping("/runs/{id}")
    public Map<String,Object> get(@PathVariable String w,@PathVariable String p,@PathVariable String id){return runs.get(identity.project(w,p),id);}
    @PostMapping("/runs/{id}/cancel")
    public Map<String,Object> cancel(@PathVariable String w,@PathVariable String p,@PathVariable String id){return runs.cancel(identity.project(w,p),id);}
    @PostMapping("/runs/{id}/retry")
    public Map<String,Object> retry(@PathVariable String w,@PathVariable String p,@PathVariable String id,@RequestHeader("Idempotency-Key") String key,@RequestBody Retry input){return runs.retry(identity.project(w,p),id,key,input.acknowledgeUnknown());}
    @GetMapping(value="/runs/{id}/events",produces=MediaType.TEXT_EVENT_STREAM_VALUE)
    public ResponseEntity<StreamingResponseBody> events(@PathVariable String w,@PathVariable String p,@PathVariable String id,
            @RequestHeader(value="Last-Event-ID",required=false) Long last,@RequestParam(defaultValue="0") long after){
        var principal=identity.current();var scope=identity.project(principal,w,p,false);runs.get(scope,id);String token=StpUtil.getTokenValue();
        long cursor=Math.max(after,last==null?0:last);
        StreamingResponseBody body=out->{
            if(!streams.tryAcquire())return;
            try{
                long seq=cursor,end=System.nanoTime()+25_000_000_000L;
                while(System.nanoTime()<end){
                    Object logged=StpUtil.getLoginIdByToken(token);
                    if(logged==null||!scope.userId().equals(logged.toString()))break;
                    var current=identity.active(scope.userId());
                    if(current.authEpoch()!=principal.authEpoch())break;
                    identity.assertCurrentScope(current,scope);
                    var page=runs.eventPage(scope,id,seq);
                    for(var event:page.events()){
                        seq=((Number)event.get("seq")).longValue();
                        String data="id: "+seq+"\nevent: "+event.get("eventType")+"\ndata: "+mapper.writeValueAsString(event)+"\n\n";
                        out.write(data.getBytes(StandardCharsets.UTF_8));out.flush();
                    }
                    if(page.drained(seq))break;
                    if(page.events().size()==100)continue;
                    if(page.events().isEmpty()){out.write(": heartbeat\n\n".getBytes(StandardCharsets.UTF_8));out.flush();}
                    try{Thread.sleep(100);}catch(InterruptedException ex){Thread.currentThread().interrupt();break;}
                }
            }catch(DomainException ex){/* 权限变更立即关闭流，客户端重新鉴权。 */}
            finally{streams.release();}
        };
        return ResponseEntity.ok().contentType(MediaType.TEXT_EVENT_STREAM).header("Cache-Control","no-cache, no-store").header("X-Accel-Buffering","no").body(body);
    }
    @GetMapping("/runs/{id}/artifacts/{artifact}")
    public ResponseEntity<byte[]> artifact(@PathVariable String w,@PathVariable String p,@PathVariable String id,@PathVariable String artifact){
        var data=artifacts.read(identity.project(w,p),id,artifact);
        return ResponseEntity.ok().contentType(MediaType.parseMediaType(data.mime())).header("Content-Disposition","attachment; filename=\""+data.name()+"\"")
                .header("X-Content-Type-Options","nosniff").header("Cache-Control","no-store").body(data.bytes());
    }
}
