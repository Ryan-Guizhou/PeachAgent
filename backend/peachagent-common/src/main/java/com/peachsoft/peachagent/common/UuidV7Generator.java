package com.peachsoft.peachagent.common;

import java.security.SecureRandom;
import java.time.Clock;
import java.util.Objects;
import java.util.UUID;

/** UUIDv7：48 位毫秒时间、版本位、随机位及 RFC 变体位。 */
public final class UuidV7Generator implements IdGenerator {
    private final Clock clock;
    private final SecureRandom random = new SecureRandom();

    public UuidV7Generator(Clock clock) {
        this.clock = Objects.requireNonNull(clock);
    }

    @Override
    public String nextId() {
        long millis = clock.millis();
        if (millis < 0 || millis > 0xFFFFFFFFFFFFL) {
            throw new IllegalStateException("UUIDv7 timestamp out of range");
        }
        long high = (millis << 16) | 0x7000L | random.nextInt(4096);
        long low = (random.nextLong() & 0x3FFFFFFFFFFFFFFFL) | 0x8000000000000000L;
        return new UUID(high, low).toString();
    }
}
