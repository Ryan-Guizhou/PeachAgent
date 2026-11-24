package com.peachsoft.peachagent.studio;

import com.peachsoft.peachagent.iam.IdentityService;
import java.util.List;
import java.util.Map;
import org.springframework.context.annotation.Profile;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1/workspaces/{w}")
@Profile("api")
public class StudioController {
    private final IdentityService identity;private final PromptService prompts;private final ConversationService chat;private final PluginManifestService plugins;
    public StudioController(IdentityService identity,PromptService prompts,ConversationService chat,PluginManifestService plugins){
        this.identity=identity;this.prompts=prompts;this.chat=chat;this.plugins=plugins;
    }
    public record Revision(long rowVersion) { }
    @GetMapping("/projects/{p}/prompts")
    public List<Map<String,Object>> prompts(@PathVariable String w,@PathVariable String p){return prompts.list(identity.project(w,p));}
    @PostMapping("/projects/{p}/prompts")
    public Map<String,Object> createPrompt(@PathVariable String w,@PathVariable String p,@RequestBody PromptService.Draft d){return prompts.save(identity.project(w,p),null,d);}
    @PatchMapping("/projects/{p}/prompts/{id}")
    public Map<String,Object> savePrompt(@PathVariable String w,@PathVariable String p,@PathVariable String id,@RequestBody PromptService.Draft d){return prompts.save(identity.project(w,p),id,d);}
    @PostMapping("/projects/{p}/prompts/{id}/versions")
    public Map<String,Object> publish(@PathVariable String w,@PathVariable String p,@PathVariable String id,@RequestBody PromptService.Publish input){return prompts.publish(identity.project(w,p),id,input);}
    @GetMapping("/projects/{p}/prompts/{id}/versions")
    public List<Map<String,Object>> versions(@PathVariable String w,@PathVariable String p,@PathVariable String id){return prompts.versions(identity.project(w,p),id);}
    @PostMapping("/projects/{p}/prompts/{id}/preview")
    public Map<String,String> preview(@PathVariable String w,@PathVariable String p,@PathVariable String id,@RequestBody PromptService.Preview input){return Map.of("text",prompts.preview(identity.project(w,p),id,input));}
    @PostMapping("/projects/{p}/prompts/{id}/archive")
    public void archivePrompt(@PathVariable String w,@PathVariable String p,@PathVariable String id,@RequestBody Revision r){prompts.archive(identity.project(w,p),id,r.rowVersion(),true);}
    @PostMapping("/projects/{p}/prompts/{id}/restore")
    public void restorePrompt(@PathVariable String w,@PathVariable String p,@PathVariable String id,@RequestBody Revision r){prompts.archive(identity.project(w,p),id,r.rowVersion(),false);}
    @GetMapping("/projects/{p}/prompt-references")
    public List<Map<String,Object>> references(@PathVariable String w,@PathVariable String p){return prompts.references(identity.project(w,p));}
    @PostMapping("/projects/{p}/prompt-references")
    public void reference(@PathVariable String w,@PathVariable String p,@RequestBody PromptService.Reference input){prompts.reference(identity.project(w,p),input);}
    @PostMapping("/projects/{p}/prompt-references/{id}/revoke")
    public void revoke(@PathVariable String w,@PathVariable String p,@PathVariable String id,@RequestBody Revision r){prompts.revoke(identity.project(w,p),id,r.rowVersion());}
    @GetMapping("/projects/{p}/conversations")
    public List<Map<String,Object>> conversations(@PathVariable String w,@PathVariable String p){return chat.list(identity.project(w,p));}
    @PostMapping("/projects/{p}/conversations")
    public Map<String,Object> createConversation(@PathVariable String w,@PathVariable String p,@RequestBody ConversationService.Create c){return chat.create(identity.project(w,p),c);}
    @GetMapping("/projects/{p}/conversations/{id}/messages")
    public List<Map<String,Object>> messages(@PathVariable String w,@PathVariable String p,@PathVariable String id,@RequestParam(defaultValue="0") long after,@RequestParam(defaultValue="100") int limit){return chat.messages(identity.project(w,p),id,after,limit);}
    @PostMapping("/projects/{p}/conversations/{id}/archive")
    public void archiveConversation(@PathVariable String w,@PathVariable String p,@PathVariable String id,@RequestBody Revision r){chat.archive(identity.project(w,p),id,r.rowVersion(),true);}
    @PostMapping("/projects/{p}/conversations/{id}/restore")
    public void restoreConversation(@PathVariable String w,@PathVariable String p,@PathVariable String id,@RequestBody Revision r){chat.archive(identity.project(w,p),id,r.rowVersion(),false);}
    @PostMapping("/projects/{p}/conversations/{id}/redact")
    public void redact(@PathVariable String w,@PathVariable String p,@PathVariable String id,@RequestBody Revision r){chat.redact(identity.project(w,p),id,r.rowVersion());}
    @PostMapping("/projects/{p}/conversations/{id}/messages/{m}/feedback")
    public void feedback(@PathVariable String w,@PathVariable String p,@PathVariable String id,@PathVariable String m,@RequestBody ConversationService.Feedback f){chat.feedback(identity.project(w,p),id,m,f);}
    @GetMapping("/plugin-manifests")
    public List<Map<String,Object>> manifests(@PathVariable String w){return plugins.list(identity.workspace(w));}
    @PostMapping("/plugin-manifests")
    public Map<String,Object> manifest(@PathVariable String w,@RequestBody PluginManifestService.Manifest input){return plugins.create(identity.workspace(w),input);}
    @PostMapping("/plugin-manifests/validate")
    public Map<String,Boolean> validate(@PathVariable String w,@RequestBody PluginManifestService.Manifest input){identity.workspace(w);plugins.validate(input);return Map.of("valid",true);}
    @PostMapping("/plugin-manifests/{id}/declare")
    public void declare(@PathVariable String w,@PathVariable String id,@RequestBody Revision r){plugins.change(identity.workspace(w),id,r.rowVersion(),true);}
    @PostMapping("/plugin-manifests/{id}/archive")
    public void archiveManifest(@PathVariable String w,@PathVariable String id,@RequestBody Revision r){plugins.change(identity.workspace(w),id,r.rowVersion(),false);}
}
