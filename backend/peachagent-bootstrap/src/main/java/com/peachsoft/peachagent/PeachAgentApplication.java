package com.peachsoft.peachagent;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.scheduling.annotation.EnableScheduling;

/** 同一发行包支持 API 与 Runtime Worker 两种独立启动角色。 */
@SpringBootApplication
@EnableScheduling
public class PeachAgentApplication {
    public static void main(String[] args) {
        SpringApplication.run(PeachAgentApplication.class, args);
    }
}
