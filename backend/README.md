# PeachAgent 服务端（P1 开发中）

依据 [已批准技术方案](../technical/P1-TECHNICAL-DESIGN.md) 和 [P1 评审](https://github.com/Ryan-Guizhou/PeachAgent/issues/18)。当前先建立可构建的七模块工程与 API/Worker 角色，不能将启动成功视为业务功能验收。

## 开发环境

JDK 21、Maven 3.9+、Docker Compose。使用新的 MySQL 数据目录，禁止在既有目录改变 LOWER_CASE_TABLE_NAMES。先配置 MYSQL_ROOT_PASSWORD、DB_USER、DB_PASSWORD、REDIS_PASSWORD，然后在仓库根目录执行：

```bash
docker compose -f compose.dev.yml up -d --wait mysql redis mailpit
mvn -B -f backend/pom.xml verify
```

配置 DB_URL（例如 jdbc:mysql://127.0.0.1:3306/peachagent）、DB_USER、DB_PASSWORD、REDIS_PASSWORD。API 首先执行 Flyway 迁移，Worker 必须等待数据库准备完成。生产同源 HTTPS 使用 Secure Cookie，只有本地 HTTP 开发环境显式设置 COOKIE_SECURE=false。

```bash
java -jar backend/peachagent-bootstrap/target/peachagent-bootstrap-1.0.0-SNAPSHOT.jar --spring.profiles.active=api
# 另一个终端，使用相同的数据库和 Redis 配置
java -jar backend/peachagent-bootstrap/target/peachagent-bootstrap-1.0.0-SNAPSHOT.jar --spring.profiles.active=worker
```

API 健康检查为 /actuator/health。业务时间统一 yyyyMMddHHmmss UTC。数据库安全配置/密码仅来自环境变量，不在代码中保存真实秘密。
