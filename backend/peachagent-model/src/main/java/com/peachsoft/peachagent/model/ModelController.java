package com.peachsoft.peachagent.model;

import com.peachsoft.peachagent.iam.IdentityService;
import java.util.List;
import java.util.Map;
import org.springframework.context.annotation.Profile;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1")
@Profile("api")
public class ModelController {
    private final IdentityService identity;
    private final ModelService models;
    private final CredentialService credentials;
    private final ModelProtocolRegistry protocols;
    public ModelController(IdentityService identity,ModelService models,CredentialService credentials,ModelProtocolRegistry protocols){
        this.identity=identity;this.models=models;this.credentials=credentials;this.protocols=protocols;
    }
    public record Revision(long rowVersion) { }
    public record Binding(String modelId,boolean active) { }
    public record DefaultModel(String purpose,String modelId) { }

    @GetMapping("/model-protocols")
    public List<ProtocolDescriptor> protocols(){return protocols.list();}
    @GetMapping("/workspaces/{w}/credentials")
    public List<Map<String,Object>> credentials(@PathVariable String w){return credentials.list(identity.workspace(w));}
    @PostMapping("/workspaces/{w}/credentials")
    public Map<String,Object> createCredential(@PathVariable String w,@RequestBody CredentialService.Create input){return credentials.create(identity.workspace(w),input);}
    @PostMapping("/workspaces/{w}/credentials/{id}/rotate")
    public Map<String,Object> rotate(@PathVariable String w,@PathVariable String id,@RequestBody CredentialService.Rotate input){return credentials.rotate(identity.workspace(w),id,input);}
    @PostMapping("/workspaces/{w}/credentials/{id}/revoke")
    public Map<String,Object> revoke(@PathVariable String w,@PathVariable String id,@RequestBody Revision input){return credentials.revoke(identity.workspace(w),id,input.rowVersion());}
    @GetMapping("/workspaces/{w}/providers")
    public List<Map<String,Object>> providers(@PathVariable String w){return models.providers(identity.workspace(w));}
    @PostMapping("/workspaces/{w}/providers")
    public Map<String,Object> createProvider(@PathVariable String w,@RequestBody ModelService.ProviderInput input){return models.saveProvider(identity.workspace(w),null,input);}
    @PatchMapping("/workspaces/{w}/providers/{id}")
    public Map<String,Object> updateProvider(@PathVariable String w,@PathVariable String id,@RequestBody ModelService.ProviderInput input){return models.saveProvider(identity.workspace(w),id,input);}
    @PostMapping("/workspaces/{w}/providers/{id}/verify")
    public Map<String,Object> verify(@PathVariable String w,@PathVariable String id){return models.verifyProvider(identity.workspace(w),id);}
    @PostMapping("/workspaces/{w}/providers/{id}/archive")
    public void archiveProvider(@PathVariable String w,@PathVariable String id,@RequestBody Revision input){models.archive(identity.workspace(w),"provider",id,input.rowVersion());}
    @GetMapping("/workspaces/{w}/models")
    public List<Map<String,Object>> models(@PathVariable String w){return models.models(identity.workspace(w));}
    @PostMapping("/workspaces/{w}/models")
    public Map<String,Object> createModel(@PathVariable String w,@RequestBody ModelService.ModelInput input){return models.saveModel(identity.workspace(w),null,input);}
    @PatchMapping("/workspaces/{w}/models/{id}")
    public Map<String,Object> updateModel(@PathVariable String w,@PathVariable String id,@RequestBody ModelService.ModelInput input){return models.saveModel(identity.workspace(w),id,input);}
    @PostMapping("/workspaces/{w}/models/{id}/archive")
    public void archiveModel(@PathVariable String w,@PathVariable String id,@RequestBody Revision input){models.archive(identity.workspace(w),"model",id,input.rowVersion());}
    @GetMapping("/workspaces/{w}/projects/{p}/model-bindings")
    public List<Map<String,Object>> bindings(@PathVariable String w,@PathVariable String p){return models.bindings(identity.project(w,p));}
    @PostMapping("/workspaces/{w}/projects/{p}/model-bindings")
    public void bind(@PathVariable String w,@PathVariable String p,@RequestBody Binding input){models.binding(identity.project(w,p),input.modelId(),input.active());}
    @GetMapping("/workspaces/{w}/projects/{p}/model-defaults")
    public List<Map<String,Object>> defaults(@PathVariable String w,@PathVariable String p){return models.defaults(identity.project(w,p));}
    @PostMapping("/workspaces/{w}/projects/{p}/model-defaults")
    public void setDefault(@PathVariable String w,@PathVariable String p,@RequestBody DefaultModel input){models.setDefault(identity.project(w,p),input.purpose(),input.modelId());}
}
