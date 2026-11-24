package com.peachsoft.peachagent.iam;

import com.peachsoft.peachagent.common.DomainException;
import java.util.List;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.core.script.DefaultRedisScript;
import org.springframework.stereotype.Component;

/** 原子计数及过期，Redis 异常时不放行敏感请求。 */
@Component
public class AccountRateLimiter {
    private static final DefaultRedisScript<Long> INCREMENT = new DefaultRedisScript<>(
            "local n=redis.call('INCR',KEYS[1]); if n==1 then redis.call('EXPIRE',KEYS[1],ARGV[1]); end; return n",
            Long.class);
    private final StringRedisTemplate redis;
    public AccountRateLimiter(StringRedisTemplate redis) { this.redis = redis; }

    public void check(String operation, String key, int limit, int seconds) {
        Long count = redis.execute(INCREMENT,
                List.of("peachagent:iam:" + operation + ":" + SecurityTokens.digestHex(key)),
                Integer.toString(seconds));
        if (count == null || count > limit) {
            throw new DomainException("RATE_LIMITED", 429, "Too many requests");
        }
    }
}
