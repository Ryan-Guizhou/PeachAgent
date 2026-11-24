package com.peachsoft.peachagent.runtime;

import com.peachsoft.peachagent.common.*;
import com.peachsoft.peachagent.iam.*;
import java.nio.file.*;
import java.util.*;
import java.security.MessageDigest;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

/** 私有短期产物；存储键只由平台生成，API 按作用域授权。 */
@Service
public class ArtifactStore {
    private final JdbcTemplate jdbc;private final IdGenerator ids;private final DatabaseTimeProvider time;private final Path root;
    public ArtifactStore(JdbcTemplate jdbc,IdGenerator ids,DatabaseTimeProvider time,@Value("${peachagent.artifact-directory:./data/artifacts}") String dir){
        this.jdbc=jdbc;this.ids=ids;this.time=time;this.root=Path.of(dir).toAbsolutePath().normalize();
    }
    public record Download(byte[] bytes,String mime,String name) { }
    public void input(ScopeContext s,String run,String id,String base64){
        if(base64==null||base64.length()>14_000_000)throw new DomainException("INVALID_AUDIO",422,"Audio required, maximum 10 MiB");
        byte[] data;
        try{data=Base64.getDecoder().decode(base64);}catch(IllegalArgumentException ex){throw new DomainException("INVALID_AUDIO",422,"Invalid audio");}
        if(data.length>10*1024*1024||data.length<12||data[0]!='R'||data[1]!='I'||data[2]!='F'||data[3]!='F'||data[8]!='W'||data[9]!='A'||data[10]!='V'||data[11]!='E')
            throw new DomainException("INVALID_AUDIO",422,"Only bounded WAV supported");
        save(s,run,null,id,"INPUT",data,"audio/wav");
    }
    public String output(ScopeContext s,String run,String call,byte[] bytes,String mime){String id=ids.nextId();save(s,run,call,id,"OUTPUT",bytes,mime);return id;}
    private Path path(String key){if(!key.matches("[a-fA-F0-9-]{36}"))throw new IllegalStateException("Invalid storage key");return root.resolve(key);}
    private void save(ScopeContext s,String run,String call,String id,String direction,byte[] bytes,String mime){
        if(bytes.length>20*1024*1024||!Set.of("audio/wav","audio/mpeg","image/png","image/jpeg","image/webp").contains(mime))
            throw new DomainException("INVALID_ARTIFACT",422,"Unsupported artifact");
        Path target=path(id);
        try{
            Files.createDirectories(root);Files.write(target,bytes,StandardOpenOption.CREATE_NEW,StandardOpenOption.WRITE);
            if(TransactionSynchronizationManager.isSynchronizationActive())TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization(){
                @Override public void afterCompletion(int status){if(status!=STATUS_COMMITTED)try{Files.deleteIfExists(target);}catch(Exception ignored){}}
            });
            String now=time.now(),name=id+switch(mime){case "audio/wav"->".wav";case "audio/mpeg"->".mp3";case "image/png"->".png";case "image/jpeg"->".jpg";default->".webp";};
            jdbc.update("""
                    INSERT INTO RT_ARTIFACT (ID,TENANT_ID,WORKSPACE_ID,PROJECT_ID,RUN_ID,CALL_ID,DIRECTION,STORAGE_KEY,FILE_NAME,MIME_TYPE,SIZE_BYTES,SHA256,STATUS,EXPIRES_AT,CREATED_AT)
                    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,'READY',?,?)
                    """,id,s.tenantId(),s.workspaceId(),s.requireProject(),run,call,direction,id,name,mime,bytes.length,MessageDigest.getInstance("SHA-256").digest(bytes),TimeCodec.plusSeconds(now,86400),now);
        }catch(Exception ex){try{Files.deleteIfExists(target);}catch(Exception ignored){}throw new DomainException("ARTIFACT_FAILED",500,"Artifact storage failed");}
    }
    public Download read(ScopeContext s,String run,String id){
        var rows=jdbc.queryForList("""
                SELECT A.STORAGE_KEY,A.MIME_TYPE,A.FILE_NAME,A.SIZE_BYTES,A.SHA256 FROM RT_ARTIFACT A JOIN RT_RUN R ON R.ID = A.RUN_ID
                WHERE A.TENANT_ID = ? AND A.WORKSPACE_ID = ? AND A.PROJECT_ID = ? AND A.RUN_ID = ? AND A.ID = ? AND R.ACTOR_USER_ID = ? AND A.STATUS = 'READY' AND A.EXPIRES_AT > ?
                """,s.tenantId(),s.workspaceId(),s.requireProject(),run,id,s.userId(),time.now());
        if(rows.isEmpty())throw IdentityService.missing();var a=rows.getFirst();
        try{
            byte[] bytes=Files.readAllBytes(path((String)a.get("STORAGE_KEY")));
            if(bytes.length!=((Number)a.get("SIZE_BYTES")).longValue()||!Arrays.equals((byte[])a.get("SHA256"),MessageDigest.getInstance("SHA-256").digest(bytes)))throw new IllegalStateException();
            return new Download(bytes,(String)a.get("MIME_TYPE"),(String)a.get("FILE_NAME"));
        }catch(Exception ex){throw new DomainException("ARTIFACT_UNAVAILABLE",404,"Artifact unavailable");}
    }
    public void cleanup(){
        for(var a:jdbc.queryForList("SELECT ID,STORAGE_KEY FROM RT_ARTIFACT WHERE STATUS = 'READY' AND EXPIRES_AT <= ? LIMIT 100",time.now())){
            try{Files.deleteIfExists(path((String)a.get("STORAGE_KEY")));jdbc.update("UPDATE RT_ARTIFACT SET STATUS = 'EXPIRED' WHERE ID = ?",a.get("ID"));}catch(Exception ignored){}
        }
    }
}
