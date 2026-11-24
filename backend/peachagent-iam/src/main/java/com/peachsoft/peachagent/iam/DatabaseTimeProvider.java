package com.peachsoft.peachagent.iam;

import com.peachsoft.peachagent.common.TimeCodec;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

/**
 * 租约、预算与挑战消费使用数据库 UTC 时钟。
 * @Author Mr Shu
 * @Version 1.0.0
 * @CreateTime 2026/11/24 11:27
 */
@Component
public class DatabaseTimeProvider {
    private final JdbcTemplate jdbc;

    public DatabaseTimeProvider(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public String now() {
        String value = jdbc.queryForObject("SELECT DATE_FORMAT(UTC_TIMESTAMP(), '%Y%m%d%H%i%s')", String.class);
        TimeCodec.parse(value);
        return value;
    }
}
