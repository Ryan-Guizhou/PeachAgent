"""One-time formatting preparation for the isolated #65 branch."""
from datetime import datetime, timedelta, timezone
from pathlib import Path
import re
import subprocess
import runpy
mask = runpy.run_path(str(Path(__file__).with_name('check-java-style.py')))['mask']


ROOT = Path(__file__).resolve().parents[1]
TOP = re.compile(r"(?m)^(?:(?:public|protected|private|abstract|final|sealed|non-sealed|static|strictfp)\s+)*(?:@interface|class|interface|enum|record)\s+([A-Za-z_$][\w$]*)")
DOC = re.compile(r"/\*\*[\s\S]*?\*/")
MISSING = {
    "TimeCodecTest": "验证 UTC 业务时间字符串的格式、边界和加减运算。",
    "AuthController": "账号注册、登录、恢复及偏好设置的 HTTP 协议入口，身份与业务规则由 IAM 服务校验。",
    "WorkspaceController": "工作空间和项目的资源接口，所有操作通过服务端身份范围授权。",
    "MeteringController": "三级预算和用量事实的查询、限额维护入口，作用域由服务端解析。",
    "ModelController": "模型协议目录、凭证、供应商、模型与项目绑定的 HTTP 入口，不向客户端暴露明文密钥。",
    "ProtocolContractTest": "验证协议注册、版本固定、凭证加密及网络访问策略的契约。",
    "RunController": "运行提交、查询、停止、重试、SSE 与产物下载接口，项目权限及运行事实由服务端校验。",
    "StudioController": "Prompt 版本、会话与插件声明接口，所有数据读写限定于授权空间和项目。",
    "PromptTemplateTest": "验证受控变量渲染、缺失或非法参数拒绝及表达式注入防护。",
}
NESTED = {
    "AccountService.Challenge": "邮箱挑战申请参数，验证用途由服务端限制。",
    "AccountService.Register": "注册参数，挑战令牌为一次性凭证。",
    "AccountService.Login": "登录参数，记住会话的有效期由服务端控制。",
    "AccountService.Reset": "一次性密码恢复参数，不持久化明文密码。",
    "AccountService.Preferences": "用户语言及主题偏好。",
    "AdminAccountController.AccountStatus": "账号状态更新参数，版本号用于防止并发覆盖。",
    "IdentityService.Principal": "已通过账号状态检查的登录主体及租户信息。",
    "IdentityService.ReadIdentity": "读取路径一次性解析的主体与授权项目范围。",
    "WorkspaceController.Revision": "用于归档和恢复的乐观锁版本。",
    "WorkspaceService.Workspace": "工作空间的公开投影，不包含认证或模型密钥。",
    "WorkspaceService.Project": "项目的公开投影与更新版本。",
    "WorkspaceService.Create": "资源创建参数，归属由服务端身份确定。",
    "WorkspaceService.Update": "资源修改参数，版本号用于乐观并发控制。",
    "BudgetService.Limits": "预算策略限额和单次运行限制，版本号用于并发更新。",
    "BudgetService.Period": "预算所属 UTC 周期的起止边界。",
    "CredentialCipher.Encrypted": "信封加密结果；密文、随机数和包装密钥须完整保存。",
    "CredentialService.Create": "凭证创建参数，明文只在受控加密链路使用。",
    "CredentialService.Rotate": "密钥轮换参数，不允许输出明文。",
    "CredentialService.Resolved": "运行时受控解析后的凭证和版本，不对外序列化。",
    "ModelController.Revision": "资源更新的乐观锁版本。",
    "ModelController.Binding": "项目对空间模型的显式使用授权。",
    "ModelController.DefaultModel": "项目用途对应的默认模型配置。",
    "ModelExecution.Usage": "模型返回或估算的用量事实；缺失计数不能等同于零。",
    "ModelExecutionRequest.Message": "按模型协议传递的角色及正文。",
    "ModelService.ProviderInput": "供应商连接的非秘密配置与凭证引用。",
    "ModelService.ModelInput": "模型实例、协议版本、选项、价格与并发更新版本。",
    "ModelService.Snapshot": "运行受理后固定的模型配置，不包含凭证明文。",
    "ModelService.Prepared": "派发前校验后的协议实现、凭证和受控网络会话。",
    "ArtifactStore.Download": "经授权读取的产物内容与安全下载元数据。",
    "RunController.Retry": "重试时确认可能存在的未知外部消费。",
    "RunService.ChatInput": "对话运行的模型、文本和 Prompt 版本选择。",
    "RunService.DebugInput": "模型诊断输入及输出上限。",
    "RunService.Payload": "持久化执行输入快照，用于 Worker 领取任务。",
    "RunService.Claim": "当前 Worker 拥有的运行租约及 fencing 代次。",
    "RunService.EventPage": "同一状态快照下的事件页和终态高水位。",
    "ConversationService.Create": "新会话标题。",
    "ConversationService.Feedback": "当前用户对指定消息的评价及原因。",
    "PluginManifestService.Manifest": "私有插件声明和配置 Schema，不加载代码或扩大权限。",
    "PromptService.Draft": "Prompt 草稿及变量定义，更新使用乐观锁。",
    "PromptService.Publish": "发布固定版本时的变更说明和乐观锁版本。",
    "PromptService.Reference": "同一空间中源项目的固定 Prompt 版本引用。",
    "PromptService.Preview": "预览指定 Prompt 版本或草稿时的变量值。",
    "StudioController.Revision": "工作台资源归档或撤销操作的乐观锁版本。",
    "ControlledTransport.Session": "绑定已验证 origin 与网络策略的受控传输会话。",
    "ControlledTransport.Response": "有界响应及其底层资源，消费方负责按契约关闭。",
    "ProtocolSupport.EventConsumer": "逐事件接收解码后的供应商 JSON 数据。",
    "SseFrameReader.Frame": "完成解析的 SSE 帧，保留多行数据与事件语义。",
}
KNOWN = {
    "java.util": "ArrayList Arrays Base64 Collection Collections Comparator Deque ArrayDeque HashMap HashSet Iterator LinkedHashMap LinkedHashSet List Locale Map Objects Optional Set TreeMap TreeSet UUID StringJoiner Spliterator EnumMap EnumSet Random Date".split(),
    "java.nio.file": "Files Path Paths StandardOpenOption StandardCopyOption LinkOption OpenOption FileVisitOption FileSystem FileSystems DirectoryStream".split(),
    "org.springframework.http": "ResponseEntity MediaType HttpStatus HttpStatusCode HttpHeaders HttpMethod ContentDisposition CacheControl".split(),
    "org.springframework.web.bind.annotation": "RestController RestControllerAdvice ControllerAdvice RequestMapping GetMapping PostMapping PutMapping PatchMapping DeleteMapping PathVariable RequestParam RequestHeader RequestBody ResponseStatus ExceptionHandler CookieValue RequestMethod RequestPart ResponseBody ModelAttribute".split(),
}
paths = sorted((ROOT / "backend").glob("*/src/**/*.java"))
for path in paths:
    source = path.read_text(encoding="utf-8")
    package = re.search(r"(?m)^package ([\w.]+);", source).group(1)
    KNOWN.setdefault(package, [])
    KNOWN[package].append(path.stem)


def creation_date(path):
    # Use the earliest recorded creation commit rather than inventing a timestamp.
    dates = subprocess.check_output(
        ["git", "log", "--follow", "--diff-filter=A", "--format=%aI", "--", str(path.relative_to(ROOT))],
        cwd=ROOT, text=True,
    ).splitlines()
    if not dates:
        raise RuntimeError(f"Missing creation history for {path}")
    date = datetime.fromisoformat(dates[-1]).astimezone(timezone(timedelta(hours=8)))
    return f"{date.year}/{date.month}/{date.day} {date:%H:%M}"


def javadoc(old, description, date, indent=""):
    if old:
        inner = old[3:-2].strip()
        if "\n" not in inner:
            lines = [indent + " * " + inner]
        else:
            lines = [indent + " * " + line.strip().lstrip("*").strip() for line in inner.splitlines()]
        lines = [line.rstrip() for line in lines]
    else:
        lines = [indent + " * " + description]
    existing = "\n".join(lines)
    if "@Author" not in existing:
        lines.append(indent + " * @Author Mr Shu")
    if "@Version" not in existing:
        lines.append(indent + " * @Version 1.0.0")
    if "@CreateTime" not in existing:
        lines.append(indent + " * @CreateTime " + date)
    return "/**\n" + "\n".join(lines) + "\n" + indent + " */"


for path in paths:
    source = path.read_text(encoding="utf-8")
    if path.stem == "OpenAiCompatibleAdapter":
        source = source.replace("new java.io.ByteArrayOutputStream()", "new ByteArrayOutputStream()")
        source = source.replace("import java.nio.charset.StandardCharsets;", "import java.io.ByteArrayOutputStream;\nimport java.nio.charset.StandardCharsets;")
    imports = re.compile(r"(?m)^import (static )?([\w.]+)\.\*;$")
    body = re.sub(r"(?m)^(?:package|import)\s+[^;]+;", "", mask(source))
    used = set(re.findall(r"\b[A-Za-z_$][\w$]*\b", body))

    def expand(match):
        static, package = match.groups()
        if static:
            if package != "org.junit.jupiter.api.Assertions":
                raise RuntimeError(f"Unsupported static import {package}")
            names = sorted(set(re.findall(r"\b(assert[A-Z]\w*|fail)\s*\(", body)))
        else:
            if package not in KNOWN:
                raise RuntimeError(f"Unsupported wildcard import {package}")
            names = sorted(set(KNOWN[package]) & used)
        if not names:
            return ""
        return "\n".join(f"import {'static ' if static else ''}{package}.{name};" for name in names)

    source = imports.sub(expand, source)
    date = creation_date(path)
    declaration = TOP.search(source)
    if not declaration or declaration.group(1) != path.stem:
        raise RuntimeError(f"Unable to identify top-level type {path}")
    prefix = source[:declaration.start()]
    comments = list(DOC.finditer(prefix))
    if comments:
        doc = comments[-1]
        source = source[:doc.start()] + javadoc(doc.group(), "", date) + source[doc.end():]
    else:
        if path.stem not in MISSING:
            raise RuntimeError(f"Missing Chinese documentation for {path}")
        last_import = list(re.finditer(r"(?m)^import [^;]+;", prefix))[-1]
        start = last_import.end()
        source = source[:start] + "\n\n" + javadoc(None, MISSING[path.stem], date) + "\n" + source[start:].lstrip("\n")
    # Annotate documented nested contracts without moving or changing their signatures.
    for qualified, description in NESTED.items():
        owner, name = qualified.split(".")
        if owner != path.stem:
            continue
        pattern = re.compile(r"(?m)^(    )(?:(?:public|private|protected|static|final|abstract)\s+)*(?:class|record|interface|enum)\s+" + re.escape(name) + r"\b")
        match = pattern.search(source)
        if not match:
            continue
        before = source[:match.start()]
        prior = re.search(r"(    /\*\*(?:(?!\*/)[\s\S])*\*/)\s*$", before)
        # Do not accidentally select an earlier method's documentation.
        if prior and before[prior.start():].count("/**") == 1 and re.fullmatch(r"\s*/\*\*[\s\S]*?\*/\s*", before[prior.start():]):
            old = prior.group(1)
            start = prior.start() + 4
            source = source[:start] + javadoc(old.strip(), "", date, "    ") + "\n" + source[match.start():]
        else:
            source = source[:match.start()] + "    " + javadoc(None, description, date, "    ") + "\n" + source[match.start():]
    path.write_text(source, encoding="utf-8")
print(f"Prepared {len(paths)} Java source files for the formatter")
