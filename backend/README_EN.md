# PeachAgent backend

[中文](README.md) | [PRD](../requirements/PRD-PeachAgent.md) | [P1 design](../technical/P1-TECHNICAL-DESIGN.md) | [Frontend](../frontend/README_EN.md)

P1 uses JDK 21, Spring Boot 4.1.3, a seven-module Maven project, MySQL 8.4 and Redis 7.4. API serves identity, resources and SSE; an independent Worker consumes persistent MySQL runs, invokes models and settles usage. This is a development environment, not the P7 production deployment. See [#18](https://github.com/Ryan-Guizhou/PeachAgent/issues/18) for acceptance.

## 1. Prerequisites and topology

```mermaid
flowchart LR
  B[Browser] --> V[Vite 127.0.0.1:5173]
  V -->|/api proxy| A[API 8080]
  A --> D[(MySQL 3306)]
  A --> R[(Redis 6379)]
  A --> M[Mailpit SMTP 1025]
  W[Worker without HTTP port] --> D
  W --> P[Model provider HTTPS]
  A --> F[Shared private artifact directory]
  W --> F
  W --> R
```

Install Git, JDK 21, Maven 3.9+, Node.js 22 (at least 22.12), npm and Docker Desktop or Docker Engine with Compose v2. From the repository root check `java -version`, `mvn -version`, `node -v`, `npm -v`, `docker version` and `docker compose version`. MySQL 3306, Redis 6379, Mailpit SMTP 1025/UI 8025, API 8080, Vite 5173 must be available. Middleware is published only on 127.0.0.1.

## 2. Configure

Copy [.env.example](../.env.example) to .env (`Copy-Item .env.example .env` in PowerShell, `cp .env.example .env` in Bash). Fill MYSQL_ROOT_PASSWORD, DB_PASSWORD, REDIS_PASSWORD and CREDENTIAL_KEK with locally generated random values; do not commit .env. Random hexadecimal passwords avoid shell/Compose quoting ambiguity. KEK is Base64 of exactly 32 random bytes, not a 32-character password. Bash: `openssl rand -base64 32`. PowerShell:

```powershell
$bytes = New-Object byte[] 32
$rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
$rng.GetBytes($bytes)
[Convert]::ToBase64String($bytes)
$rng.Dispose()
```

Persist and back up the key; API and Worker use the same key/version. Do not regenerate on restart. Changing key version does not migrate existing ciphertext.

| Environment variable | Default / example | Purpose |
| --- | --- | --- |
| MYSQL_ROOT_PASSWORD | Required (Compose) | Initialization root password, not used by app |
| DB_USER / DB_PASSWORD | Required | App DB credentials, matching Compose |
| DB_URL | Required; jdbc:mysql://127.0.0.1:3306/peachagent | JDBC URL |
| REDIS_HOST / REDIS_PORT | localhost / 6379 | Redis address |
| REDIS_PASSWORD | Empty in app; required by Compose | Session and rate limiting |
| SMTP_HOST / SMTP_PORT | localhost / 1025 | Mailpit for development; verification/reset |
| SMTP_USER / SMTP_PASSWORD | Empty | SMTP credentials |
| SMTP_AUTH / SMTP_TLS | false / false | SMTP AUTH / STARTTLS |
| MAIL_FROM | no-reply@peachagent.local | Sender |
| SERVER_PORT | 8080 | API port; update Vite proxy if changed |
| PUBLIC_ORIGIN | http://localhost:8080 | Exact browser origin; Vite uses http://127.0.0.1:5173 |
| COOKIE_SECURE | true | false only for local HTTP; true for HTTPS |
| CREDENTIAL_KEK | Empty | 32-byte Base64 key; empty disables credential creation/decryption |
| CREDENTIAL_KEK_VERSION | 1 | Key version shared by API and Worker |
| PEACHAGENT_ALLOWED_INTERNAL_ORIGINS | Empty | Explicit comma-separated trusted internal origins, e.g. http://127.0.0.1:11434; default public HTTPS:443; metadata remains blocked |
| PEACHAGENT_ARTIFACT_DIRECTORY | ./data/artifacts | Same private directory for API and Worker; use absolute path if working directories differ |
| ADMIN_EMAIL / ADMIN_PASSWORD | Required by admin-init only | Optional first administrator; at least 12-character password |

MySQL uses UTF8MB4 / UTF8MB4_0900_AI_CI and LOWER_CASE_TABLE_NAMES=1 on a **fresh data directory**. Do not change that setting on an existing volume. Flyway V1 creates 25 business tables. Business time is UTC CHAR(14) yyyyMMddHHmmss. SQL identifiers and keywords are uppercase; credentials and external model IDs retain exact case.

## 3. Start dependencies and build

```bash
docker compose --env-file .env -f compose.dev.yml up -d --wait mysql redis mailpit
docker compose --env-file .env -f compose.dev.yml ps
mvn -B -f backend/pom.xml verify
```

Compose .env interpolation does not export variables to a host JVM. In each new terminal, from the repository root, load your own trusted .env with simple unquoted values. PowerShell:

```powershell
Get-Content .env | ForEach-Object {
    if ($_ -match '^([A-Z_][A-Z0-9_]*)=(.*)$') {
        [Environment]::SetEnvironmentVariable($Matches[1], $Matches[2], 'Process')
    }
}
```

Bash:

```bash
set -a
. ./.env
set +a
```

## 4. Start API, Worker and UI

Terminal A (load .env first):

```bash
java -jar backend/peachagent-bootstrap/target/peachagent-bootstrap-1.0.0-SNAPSHOT.jar --spring.profiles.active=api
```

Wait for `curl http://127.0.0.1:8080/actuator/health` to return UP (PowerShell: `Invoke-RestMethod http://127.0.0.1:8080/actuator/health`). API performs Flyway migration. Terminal B (load same .env, same repository working directory):

```bash
java -jar backend/peachagent-bootstrap/target/peachagent-bootstrap-1.0.0-SNAPSHOT.jar --spring.profiles.active=worker
```

Worker has no web port and Flyway is disabled; confirm startup logs and actual run execution. Terminal C:

```bash
cd frontend
npm install
npm run dev
```

Open http://127.0.0.1:5173, matching PUBLIC_ORIGIN exactly. Vite proxies /api to 127.0.0.1:8080 and preserves Origin. Mailpit UI: http://127.0.0.1:8025. See [frontend setup](../frontend/README_EN.md).

IntelliJ IDEA: import backend/pom.xml; set project SDK and Maven runner JRE to JDK 21. Create two Application/Spring Boot configurations with main class com.peachsoft.peachagent.PeachAgentApplication, classpath peachagent-bootstrap, repository root as working directory, program arguments --spring.profiles.active=api / --spring.profiles.active=worker, and the same environment from .env. Do not share run configurations containing secrets. Start API before Worker; use a separate npm dev configuration in frontend.

Optional same-origin build: from frontend run npm install and npm run build, return to repository root, load .env and override PUBLIC_ORIGIN=http://localhost:8080 in the API terminal (Bash export or PowerShell $env:PUBLIC_ORIGIN). Run:

```bash
java -jar backend/peachagent-bootstrap/target/peachagent-bootstrap-1.0.0-SNAPSHOT.jar --spring.profiles.active=api --spring.web.resources.static-locations=file:./frontend/dist/
```

Run Worker separately; visit http://localhost:8080/#/home. This matches CI's static UI mode, not production packaging.

## 5. First account and model

Register with email, name, currency and a password of at least 12 characters; retrieve the one-time verification token from Mailpit. Registration creates a personal tenant, default workspace/project and three budget policies. Create a credential bound to provider origin for BEARER or API_KEY; NONE has no credential. Create a provider connection (Base URL prefix, not final operation URL), model instance with actual external model ID and protocol, bind it to the project, run diagnostics, then use a VERIFIED model in Chat. Inspect runs, events and usage; unknown costs are not zero and real requests may incur charges.

| Built-in protocol (v1) | Type | Base URL example | Auth |
| --- | --- | --- | --- |
| openai.chat-completions | LLM | https://api.openai.com/v1 | BEARER / NONE |
| openai.embeddings | EMBEDDING | https://api.openai.com/v1 | BEARER / NONE |
| openai.images | IMAGE | https://api.openai.com/v1 | BEARER / NONE |
| openai.audio-transcriptions | STT | https://api.openai.com/v1 | BEARER / NONE |
| openai.audio-speech | TTS | https://api.openai.com/v1 | BEARER / NONE |
| anthropic.messages | LLM | https://api.anthropic.com/v1 | API_KEY |
| dashscope.text-rerank | RERANK | https://dashscope.aliyuncs.com/api/v1 | BEARER |

Examples are protocol prefixes, not verified live vendor compatibility. Check available models and actual endpoint; streaming usage and b64 PNG/WAV contracts vary. STT is limited to 10 MiB WAV; artifacts are limited to 20 MiB and expire after 24 hours. Only allow trusted local origins through the explicit allowlist on both API and Worker. Optional first administrator: load .env in a separate terminal, set ADMIN_EMAIL and ADMIN_PASSWORD, run the same jar once with --spring.profiles.active=admin-init, and remove the password from that terminal afterward. Do not combine admin-init with API; no default administrator exists and repeat provisioning is rejected.

## 6. Validate, troubleshoot and stop

```bash
mvn -B -f backend/pom.xml verify
bash database/verify-schema.sh
cd frontend
npm run build
npm audit --audit-level=high
```

The [backend CI](../.github/workflows/p1-backend.yml) runs IAM, runtime and Chromium smoke on disposable database/Mailpit/HTTP fixtures; never run against real data. Linux CI pins Ubuntu 24.04; Windows can run npx playwright install chromium from frontend. Screenshots are uploaded as CI artifacts. Fixtures do not verify live providers.

| Symptom | Check |
| --- | --- |
| Unresolved DB_URL / DB_PASSWORD | Load .env into every JVM terminal or IDE |
| DB access denied / contract failure | Check original volume credentials, collation and lower_case_table_names |
| Health DOWN | Compose ps/logs mysql redis mailpit and actual connections |
| No registration email | Mailpit 8025, SMTP settings and sender |
| 403 login or mutation | Exact PUBLIC_ORIGIN, CSRF; do not mix localhost/127.0.0.1 |
| 401 after login | COOKIE_SECURE=false only for HTTP development; check Redis/cookie |
| Vault unconfigured / decryption failure | Same 32-byte Base64 KEK/version; restore original key |
| Endpoint denied / DNS failure | Protocol, DNS, port, trusted origin; no blanket private access |
| Run remains QUEUED | Worker, same DB, logs, budget/deadline; never edit run state manually |
| Artifact unavailable | Shared private directory, permissions, expiry |
| Flyway checksum mismatch | Never edit applied migration; use new migration |
| Chromium install failure | Supported OS and pinned Playwright; keep browser gate |

Stop UI/API/Worker with Ctrl+C; run `docker compose --env-file .env -f compose.dev.yml down` to retain volumes. Only disposable test environments may use down -v after confirming data loss. Retain .env and original KEK. Production deployment, backup/restore and upgrades belong to P7.
