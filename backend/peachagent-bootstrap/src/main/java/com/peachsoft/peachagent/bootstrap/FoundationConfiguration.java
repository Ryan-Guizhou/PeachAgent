package com.peachsoft.peachagent.bootstrap;

import com.peachsoft.peachagent.common.IdGenerator;
import com.peachsoft.peachagent.common.UuidV7Generator;
import java.time.Clock;
import org.springframework.boot.ApplicationRunner;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.jdbc.core.JdbcTemplate;

/** 启动时核对数据库初始化契约，拒绝在错误的数据库环境运行。 */
@Configuration
public class FoundationConfiguration {
    @Bean
    Clock clock() { return Clock.systemUTC(); }

    @Bean
    IdGenerator idGenerator(Clock clock) { return new UuidV7Generator(clock); }

    @Bean
    ApplicationRunner databaseContract(JdbcTemplate jdbc) {
        return args -> {
            Integer caseNames = jdbc.queryForObject("SELECT @@LOWER_CASE_TABLE_NAMES", Integer.class);
            String collation = jdbc.queryForObject("SELECT @@COLLATION_DATABASE", String.class);
            if (!Integer.valueOf(1).equals(caseNames) || !"utf8mb4_0900_ai_ci".equalsIgnoreCase(collation)) {
                throw new IllegalStateException("Database must be initialized with case-insensitive identifiers and UTF8MB4_0900_AI_CI");
            }
            Integer count = jdbc.queryForObject(
                    "SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'IAM_USER'",
                    Integer.class);
            if (!Integer.valueOf(1).equals(count)) {
                throw new IllegalStateException("Database migration not ready");
            }
        };
    }
}
