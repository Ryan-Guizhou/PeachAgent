package com.peachsoft.peachagent.common;

import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.time.format.DateTimeFormatter;
import java.time.format.ResolverStyle;
import java.time.temporal.ChronoUnit;
import java.util.Locale;
import java.util.Objects;

/**
 * 业务时间点统一为 UTC 的十四位年月日时分秒字符串。
 * @Author Mr Shu
 * @Version 1.0.0
 * @CreateTime 2026/11/24 11:27
 */
public final class TimeCodec {
    private static final DateTimeFormatter FORMAT =
            DateTimeFormatter.ofPattern("uuuuMMddHHmmss", Locale.ROOT).withResolverStyle(ResolverStyle.STRICT);

    private TimeCodec() {}

    public static String format(Instant value) {
        LocalDateTime utc = LocalDateTime.ofInstant(Objects.requireNonNull(value), ZoneOffset.UTC);
        if (utc.getYear() < 1 || utc.getYear() > 9999) {
            throw new IllegalArgumentException("Time year outside supported range");
        }
        return FORMAT.format(utc.truncatedTo(ChronoUnit.SECONDS));
    }

    public static Instant parse(String value) {
        if (value == null || !value.matches("[0-9]{14}")) {
            throw new IllegalArgumentException("Expected UTC yyyyMMddHHmmss");
        }
        LocalDateTime parsed = LocalDateTime.parse(value, FORMAT);
        if (parsed.getYear() < 1) {
            throw new IllegalArgumentException("Invalid year");
        }
        return parsed.toInstant(ZoneOffset.UTC);
    }

    public static String plusSeconds(String value, long seconds) {
        return format(parse(value).plusSeconds(seconds));
    }
}
