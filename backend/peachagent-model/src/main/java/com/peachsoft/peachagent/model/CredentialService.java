package com.peachsoft.peachagent.model;

import com.peachsoft.peachagent.common.DomainException;
import com.peachsoft.peachagent.common.IdGenerator;
import com.peachsoft.peachagent.common.ScopeContext;
import com.peachsoft.peachagent.iam.AuditService;
import com.peachsoft.peachagent.iam.DatabaseTimeProvider;
import com.peachsoft.peachagent.iam.IdentityService;

import java.util.List;
import java.util.Locale;
import java.util.Map;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import tools.jackson.databind.json.JsonMapper;

/**
 * 凭证元数据与解密权限分离，列表永不选择密文字段。
 * @Author Mr Shu
 * @Version 1.0.0
 * @CreateTime 2026/11/24 11:34
 */
@Service
public class CredentialService {
    private static final String VIEW =
            "SELECT ID,NAME,SECRET_TYPE,ALLOWED_ORIGIN,SECRET_REVISION,MASKED_HINT,STATUS,ROTATED_AT,REVOKED_AT,CREATED_AT,UPDATED_AT,ROW_VERSION FROM MODEL_CREDENTIAL";
    private final JdbcTemplate jdbc;
    private final IdGenerator ids;
    private final DatabaseTimeProvider time;
    private final IdentityService identity;
    private final NetworkPolicy network;
    private final CredentialCipher cipher;
    private final AuditService audit;
    private final JsonMapper mapper;

    /**
     * 凭证创建参数，明文只在受控加密链路使用。
     * @Author Mr Shu
     * @Version 1.0.0
     * @CreateTime 2026/11/24 11:34
     */
    public record Create(String name, String secretType, String allowedOrigin, String secret) {}
    /**
     * 密钥轮换参数，不允许输出明文。
     * @Author Mr Shu
     * @Version 1.0.0
     * @CreateTime 2026/11/24 11:34
     */
    public record Rotate(String secret, long rowVersion) {}
    /**
     * 运行时受控解析后的凭证和版本，不对外序列化。
     * @Author Mr Shu
     * @Version 1.0.0
     * @CreateTime 2026/11/24 11:34
     */
    public record Resolved(String secret, long revision) {}

    public CredentialService(
            JdbcTemplate jdbc,
            IdGenerator ids,
            DatabaseTimeProvider time,
            IdentityService identity,
            NetworkPolicy network,
            CredentialCipher cipher,
            AuditService audit,
            JsonMapper mapper) {
        this.jdbc = jdbc;
        this.ids = ids;
        this.time = time;
        this.identity = identity;
        this.network = network;
        this.cipher = cipher;
        this.audit = audit;
        this.mapper = mapper;
    }

    public List<Map<String, Object>> list(ScopeContext s) {
        return jdbc
                .queryForList(
                        VIEW + " WHERE TENANT_ID = ? AND WORKSPACE_ID = ? ORDER BY CREATED_AT,ID LIMIT 100",
                        s.tenantId(),
                        s.workspaceId())
                .stream()
                .map(row -> ModelJson.view(row, mapper))
                .toList();
    }

    public Map<String, Object> get(ScopeContext s, String id) {
        var rows = jdbc.queryForList(
                VIEW + " WHERE TENANT_ID = ? AND WORKSPACE_ID = ? AND ID = ?", s.tenantId(), s.workspaceId(), id);
        if (rows.isEmpty()) throw IdentityService.missing();
        return ModelJson.view(rows.getFirst(), mapper);
    }

    @Transactional
    public Map<String, Object> create(ScopeContext s, Create input) {
        String name = ModelJson.name(input.name(), 100);
        if (!List.of("API_KEY", "BEARER").contains(input.secretType()))
            throw new DomainException("AUTH_UNSUPPORTED", 422, "Unsupported credential type");
        String origin = NetworkPolicy.origin(network.base(input.allowedOrigin())), id = ids.nextId(), now = time.now();
        var encrypted = cipher.encrypt(input.secret(), aad(s, id, 1, origin));
        jdbc.update(
                """
                INSERT INTO MODEL_CREDENTIAL (ID,TENANT_ID,WORKSPACE_ID,NAME,NAME_KEY,SECRET_TYPE,ALLOWED_ORIGIN,
                CIPHERTEXT,NONCE,WRAPPED_DEK,KEK_VERSION,SECRET_REVISION,MASKED_HINT,STATUS,CREATED_AT,CREATED_BY,UPDATED_AT,UPDATED_BY)
                VALUES (?,?,?,?,?,?,?,?,?,?,?,1,'********','ACTIVE',?,?,?,?)
                """,
                id,
                s.tenantId(),
                s.workspaceId(),
                name,
                name.toLowerCase(Locale.ROOT),
                input.secretType(),
                origin,
                encrypted.ciphertext(),
                encrypted.nonce(),
                encrypted.wrappedDek(),
                encrypted.kekVersion(),
                now,
                s.userId(),
                now,
                s.userId());
        audit.record(
                s.tenantId(),
                s.workspaceId(),
                null,
                s.userId(),
                "CREDENTIAL_CREATE",
                "CREDENTIAL",
                id,
                "SUCCESS",
                null);
        return get(s, id);
    }

    @Transactional
    public Map<String, Object> rotate(ScopeContext s, String id, Rotate input) {
        var old = credential(s, id, true);
        long revision = ((Number) old.get("SECRET_REVISION")).longValue() + 1;
        var encrypted = cipher.encrypt(input.secret(), aad(s, id, revision, (String) old.get("ALLOWED_ORIGIN")));
        String now = time.now();
        int changed = jdbc.update(
                """
                UPDATE MODEL_CREDENTIAL SET CIPHERTEXT = ?,NONCE = ?,WRAPPED_DEK = ?,KEK_VERSION = ?,SECRET_REVISION = ?,
                ROTATED_AT = ?,UPDATED_AT = ?,UPDATED_BY = ?,ROW_VERSION = ROW_VERSION + 1
                WHERE TENANT_ID = ? AND WORKSPACE_ID = ? AND ID = ? AND STATUS = 'ACTIVE' AND ROW_VERSION = ?
                """,
                encrypted.ciphertext(),
                encrypted.nonce(),
                encrypted.wrappedDek(),
                encrypted.kekVersion(),
                revision,
                now,
                now,
                s.userId(),
                s.tenantId(),
                s.workspaceId(),
                id,
                input.rowVersion());
        version(changed);
        invalidate(s, id, now);
        audit.record(
                s.tenantId(),
                s.workspaceId(),
                null,
                s.userId(),
                "CREDENTIAL_ROTATE",
                "CREDENTIAL",
                id,
                "SUCCESS",
                null);
        return get(s, id);
    }

    @Transactional
    public Map<String, Object> revoke(ScopeContext s, String id, long rowVersion) {
        String now = time.now();
        int changed = jdbc.update(
                """
                UPDATE MODEL_CREDENTIAL SET CIPHERTEXT = NULL,NONCE = NULL,WRAPPED_DEK = NULL,KEK_VERSION = NULL,
                STATUS = 'REVOKED',REVOKED_AT = ?,SECRET_REVISION = SECRET_REVISION + 1,UPDATED_AT = ?,UPDATED_BY = ?,ROW_VERSION = ROW_VERSION + 1
                WHERE TENANT_ID = ? AND WORKSPACE_ID = ? AND ID = ? AND STATUS = 'ACTIVE' AND ROW_VERSION = ?
                """,
                now,
                now,
                s.userId(),
                s.tenantId(),
                s.workspaceId(),
                id,
                rowVersion);
        version(changed);
        invalidate(s, id, now);
        audit.record(
                s.tenantId(),
                s.workspaceId(),
                null,
                s.userId(),
                "CREDENTIAL_REVOKE",
                "CREDENTIAL",
                id,
                "SUCCESS",
                null);
        return get(s, id);
    }

    private void invalidate(ScopeContext s, String id, String now) {
        jdbc.update(
                """
                UPDATE MODEL_INSTANCE M JOIN MODEL_PROVIDER P ON M.PROVIDER_ID = P.ID
                SET M.VERIFY_STATUS = 'UNVERIFIED',M.UPDATED_AT = ?,M.ROW_VERSION = M.ROW_VERSION + 1
                WHERE M.TENANT_ID = ? AND M.WORKSPACE_ID = ? AND P.CREDENTIAL_ID = ?
                """,
                now,
                s.tenantId(),
                s.workspaceId(),
                id);
        jdbc.update(
                """
                UPDATE MODEL_PROVIDER SET VERIFY_STATUS = 'UNVERIFIED',UPDATED_AT = ?,ROW_VERSION = ROW_VERSION + 1
                WHERE TENANT_ID = ? AND WORKSPACE_ID = ? AND CREDENTIAL_ID = ?
                """,
                now,
                s.tenantId(),
                s.workspaceId(),
                id);
    }

    public void checkBinding(ScopeContext s, String id, String auth, String baseUrl) {
        if ("NONE".equals(auth)) {
            if (id != null)
                throw new DomainException(
                        "INVALID_CREDENTIAL", 422, "Unauthenticated connection cannot bind a credential");
            return;
        }
        var row = credential(s, id, false);
        String origin = NetworkPolicy.origin(network.base(baseUrl));
        if (!origin.equals(row.get("ALLOWED_ORIGIN")) || !auth.equals(row.get("SECRET_TYPE")))
            throw new DomainException(
                    "CREDENTIAL_SCOPE_MISMATCH", 422, "Credential origin or authentication type mismatch");
    }

    public long revision(ScopeContext s, String id) {
        return id == null ? 0 : ((Number) credential(s, id, false).get("SECRET_REVISION")).longValue();
    }

    public Resolved resolve(ScopeContext s, String id, String auth, String baseUrl) {
        if ("NONE".equals(auth)) {
            checkBinding(s, id, auth, baseUrl);
            return new Resolved(null, 0);
        }
        var row = credential(s, id, false);
        String origin = NetworkPolicy.origin(network.base(baseUrl));
        if (!origin.equals(row.get("ALLOWED_ORIGIN")) || !auth.equals(row.get("SECRET_TYPE")))
            throw new DomainException("CREDENTIAL_SCOPE_MISMATCH", 422, "Credential scope mismatch");
        long revision = ((Number) row.get("SECRET_REVISION")).longValue();
        return new Resolved(
                cipher.decrypt(
                        new CredentialCipher.Encrypted(
                                (byte[]) row.get("CIPHERTEXT"),
                                (byte[]) row.get("NONCE"),
                                (byte[]) row.get("WRAPPED_DEK"),
                                (String) row.get("KEK_VERSION")),
                        aad(s, id, revision, origin)),
                revision);
    }

    private Map<String, Object> credential(ScopeContext s, String id, boolean lock) {
        if (id == null) throw new DomainException("CREDENTIAL_REQUIRED", 422, "Credential required");
        var rows = jdbc.queryForList(
                """
                SELECT ID,SECRET_TYPE,ALLOWED_ORIGIN,SECRET_REVISION,CIPHERTEXT,NONCE,WRAPPED_DEK,KEK_VERSION,STATUS
                FROM MODEL_CREDENTIAL WHERE TENANT_ID = ? AND WORKSPACE_ID = ? AND ID = ?
                """
                        + (lock ? " FOR UPDATE" : ""),
                s.tenantId(),
                s.workspaceId(),
                id);
        if (rows.isEmpty()) throw IdentityService.missing();
        var row = rows.getFirst();
        if (!"ACTIVE".equals(row.get("STATUS")) || row.get("CIPHERTEXT") == null)
            throw new DomainException("CREDENTIAL_REVOKED", 409, "Credential revoked");
        return row;
    }

    private static String aad(ScopeContext s, String id, long revision, String origin) {
        return s.tenantId() + "|" + s.workspaceId() + "|" + id + "|" + revision + "|" + origin;
    }

    static void version(int changed) {
        if (changed != 1) throw new DomainException("VERSION_CONFLICT", 409, "Resource changed or unavailable");
    }
}
