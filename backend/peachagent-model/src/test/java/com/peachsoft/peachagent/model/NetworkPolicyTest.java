package com.peachsoft.peachagent.model;

import com.peachsoft.peachagent.common.DomainException;

import java.net.InetAddress;
import java.net.URI;
import java.util.List;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * 覆盖无需外部 DNS 或供应商凭证的网络安全边界。
 * @Author Mr Shu
 * @Version 1.0.0
 * @CreateTime 2026/11/24 15:05
 */
class NetworkPolicyTest {

    @Test
    void rejectsSpecialAddressesEvenForInternalOrigins() throws Exception {
        for (String address : List.of(
                "0.0.0.0",
                "169.254.169.254",
                "100.100.100.200",
                "192.0.2.1",
                "192.88.99.1",
                "198.18.0.1",
                "224.0.0.1",
                "2001:0::1",
                "2001:db8::1",
                "2002:7f00:1::1",
                "3fff::1",
                "fe80::1",
                "fd00:ec2::254")) {
            InetAddress ip = InetAddress.getByName(address);
            assertFalse(NetworkPolicy.allowed(ip, false), address);
            assertFalse(NetworkPolicy.allowed(ip, true), address);
        }
    }

    @Test
    void privateAddressesRequireExplicitInternalOrigin() throws Exception {
        for (String address : List.of("127.0.0.1", "10.0.0.1", "172.16.0.1", "192.168.1.1", "::1", "fd12:3456::1")) {
            InetAddress ip = InetAddress.getByName(address);
            assertFalse(NetworkPolicy.allowed(ip, false), address);
            assertTrue(NetworkPolicy.allowed(ip, true), address);
        }
        assertTrue(NetworkPolicy.allowed(InetAddress.getByName("8.8.8.8"), false));
        assertTrue(NetworkPolicy.allowed(InetAddress.getByName("2606:4700::1111"), false));
    }

    @Test
    void originAllowlistDoesNotPermitOtherPortsOrEscapingPaths() {
        NetworkPolicy policy = new NetworkPolicy("http://127.0.0.1:18081");
        URI base = policy.base("http://127.0.0.1:18081/v1");
        assertThrows(DomainException.class, () -> policy.base(null));
        assertThrows(DomainException.class, () -> policy.base("http://127.0.0.1:18082"));
        assertThrows(DomainException.class, () -> policy.base("http://127.0.0.1:18081/%2e%2e"));
        assertThrows(DomainException.class, () -> policy.endpoint(base, "//127.0.0.1"));
        assertThrows(DomainException.class, () -> policy.endpoint(base, "../admin"));
    }
}
