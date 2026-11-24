package com.peachsoft.peachagent.model;

import com.peachsoft.peachagent.common.DomainException;
import java.util.Locale;

/** 对外协议标识独立于厂商及 Java 适配器实现。 */
public record ProtocolKey(String key, String version) {
    public ProtocolKey {
        if (key == null || version == null || !key.matches("[A-Za-z0-9][A-Za-z0-9._-]{0,99}")
                || !version.matches("[A-Za-z0-9][A-Za-z0-9._-]{0,39}")) {
            throw new DomainException("INVALID_PROTOCOL", 422, "Invalid protocol key or version");
        }
        key = key.toLowerCase(Locale.ROOT);
        version = version.toLowerCase(Locale.ROOT);
    }
}
