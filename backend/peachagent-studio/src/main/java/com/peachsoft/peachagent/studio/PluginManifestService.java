package com.peachsoft.peachagent.studio;

import com.peachsoft.peachagent.common.DomainException;
import com.peachsoft.peachagent.common.IdGenerator;
import com.peachsoft.peachagent.common.JsonData;
import com.peachsoft.peachagent.common.ScopeContext;
import com.peachsoft.peachagent.iam.DatabaseTimeProvider;
import com.peachsoft.peachagent.iam.IdentityService;
import com.peachsoft.peachagent.iam.SecurityTokens;
import java.util.List;
import java.util.Map;
import java.util.Set;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import tools.jackson.databind.json.JsonMapper;

/** P1 只登记声明与配置 Schema，不加载或执行插件。 */
@Service
public class PluginManifestService {
    private final JdbcTemplate jdbc;private final IdGenerator ids;private final DatabaseTimeProvider time;private final JsonMapper mapper;
    public PluginManifestService(JdbcTemplate jdbc,IdGenerator ids,DatabaseTimeProvider time,JsonMapper mapper){this.jdbc=jdbc;this.ids=ids;this.time=time;this.mapper=mapper;}
    public record Manifest(String pluginKey,String pluginVersion,String name,String description,
                           Map<String,Object> configSchema,List<String> permissions,List<String> extensionPoints){ }
    public void validate(Manifest m){
        if(m.pluginKey()==null||!m.pluginKey().matches("[a-z][a-z0-9._-]{0,99}")||m.pluginVersion()==null||
            !m.pluginVersion().matches("[0-9]+\\.[0-9]+\\.[0-9]+([.-][a-zA-Z0-9.-]+)?")||m.pluginVersion().length()>40)
            throw invalid();
        JsonData.requiredText(m.name(),100);
        if(m.description()!=null&&m.description().length()>500||m.configSchema()==null||m.permissions()==null||m.extensionPoints()==null)throw invalid();
        if(!Set.of("type","properties","required","additionalProperties").containsAll(m.configSchema().keySet())||!"object".equals(m.configSchema().get("type")))throw invalid();
        if(!(m.configSchema().get("properties") instanceof Map<?,?> properties)||properties.size()>50)throw invalid();
        for(var entry:properties.entrySet()){
            if(!entry.getKey().toString().matches("[A-Za-z_][A-Za-z0-9_]{0,63}")||!(entry.getValue() instanceof Map<?,?> spec)
                    ||!Set.of("type","title","description","enum","minimum","maximum").containsAll(spec.keySet())
                    ||!Set.of("string","number","integer","boolean").contains(spec.get("type")))throw invalid();
        }
        if(m.configSchema().containsKey("required")&&(!(m.configSchema().get("required") instanceof List<?> required)||!properties.keySet().containsAll(required)))throw invalid();
        if(m.permissions().size()>20||m.extensionPoints().size()>20||
                m.permissions().stream().anyMatch(x->x==null||!x.matches("[a-z][a-z0-9._:-]{0,63}"))||
                m.extensionPoints().stream().anyMatch(x->x==null||!x.matches("[a-z][a-z0-9._:-]{0,63}"))||
                mapper.writeValueAsString(m).length()>32768)throw invalid();
    }
    public List<Map<String,Object>> list(ScopeContext s){
        return jdbc.queryForList("""
                SELECT ID,PLUGIN_KEY,PLUGIN_VERSION,NAME,DESCRIPTION,CONFIG_SCHEMA,DECLARED_PERMISSIONS,EXTENSION_POINTS,STATUS,ROW_VERSION
                FROM PLUGIN_MANIFEST WHERE TENANT_ID = ? AND WORKSPACE_ID = ? ORDER BY CREATED_AT DESC,ID DESC LIMIT 100
                """,s.tenantId(),s.workspaceId()).stream().map(r->JsonData.view(mapper,r,"CONFIG_SCHEMA","DECLARED_PERMISSIONS","EXTENSION_POINTS")).toList();
    }
    @Transactional
    public Map<String,Object> create(ScopeContext s,Manifest input){
        validate(input);String id=ids.nextId(),now=time.now();
        jdbc.update("""
                INSERT INTO PLUGIN_MANIFEST (ID,TENANT_ID,WORKSPACE_ID,PLUGIN_KEY,PLUGIN_VERSION,NAME,DESCRIPTION,MANIFEST_SCHEMA_VERSION,CONFIG_SCHEMA,DECLARED_PERMISSIONS,EXTENSION_POINTS,MANIFEST_HASH,STATUS,CREATED_AT,CREATED_BY,UPDATED_AT,UPDATED_BY)
                VALUES (?,?,?,?,?,?,?,1,?,?,?,?,'DRAFT',?,?,?,?)
                """,id,s.tenantId(),s.workspaceId(),input.pluginKey(),input.pluginVersion(),input.name(),input.description(),
                mapper.writeValueAsString(input.configSchema()),mapper.writeValueAsString(input.permissions()),mapper.writeValueAsString(input.extensionPoints()),
                SecurityTokens.digest(mapper.writeValueAsString(input)),now,s.userId(),now,s.userId());
        return Map.of("id",id,"status","DRAFT");
    }
    @Transactional
    public void change(ScopeContext s,String id,long revision,boolean declare){
        String now=time.now();
        int n=jdbc.update("""
                UPDATE PLUGIN_MANIFEST SET STATUS = ?,DECLARED_AT = CASE WHEN ? = TRUE THEN ? ELSE DECLARED_AT END,
                UPDATED_AT = ?,UPDATED_BY = ?,ROW_VERSION = ROW_VERSION + 1
                WHERE TENANT_ID = ? AND WORKSPACE_ID = ? AND ID = ? AND ROW_VERSION = ? AND (STATUS = 'DRAFT' OR (? = FALSE AND STATUS = 'DECLARED'))
                """,declare?"DECLARED":"ARCHIVED",declare,now,now,s.userId(),s.tenantId(),s.workspaceId(),id,revision,declare);
        if(n!=1)throw new DomainException("VERSION_CONFLICT",409,"Manifest changed or unavailable");
    }
    private static DomainException invalid(){return new DomainException("INVALID_MANIFEST",422,"Invalid plugin declaration");}
}
