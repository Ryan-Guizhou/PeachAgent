package com.peachsoft.peachagent.common;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.HashSet;
import java.util.UUID;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * 验证 UTC 业务时间字符串的格式、边界和加减运算。
 * @Author Mr Shu
 * @Version 1.0.0
 * @CreateTime 2026/11/24 11:27
 */
class TimeCodecTest {
    @Test
    void fixedUtcAndStrictParsing() {
        assertEquals("20261124030200", TimeCodec.format(Instant.parse("2026-11-24T03:02:00.999Z")));
        assertEquals("20270101000000", TimeCodec.plusSeconds("20261231235959", 1));
        assertEquals("20240229000000", TimeCodec.plusSeconds("20240228235959", 1));
        assertThrows(RuntimeException.class, () -> TimeCodec.parse("20260230000000"));
        assertThrows(RuntimeException.class, () -> TimeCodec.parse("2026-11-24T03:02:00Z"));
        assertThrows(RuntimeException.class, () -> TimeCodec.parse("00000101000000"));
    }

    @Test
    void uuidV7HasCorrectBitsAndNoCollisionsInSample() {
        var generator = new UuidV7Generator(Clock.fixed(Instant.parse("2026-11-24T03:02:00Z"), ZoneOffset.UTC));
        var ids = new HashSet<String>();
        for (int i = 0; i < 10000; i++) {
            String id = generator.nextId();
            UUID parsed = UUID.fromString(id);
            assertEquals(7, parsed.version());
            assertEquals(2, parsed.variant());
            assertTrue(ids.add(id));
        }
    }
}
