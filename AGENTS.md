# PeachAgent 工程规范

以当前源码、测试、POM、配置及实际运行证据为准；历史设计和原型不能代替实现。遵循 [peach-cloud AGENTS.md](https://github.com/Ryan-Guizhou/peach-cloud/blob/main/AGENTS.md) 和 [Java 工程规范](https://github.com/Ryan-Guizhou/peach-cloud/blob/main/.agents/skills/using-peach-java-engineering/SKILL.md)，按 PeachAgent 的现有模块边界实施。

## 研发流程

- 当前阶段仅 P1；下一阶段必须先评审并经用户批准。单 Issue 对应单分支、单 PR；CI 全绿后才合并 main，父验收 Issue 不随子任务关闭。
- 无关业务重构不与格式整改混用。公共 API、SPI、数据库、配置、权限及并发/事务契约变化须审查影响面。
- 文档中文主版本与英文等价版本同步，不把测试 fixture 声称为真实供应商验收。

## Java

- Java 21、jakarta 命名空间。四空格、UTF-8/LF、常规块与分行、明确 import；禁止通配 import、代码中使用完全限定类型名（确有名称冲突须先解决命名）。使用 Spotless/Palantir 统一排版。
- 类型级 Javadoc 用中文，含 `@Author Mr Shu`、`@Version 1.0.0`、`@CreateTime yyyy/M/d HH:mm`；公共 API、SPI、复杂事务/并发/资源生命周期注释解释契约、异常、副作用与边界，不重复方法名。
- 日志使用英文和 SLF4J LoggerFactory；只输出允许的非敏感标识和错误分类，不打印凭证、请求全文、验证码或响应正文。
- Spring Bean 构造器注入，依赖字段 private final；引入 Lombok 后可优先 RequiredArgsConstructor，不为机械改写增加依赖。Controller 适配协议，Service 维护业务与事务，持久层负责数据库访问；新代码采用明确 DTO/QO/VO 和完整英文命名，不在本次格式整改中改变已批准 API 契约。
- 常量、枚举、异常体现业务语义。优先适合的 Spring StringUtils/CollectionUtils；不用全限定名，不机械替换 Optional/record/Stream/var。资源和中断、异常、关闭路径明确，不静默吞掉业务异常。
- POM 保持现有四空格、清晰依赖块；模块边界与依赖可传递性经实际检查。

## 前端

- Vue 3 Composition API、TypeScript；双空格、单引号、无分号、尾逗号，由 Prettier 配置统一。组件保持单一职责、明确 Props/Emits/API 类型，不新增裸 any 或无说明断言。异步状态、权限、焦点、键盘及清理路径完整。
- 不把密钥、验证码、真实 token 放入浏览器构建或日志。不改变既有交互和 API，只为格式化做行为保持的变更。

## 数据与配置

- SQL 关键字、标识符大写，业务值保留原始大小写；业务时间 UTC CHAR(14) yyyyMMddHHmmss。默认数据库 UTF8MB4_UNICODE_CI，兼容 MySQL 5.7/8.x；不得关闭外键、租户隔离、Flyway 校验或自动删除数据。
- 本地已知测试账号仅允许显式 api,dev profile 加载的 Flyway V4；正常 API 不加载测试数据，禁止关闭 Flyway 校验或将开发库转为生产库。
- QQ SMTP 默认 SSL 465，真实邮箱及授权码仅由环境变量注入；本地邮件测试 fixture 仅限隔离 QA。

## 验证

```bash
mvn -f backend/pom.xml spotless:apply
python3 scripts/check-java-style.py
mvn -f backend/pom.xml verify
cd frontend
npm ci
npm run format:check
npm run build
```

行为变更执行受影响的集成测试及安全门禁；无法验证则记录明确风险，不宣称通过。
