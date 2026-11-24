package com.peachsoft.peachagent.iam;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.ApplicationRunner;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Profile;

/**
 * 仅独立部署初始化 profile 允许创建首个管理员，无默认账号密码。
 * @Author Mr Shu
 * @Version 1.0.0
 * @CreateTime 2026/11/24 11:33
 */
@Configuration
@Profile("admin-init")
public class AdminProvisioning {
    @Bean
    ApplicationRunner provisionAdmin(
            AccountService account,
            @Value("${ADMIN_EMAIL}") String email,
            @Value("${ADMIN_PASSWORD}") String password) {
        return args -> account.provisionAdmin(email, password);
    }
}
