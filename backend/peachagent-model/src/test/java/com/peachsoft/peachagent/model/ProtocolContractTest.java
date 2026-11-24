package com.peachsoft.peachagent.model;

import com.peachsoft.peachagent.common.DomainException;

import java.security.SecureRandom;
import java.util.Base64;
import java.util.List;
import java.util.Map;
import java.util.Set;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertSame;
import static org.junit.jupiter.api.Assertions.assertThrows;

/**
 * 验证协议注册、版本固定、凭证加密及网络访问策略的契约。
 * @Author Mr Shu
 * @Version 1.0.0
 * @CreateTime 2026/11/24 11:34
 */
class ProtocolContractTest {
    @Test
    void registrationIsOpenAndVersionPinned() {
        ModelProtocolAdapter mock = new ModelProtocolAdapter() {
            public ProtocolDescriptor descriptor() {
                return new ProtocolDescriptor(
                        new ProtocolKey("test.native", "v1"),
                        "test.adapter",
                        "1.0.0",
                        Map.of("LLM", Set.of("CHAT")),
                        Set.of("NONE"),
                        Map.of(),
                        Map.of(),
                        true,
                        true,
                        "test");
            }

            public void validate(ProtocolConfiguration c) {}

            public ModelExecution execute(ModelExecutionRequest r, ModelExecutionContext c) {
                return new ModelExecution(Map.of("text", "test"), ModelExecution.Usage.unknown(), null, null, null);
            }
        };
        var registry = new ModelProtocolRegistry(List.of());
        registry.register(mock);
        assertSame(mock, registry.resolve(new ProtocolKey("TEST.NATIVE", "v1"), "LLM", "CHAT"));
        assertThrows(IllegalStateException.class, () -> registry.register(mock));
        assertThrows(
                DomainException.class,
                () -> registry.resolve(new ProtocolKey("test.native", "v1"), "IMAGE", "GENERATE_IMAGE"));
        assertThrows(
                DomainException.class,
                () -> registry.resolvePinned(
                        new ProtocolKey("test.native", "v1"), "LLM", "CHAT", "test.adapter", "2.0.0"));
    }

    @Test
    void envelopeBindsScopeAndRevision() {
        byte[] key = new byte[32];
        new SecureRandom().nextBytes(key);
        var cipher = new CredentialCipher(Base64.getEncoder().encodeToString(key), "1");
        var encrypted = cipher.encrypt("caseSensitive-Secret", "tenant|space|id|1|origin");
        assertEquals("caseSensitive-Secret", cipher.decrypt(encrypted, "tenant|space|id|1|origin"));
        assertThrows(DomainException.class, () -> cipher.decrypt(encrypted, "other|space|id|1|origin"));
    }

    @Test
    void rejectsLocalAndMetadataByDefault() {
        var policy = new NetworkPolicy("");
        assertThrows(DomainException.class, () -> policy.base("http://127.0.0.1:8081"));
        assertThrows(DomainException.class, () -> policy.base("https://169.254.169.254"));
        assertThrows(DomainException.class, () -> policy.base("https://example.invalid@127.0.0.1"));
        var local = new NetworkPolicy("http://127.0.0.1:8081");
        assertEquals(
                "http://127.0.0.1:8081/", local.base("http://127.0.0.1:8081").toString());
    }
}
