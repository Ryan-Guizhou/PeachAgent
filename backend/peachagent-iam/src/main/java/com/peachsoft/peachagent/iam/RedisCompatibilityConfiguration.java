package com.peachsoft.peachagent.iam;

import cn.dev33.satoken.dao.SaTokenDao;
import cn.dev33.satoken.dao.SaTokenDaoForRedisTemplate;

import java.util.Collections;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Primary;
import org.springframework.data.redis.core.script.DefaultRedisScript;

/**
 * 提供兼容 Redis 3.x 的 Sa-Token 会话存储实现。
 * @Author Mr Shu
 * @Version 1.0.0
 * @CreateTime 2026/11/25 09:40
 */
@Configuration
public class RedisCompatibilityConfiguration {
    private static final DefaultRedisScript<Long> UPDATE_KEEP_TTL_SCRIPT = new DefaultRedisScript<>(
            """
            local ttl = redis.call('PTTL', KEYS[1])
            if ttl == -2 or ttl == 0 then
                return 0
            end
            if ttl == -1 then
                redis.call('SET', KEYS[1], ARGV[1])
            else
                redis.call('PSETEX', KEYS[1], ttl, ARGV[1])
            end
            return 1
            """,
            Long.class);

    /**
     * 使用 Redis 3.x 支持的 Lua 命令原子保留 Session 原过期时间。
     *
     * @return Sa-Token Redis DAO
     */
    @Bean
    @Primary
    SaTokenDao saTokenDao() {
        return new SaTokenDaoForRedisTemplate() {
            @Override
            public void update(String key, String value) {
                String finalKey = wrapKey(key);
                stringRedisTemplate.execute(UPDATE_KEEP_TTL_SCRIPT, Collections.singletonList(finalKey), value);
            }
        };
    }
}
