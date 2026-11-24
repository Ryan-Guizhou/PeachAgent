package com.peachsoft.peachagent.bootstrap;

import com.peachsoft.peachagent.common.IdGenerator;
import com.peachsoft.peachagent.common.UuidV7Generator;
import java.sql.SQLException;
import java.time.Clock;
import java.util.Locale;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.ApplicationRunner;
import org.springframework.boot.flyway.autoconfigure.FlywayConfigurationCustomizer;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.jdbc.core.JdbcTemplate;

/** 启动时核对数据库初始化契约，拒绝在错误的数据库环境运行。 */
@Configuration
public class FoundationConfiguration {
    private static final Logger log = LoggerFactory.getLogger(FoundationConfiguration.class);
    @Bean
    Clock clock() { return Clock.systemUTC(); }

    @Bean
    IdGenerator idGenerator(Clock clock) { return new UuidV7Generator(clock); }

    /**
     * MySQL 5.7 不支持具名 CHECK 约束，独立迁移保留约束语义。
     * MySQL 8 继续使用原始 V1，既有 Flyway 校验和保持不变。
     *
     * @return 按数据库版本选择迁移目录的配置器
     */
    @Bean
    FlywayConfigurationCustomizer databaseMigrations() {
        return configuration -> {
            try (var connection = configuration.getDataSource().getConnection()) {
                int major = connection.getMetaData().getDatabaseMajorVersion();
                int minor = connection.getMetaData().getDatabaseMinorVersion();
                if (major == 5 && minor == 7) {
                    configuration.locations("classpath:db/mysql57", "classpath:db/common");
                } else if (major >= 8) {
                    configuration.locations("classpath:db/migration", "classpath:db/common");
                } else {
                    throw new IllegalStateException("MySQL 5.7 or 8.x is required");
                }
            } catch (SQLException exception) {
                throw new IllegalStateException("Unable to determine MySQL version", exception);
            }
        };
    }

    @Bean
    ApplicationRunner databaseContract(JdbcTemplate jdbc) {
        return args -> {
            Integer caseNames = jdbc.queryForObject("SELECT @@LOWER_CASE_TABLE_NAMES", Integer.class);
            String collation = jdbc.queryForObject("SELECT @@COLLATION_DATABASE", String.class);
            if (!Integer.valueOf(1).equals(caseNames) && !Integer.valueOf(2).equals(caseNames)) {
                throw new IllegalStateException("Database requires case-insensitive identifiers: LOWER_CASE_TABLE_NAMES=1 or 2");
            }
            if (collation == null || !collation.toLowerCase(Locale.ROOT).startsWith("utf8mb4_")
                    || !collation.toLowerCase(Locale.ROOT).endsWith("_ci")) {
                throw new IllegalStateException("Database requires a case-insensitive UTF8MB4 collation; use UTF8MB4_UNICODE_CI");
            }
            Integer count = jdbc.queryForObject(
                    "SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'IAM_USER'",
                    Integer.class);
            if (!Integer.valueOf(1).equals(count)) {
                throw new IllegalStateException("Database migration not ready");
            }
            log.info("Database contract verified");
        };
    }
}
