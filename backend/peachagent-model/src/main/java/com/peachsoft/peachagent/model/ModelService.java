package com.peachsoft.peachagent.model;

import com.peachsoft.peachagent.common.DomainException;
import com.peachsoft.peachagent.common.IdGenerator;
import com.peachsoft.peachagent.common.ScopeContext;
import com.peachsoft.peachagent.iam.AuditService;
import com.peachsoft.peachagent.iam.DatabaseTimeProvider;
import com.peachsoft.peachagent.iam.IdentityService;
import com.peachsoft.peachagent.iam.SecurityTokens;
import java.math.BigDecimal;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import tools.jackson.databind.json.JsonMapper;

/** 模型实例、连接、项目绑定及不可变执行配置的权威服务。 */
@Service
public class ModelService {
    private static final String PROVIDER_VIEW="SELECT ID,NAME,VENDOR_KEY,BASE_URL,AUTH_METHOD,CREDENTIAL_ID,PROTOCOL_CONFIG,TIMEOUT_MS,ENABLED,STATUS,CONFIG_REVISION,VERIFY_STATUS,VERIFIED_AT,VERIFY_ERROR_CODE,ROW_VERSION FROM MODEL_PROVIDER";
    private static final String MODEL_VIEW="SELECT ID,PROVIDER_ID,NAME,EXTERNAL_MODEL_ID,MODEL_TYPE,PROTOCOL_KEY,PROTOCOL_VERSION,PROTOCOL_OPTIONS,CAPABILITIES,MODEL_OPTIONS,PRICING,ENABLED,STATUS,CONFIG_REVISION,VERIFY_STATUS,VERIFIED_CONFIG_REVISION,VERIFIED_PROVIDER_REVISION,VERIFIED_CREDENTIAL_REVISION,VERIFIED_ADAPTER_KEY,VERIFIED_ADAPTER_VERSION,VERIFIED_AT,VERIFY_ERROR_CODE,ROW_VERSION FROM MODEL_INSTANCE";
    private static final Map<String,String> OPERATIONS=Map.of("LLM","CHAT","EMBEDDING","EMBED","RERANK","RERANK","IMAGE","GENERATE_IMAGE","STT","TRANSCRIBE","TTS","SYNTHESIZE");
    private final JdbcTemplate jdbc;
    private final IdGenerator ids;
    private final DatabaseTimeProvider time;
    private final IdentityService identity;
    private final ModelProtocolRegistry registry;
    private final NetworkPolicy network;
    private final CredentialService credentials;
    private final ControlledTransport transport;
    private final AuditService audit;
    private final JsonMapper mapper;

    public record ProviderInput(String name,String vendorKey,String baseUrl,String authMethod,String credentialId,
                                Map<String,Object> protocolConfig,Integer timeoutMs,boolean enabled,Long rowVersion){ }
    public record ModelInput(String providerId,String name,String externalModelId,String modelType,String protocolKey,
                             String protocolVersion,Map<String,Object> protocolOptions,Map<String,Object> capabilities,
                             Map<String,Object> modelOptions,Map<String,Object> pricing,boolean enabled,Long rowVersion){ }
    public record Snapshot(String modelId,String providerId,String credentialId,String externalModelId,String modelType,
                           ProtocolKey protocol,String adapterKey,String adapterVersion,long modelRevision,long providerRevision,
                           String baseUrl,String authMethod,int timeoutMs,Map<String,Object> options,Map<String,Object> pricing,
                           String currency,String operation){ }
    public record Prepared(Snapshot snapshot,ModelProtocolAdapter adapter,CredentialService.Resolved credential,
                           ControlledTransport.Session transport){ }

    public ModelService(JdbcTemplate jdbc,IdGenerator ids,DatabaseTimeProvider time,IdentityService identity,
                        ModelProtocolRegistry registry,NetworkPolicy network,CredentialService credentials,
                        ControlledTransport transport,AuditService audit,JsonMapper mapper){
        this.jdbc=jdbc;this.ids=ids;this.time=time;this.identity=identity;this.registry=registry;
        this.network=network;this.credentials=credentials;this.transport=transport;this.audit=audit;this.mapper=mapper;
    }
    public List<Map<String,Object>> providers(ScopeContext s){return jdbc.queryForList(PROVIDER_VIEW+" WHERE TENANT_ID = ? AND WORKSPACE_ID = ? ORDER BY CREATED_AT,ID LIMIT 100",
            s.tenantId(),s.workspaceId()).stream().map(row->ModelJson.view(row,mapper,"PROTOCOL_CONFIG")).toList();}
    public List<Map<String,Object>> models(ScopeContext s){return jdbc.queryForList(MODEL_VIEW+" WHERE TENANT_ID = ? AND WORKSPACE_ID = ? ORDER BY CREATED_AT,ID LIMIT 100",
            s.tenantId(),s.workspaceId()).stream().map(row->ModelJson.view(row,mapper,"PROTOCOL_OPTIONS","CAPABILITIES","MODEL_OPTIONS","PRICING")).toList();}
    private Map<String,Object> provider(ScopeContext s,String id){return one(PROVIDER_VIEW+" WHERE TENANT_ID = ? AND WORKSPACE_ID = ? AND ID = ?",s.tenantId(),s.workspaceId(),id);}
    private Map<String,Object> model(ScopeContext s,String id){return one(MODEL_VIEW+" WHERE TENANT_ID = ? AND WORKSPACE_ID = ? AND ID = ?",s.tenantId(),s.workspaceId(),id);}
    private Map<String,Object> one(String sql,Object... args){var rows=jdbc.queryForList(sql,args);if(rows.isEmpty())throw IdentityService.missing();return rows.getFirst();}
    private static Map<String,Object> options(Map<String,Object> value){return value==null?Map.of():value;}
    private static long n(Map<String,Object> row,String key){return ((Number)row.get(key)).longValue();}
    private static boolean enabled(Map<String,Object> row){Object v=row.get("ENABLED");return Boolean.TRUE.equals(v)||(v instanceof Number num&&num.intValue()==1);}
    private static void active(Map<String,Object> row){if(!"ACTIVE".equals(row.get("STATUS"))||!enabled(row))throw new DomainException("MODEL_UNAVAILABLE",409,"Model or connection disabled");}
    private static void validAuth(String auth){if(!Set.of("NONE","BEARER","API_KEY").contains(auth))throw new DomainException("AUTH_UNSUPPORTED",422,"Unsupported authentication");}

    @Transactional
    public Map<String,Object> saveProvider(ScopeContext s,String id,ProviderInput input){
        String name=ModelJson.name(input.name(),100),vendor=ModelJson.name(input.vendorKey(),64);
        String base=network.base(input.baseUrl()).toString(),auth=input.authMethod();
        validAuth(auth);credentials.checkBinding(s,input.credentialId(),auth,base);
        Map<String,Object> config=options(input.protocolConfig());
        // P1 连接级配置仅接受已注册协议标识所对应的 Schema；内置协议没有额外连接参数。
        ModelJson.noSecret(config);
        for(var entry:config.entrySet()){
            var descriptor=registry.list().stream().filter(d->(d.protocol().key()+"/"+d.protocol().version()).equals(entry.getKey())).findFirst()
                    .orElseThrow(()->new DomainException("INVALID_CONFIG",422,"Unknown connection protocol"));
            if(!(entry.getValue() instanceof Map<?,?> values)||!(descriptor.connectionSchema().get("properties") instanceof Map<?,?> properties)
                    ||!properties.keySet().containsAll(values.keySet()))
                throw new DomainException("INVALID_CONFIG",422,"Invalid connection options");
        }
        int timeout=input.timeoutMs()==null?60000:input.timeoutMs();
        if(timeout<1000||timeout>180000)throw new DomainException("INVALID_TIMEOUT",422,"Invalid connection timeout");
        String now=time.now();
        if(id==null){
            id=ids.nextId();
            jdbc.update("""
                    INSERT INTO MODEL_PROVIDER (ID,TENANT_ID,WORKSPACE_ID,NAME,NAME_KEY,VENDOR_KEY,BASE_URL,AUTH_METHOD,
                    CREDENTIAL_ID,PROTOCOL_CONFIG,TIMEOUT_MS,ENABLED,STATUS,CONFIG_REVISION,VERIFY_STATUS,CREATED_AT,CREATED_BY,UPDATED_AT,UPDATED_BY)
                    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,'ACTIVE',1,'UNVERIFIED',?,?,?,?)
                    """,id,s.tenantId(),s.workspaceId(),name,name.toLowerCase(Locale.ROOT),vendor,base,auth,input.credentialId(),
                    mapper.writeValueAsString(config),timeout,input.enabled(),now,s.userId(),now,s.userId());
        }else{
            int changed=jdbc.update("""
                    UPDATE MODEL_PROVIDER SET NAME = ?,NAME_KEY = ?,VENDOR_KEY = ?,BASE_URL = ?,AUTH_METHOD = ?,CREDENTIAL_ID = ?,
                    PROTOCOL_CONFIG = ?,TIMEOUT_MS = ?,ENABLED = ?,CONFIG_REVISION = CONFIG_REVISION + 1,
                    VERIFY_STATUS = 'UNVERIFIED',UPDATED_AT = ?,UPDATED_BY = ?,ROW_VERSION = ROW_VERSION + 1
                    WHERE TENANT_ID = ? AND WORKSPACE_ID = ? AND ID = ? AND STATUS = 'ACTIVE' AND ROW_VERSION = ?
                    """,name,name.toLowerCase(Locale.ROOT),vendor,base,auth,input.credentialId(),mapper.writeValueAsString(config),
                    timeout,input.enabled(),now,s.userId(),s.tenantId(),s.workspaceId(),id,input.rowVersion());
            CredentialService.version(changed);
            jdbc.update("UPDATE MODEL_INSTANCE SET VERIFY_STATUS = 'UNVERIFIED',UPDATED_AT = ?,ROW_VERSION = ROW_VERSION + 1 WHERE TENANT_ID = ? AND WORKSPACE_ID = ? AND PROVIDER_ID = ?",now,s.tenantId(),s.workspaceId(),id);
        }
        audit.record(s.tenantId(),s.workspaceId(),null,s.userId(),"PROVIDER_SAVE","PROVIDER",id,"SUCCESS",null);
        return ModelJson.view(provider(s,id),mapper,"PROTOCOL_CONFIG");
    }

    @Transactional
    public Map<String,Object> verifyProvider(ScopeContext s,String id){
        var p=provider(s,id);active(p);
        credentials.checkBinding(s,(String)p.get("CREDENTIAL_ID"),(String)p.get("AUTH_METHOD"),(String)p.get("BASE_URL"));
        String now=time.now();
        int changed=jdbc.update("""
                UPDATE MODEL_PROVIDER SET VERIFY_STATUS = 'CONFIG_VALID',VERIFIED_CONFIG_REVISION = CONFIG_REVISION,
                VERIFIED_AT = ?,VERIFY_ERROR_CODE = NULL,UPDATED_AT = ?,ROW_VERSION = ROW_VERSION + 1
                WHERE TENANT_ID = ? AND WORKSPACE_ID = ? AND ID = ? AND CONFIG_REVISION = ?
                """,now,now,s.tenantId(),s.workspaceId(),id,n(p,"CONFIG_REVISION"));
        CredentialService.version(changed);
        return ModelJson.view(provider(s,id),mapper,"PROTOCOL_CONFIG");
    }

    @Transactional
    public Map<String,Object> saveModel(ScopeContext s,String id,ModelInput input){
        String type=input.modelType(),operation=OPERATIONS.get(type);
        if(operation==null)throw new DomainException("MODEL_TYPE_INVALID",422,"Invalid model type");
        String name=ModelJson.name(input.name(),100),external=ModelJson.required(input.externalModelId(),240);
        ProtocolKey protocol=new ProtocolKey(input.protocolKey(),input.protocolVersion());
        var p=provider(s,input.providerId());
        Map<String,Object> specific=options(input.protocolOptions()),generic=options(input.modelOptions()),cap=options(input.capabilities()),pricing=options(input.pricing());
        ModelJson.noSecret(specific);ModelJson.noSecret(generic);ModelJson.noSecret(cap);ModelJson.noSecret(pricing);
        var combined=new HashMap<>(generic);
        for(var e:specific.entrySet())if(combined.putIfAbsent(e.getKey(),e.getValue())!=null)throw new DomainException("INVALID_CONFIG",422,"Duplicate option");
        String verification="UNVERIFIED";
        try{
            var adapter=registry.resolve(protocol,type,operation);
            adapter.validate(new ProtocolConfiguration((String)p.get("AUTH_METHOD"),type,connectionOptions(p,protocol),combined,cap));
        }catch(DomainException ex){
            if(!"MODEL_PROTOCOL_UNAVAILABLE".equals(ex.code())||input.enabled()||!combined.isEmpty())throw ex;
            verification="UNSUPPORTED";
        }
        validatePricing(s,pricing);
        String now=time.now(),price=pricing.isEmpty()?null:mapper.writeValueAsString(pricing);
        if(id==null){
            id=ids.nextId();
            jdbc.update("""
                    INSERT INTO MODEL_INSTANCE (ID,TENANT_ID,WORKSPACE_ID,PROVIDER_ID,NAME,NAME_KEY,EXTERNAL_MODEL_ID,EXTERNAL_MODEL_KEY,
                    MODEL_TYPE,PROTOCOL_KEY,PROTOCOL_VERSION,PROTOCOL_OPTIONS,CAPABILITIES,MODEL_OPTIONS,PRICING,ENABLED,STATUS,
                    CONFIG_REVISION,VERIFY_STATUS,CREATED_AT,CREATED_BY,UPDATED_AT,UPDATED_BY)
                    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'ACTIVE',1,?,?,?,?,?)
                    """,id,s.tenantId(),s.workspaceId(),input.providerId(),name,name.toLowerCase(Locale.ROOT),external,
                    SecurityTokens.digest(external),type,protocol.key(),protocol.version(),mapper.writeValueAsString(specific),
                    mapper.writeValueAsString(cap),mapper.writeValueAsString(generic),price,input.enabled(),verification,now,s.userId(),now,s.userId());
        }else{
            var previous=model(s,id);
            if(!input.providerId().equals(previous.get("PROVIDER_ID"))||!type.equals(previous.get("MODEL_TYPE")))
                throw new DomainException("MODEL_IDENTITY_IMMUTABLE",422,"Create another instance to change provider or model type");
            int changed=jdbc.update("""
                    UPDATE MODEL_INSTANCE SET NAME = ?,NAME_KEY = ?,EXTERNAL_MODEL_ID = ?,EXTERNAL_MODEL_KEY = ?,PROTOCOL_KEY = ?,
                    PROTOCOL_VERSION = ?,PROTOCOL_OPTIONS = ?,CAPABILITIES = ?,MODEL_OPTIONS = ?,PRICING = ?,ENABLED = ?,
                    CONFIG_REVISION = CONFIG_REVISION + 1,VERIFY_STATUS = ?,UPDATED_AT = ?,UPDATED_BY = ?,ROW_VERSION = ROW_VERSION + 1
                    WHERE TENANT_ID = ? AND WORKSPACE_ID = ? AND ID = ? AND STATUS = 'ACTIVE' AND ROW_VERSION = ?
                    """,name,name.toLowerCase(Locale.ROOT),external,SecurityTokens.digest(external),protocol.key(),protocol.version(),
                    mapper.writeValueAsString(specific),mapper.writeValueAsString(cap),mapper.writeValueAsString(generic),price,input.enabled(),
                    verification,now,s.userId(),s.tenantId(),s.workspaceId(),id,input.rowVersion());
            CredentialService.version(changed);
        }
        audit.record(s.tenantId(),s.workspaceId(),null,s.userId(),"MODEL_SAVE","MODEL",id,"SUCCESS",null);
        return ModelJson.view(model(s,id),mapper,"PROTOCOL_OPTIONS","CAPABILITIES","MODEL_OPTIONS","PRICING");
    }
    private void validatePricing(ScopeContext s,Map<String,Object> price){
        if(price.isEmpty())return;
        if(!Set.of("currency","inputPerMillion","outputPerMillion","perRequest","perImage","perAudioSecond","perThousandCharacters").containsAll(price.keySet()))
            throw new DomainException("INVALID_PRICING",422,"Unsupported price unit");
        String currency=identity.active(s.userId()).currency();
        if(!currency.equals(price.get("currency")))throw new DomainException("INVALID_PRICING",422,"Pricing currency mismatch");
        for(var e:price.entrySet())if(!"currency".equals(e.getKey())){
            try{BigDecimal value=new BigDecimal(e.getValue().toString());if(value.signum()<0||value.precision()>20||value.scale()>8)throw new IllegalArgumentException();}
            catch(RuntimeException ex){throw new DomainException("INVALID_PRICING",422,"Invalid price");}
        }
    }
    @Transactional
    public void archive(ScopeContext s,String kind,String id,long revision){
        String sql=switch(kind){
            case "provider" -> "UPDATE MODEL_PROVIDER SET STATUS = 'ARCHIVED',ENABLED = FALSE,CONFIG_REVISION = CONFIG_REVISION + 1,UPDATED_AT = ?,UPDATED_BY = ?,ROW_VERSION = ROW_VERSION + 1 WHERE TENANT_ID = ? AND WORKSPACE_ID = ? AND ID = ? AND ROW_VERSION = ? AND STATUS = 'ACTIVE'";
            case "model" -> "UPDATE MODEL_INSTANCE SET STATUS = 'ARCHIVED',ENABLED = FALSE,CONFIG_REVISION = CONFIG_REVISION + 1,UPDATED_AT = ?,UPDATED_BY = ?,ROW_VERSION = ROW_VERSION + 1 WHERE TENANT_ID = ? AND WORKSPACE_ID = ? AND ID = ? AND ROW_VERSION = ? AND STATUS = 'ACTIVE'";
            default -> throw IdentityService.missing();
        };
        CredentialService.version(jdbc.update(sql,time.now(),s.userId(),s.tenantId(),s.workspaceId(),id,revision));
        audit.record(s.tenantId(),s.workspaceId(),null,s.userId(),"MODEL_RESOURCE_ARCHIVE",kind.toUpperCase(Locale.ROOT),id,"SUCCESS",null);
    }
    @Transactional
    public void binding(ScopeContext s,String modelId,boolean active){
        model(s,modelId);String now=time.now();
        jdbc.update("""
                INSERT INTO MODEL_PROJECT_BINDING (ID,TENANT_ID,WORKSPACE_ID,PROJECT_ID,MODEL_ID,STATUS,REVOKED_AT,CREATED_AT,CREATED_BY,UPDATED_AT,UPDATED_BY)
                VALUES (?,?,?,?,?,?,?,?,?,?,?)
                ON DUPLICATE KEY UPDATE STATUS = ?,REVOKED_AT = ?,UPDATED_AT = ?,UPDATED_BY = ?,ROW_VERSION = ROW_VERSION + 1
                """,ids.nextId(),s.tenantId(),s.workspaceId(),s.requireProject(),modelId,active?"ACTIVE":"REVOKED",active?null:now,now,s.userId(),now,s.userId(),
                active?"ACTIVE":"REVOKED",active?null:now,now,s.userId());
        audit.record(s.tenantId(),s.workspaceId(),s.projectId(),s.userId(),active?"MODEL_BIND":"MODEL_UNBIND","MODEL",modelId,"SUCCESS",null);
    }
    public List<Map<String,Object>> bindings(ScopeContext s){
        return jdbc.queryForList("""
                SELECT B.ID,B.MODEL_ID,B.STATUS,M.NAME,M.MODEL_TYPE,M.PROTOCOL_KEY,M.PROTOCOL_VERSION,M.ENABLED,M.VERIFY_STATUS
                FROM MODEL_PROJECT_BINDING B JOIN MODEL_INSTANCE M ON B.MODEL_ID = M.ID
                WHERE B.TENANT_ID = ? AND B.WORKSPACE_ID = ? AND B.PROJECT_ID = ? ORDER BY B.CREATED_AT,B.ID LIMIT 100
                """,s.tenantId(),s.workspaceId(),s.requireProject()).stream().map(row->ModelJson.view(row,mapper)).toList();
    }
    @Transactional
    public void setDefault(ScopeContext s,String purpose,String modelId){
        String type="CHAT".equals(purpose)?"LLM":purpose;var m=model(s,modelId);
        if(!type.equals(m.get("MODEL_TYPE")))throw new DomainException("MODEL_TYPE_INVALID",422,"Default model type mismatch");
        snapshot(s,modelId,true);
        String now=time.now();
        jdbc.update("""
                INSERT INTO MODEL_PROJECT_DEFAULT (ID,TENANT_ID,WORKSPACE_ID,PROJECT_ID,PURPOSE,MODEL_ID,CREATED_AT,CREATED_BY,UPDATED_AT,UPDATED_BY)
                VALUES (?,?,?,?,?,?,?,?,?,?)
                ON DUPLICATE KEY UPDATE MODEL_ID = ?,UPDATED_AT = ?,UPDATED_BY = ?,ROW_VERSION = ROW_VERSION + 1
                """,ids.nextId(),s.tenantId(),s.workspaceId(),s.requireProject(),purpose,modelId,now,s.userId(),now,s.userId(),modelId,now,s.userId());
    }
    public List<Map<String,Object>> defaults(ScopeContext s){
        return jdbc.queryForList("SELECT PURPOSE,MODEL_ID,ROW_VERSION FROM MODEL_PROJECT_DEFAULT WHERE TENANT_ID = ? AND WORKSPACE_ID = ? AND PROJECT_ID = ?",
                s.tenantId(),s.workspaceId(),s.requireProject()).stream().map(row->ModelJson.view(row,mapper)).toList();
    }

    public Snapshot snapshot(ScopeContext s,String modelId,boolean diagnostic){
        identity.assertCurrentScope(s);
        var m=model(s,modelId);active(m);var p=provider(s,(String)m.get("PROVIDER_ID"));active(p);
        Integer bound=jdbc.queryForObject("SELECT COUNT(*) FROM MODEL_PROJECT_BINDING WHERE TENANT_ID = ? AND WORKSPACE_ID = ? AND PROJECT_ID = ? AND MODEL_ID = ? AND STATUS = 'ACTIVE'",
                Integer.class,s.tenantId(),s.workspaceId(),s.requireProject(),modelId);
        if(!Integer.valueOf(1).equals(bound))throw new DomainException("MODEL_NOT_BOUND",403,"Model not bound to project");
        String type=(String)m.get("MODEL_TYPE"),operation=OPERATIONS.get(type);
        ProtocolKey protocol=new ProtocolKey((String)m.get("PROTOCOL_KEY"),(String)m.get("PROTOCOL_VERSION"));
        var adapter=registry.resolve(protocol,type,operation);
        var combined=new HashMap<>(ModelJson.object(mapper,m.get("MODEL_OPTIONS")));combined.putAll(ModelJson.object(mapper,m.get("PROTOCOL_OPTIONS")));
        String auth=(String)p.get("AUTH_METHOD"),base=(String)p.get("BASE_URL"),credential=(String)p.get("CREDENTIAL_ID");
        credentials.checkBinding(s,credential,auth,base);
        adapter.validate(new ProtocolConfiguration(auth,type,connectionOptions(p,protocol),combined,ModelJson.object(mapper,m.get("CAPABILITIES"))));
        if(!diagnostic&&(!"VERIFIED".equals(m.get("VERIFY_STATUS")) || !Objects.equals(m.get("VERIFIED_ADAPTER_KEY"),adapter.descriptor().adapterKey()) || !Objects.equals(m.get("VERIFIED_ADAPTER_VERSION"),adapter.descriptor().adapterVersion()) || !sameRevision(m,"VERIFIED_CONFIG_REVISION",n(m,"CONFIG_REVISION")) || !sameRevision(m,"VERIFIED_PROVIDER_REVISION",n(p,"CONFIG_REVISION")) || !sameRevision(m,"VERIFIED_CREDENTIAL_REVISION",credentials.revision(s,credential))))throw new DomainException("MODEL_NOT_VERIFIED",409,"Verify model through a diagnostic first");
        return new Snapshot(modelId,(String)p.get("ID"),credential,(String)m.get("EXTERNAL_MODEL_ID"),type,protocol,adapter.descriptor().adapterKey(),
                adapter.descriptor().adapterVersion(),n(m,"CONFIG_REVISION"),n(p,"CONFIG_REVISION"),base,auth,((Number)p.get("TIMEOUT_MS")).intValue(),
                Map.copyOf(combined),ModelJson.object(mapper,m.get("PRICING")),identity.active(s.userId()).currency(),operation);
    }

    private static boolean sameRevision(Map<String,Object> row,String key,long revision){return row.get(key) instanceof Number number&&number.longValue()==revision;}
    @SuppressWarnings("unchecked")
    private Map<String,Object> connectionOptions(Map<String,Object> provider,ProtocolKey protocol){
        Object value=ModelJson.object(mapper,provider.get("PROTOCOL_CONFIG")).get(protocol.key()+"/"+protocol.version());
        return value instanceof Map<?,?> ? (Map<String,Object>)value : Map.of();
    }
    public Prepared prepare(ScopeContext s,Snapshot pinned){
        var current=snapshot(s,pinned.modelId(),true);
        if(!current.equals(pinned))throw new DomainException("MODEL_CONFIG_CHANGED",409,"Pinned model configuration changed");
        var adapter=registry.resolvePinned(pinned.protocol(),pinned.modelType(),pinned.operation(),pinned.adapterKey(),pinned.adapterVersion());
        var credential=credentials.resolve(s,pinned.credentialId(),pinned.authMethod(),pinned.baseUrl());
        return new Prepared(pinned,adapter,credential,transport.bind(pinned.baseUrl(),pinned.authMethod(),credential.secret(),pinned.timeoutMs()));
    }

    public void markVerified(ScopeContext s,Snapshot snapshot,long credentialRevision){
        String now=time.now();
        jdbc.update("""
                UPDATE MODEL_INSTANCE M JOIN MODEL_PROVIDER P ON M.PROVIDER_ID = P.ID
                LEFT JOIN MODEL_CREDENTIAL C ON P.CREDENTIAL_ID = C.ID
                SET M.VERIFY_STATUS = 'VERIFIED',M.VERIFIED_CONFIG_REVISION = M.CONFIG_REVISION,
                M.VERIFIED_PROVIDER_REVISION = P.CONFIG_REVISION,M.VERIFIED_CREDENTIAL_REVISION = ?,
                M.VERIFIED_ADAPTER_KEY = ?,M.VERIFIED_ADAPTER_VERSION = ?,M.VERIFIED_AT = ?,M.VERIFY_ERROR_CODE = NULL,
                M.UPDATED_AT = ?,M.ROW_VERSION = M.ROW_VERSION + 1
                WHERE M.TENANT_ID = ? AND M.WORKSPACE_ID = ? AND M.ID = ? AND M.CONFIG_REVISION = ? AND P.CONFIG_REVISION = ?
                AND (P.CREDENTIAL_ID IS NULL OR (C.STATUS = 'ACTIVE' AND C.SECRET_REVISION = ?))
                """,credentialRevision,snapshot.adapterKey(),snapshot.adapterVersion(),now,now,s.tenantId(),s.workspaceId(),snapshot.modelId(),
                snapshot.modelRevision(),snapshot.providerRevision(),credentialRevision);
    }
}
