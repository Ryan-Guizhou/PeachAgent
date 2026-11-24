# P1 真实模型验收

此入口与 `runtime-smoke.py` 的本地 fixture 验证不同。真实供应商验证必须由部署者在测试环境配置真实模型、凭证、预算和项目绑定；该脚本不创建或读取模型密钥，不把凭证保存到 JSON、仓库或报告。

## 准备

1. 使用独立测试账号、测试工作空间和项目；启动真实 MySQL、Redis、API 和 Worker，确保本地端口与 API 允许的 origin 一致。
2. 通过工作台配置六类真实模型，绑定项目，确认供应商价格和预算，避免生产数据及费用。LLM 的其他供应商/协议可额外增加模型条目（最多 12 条）。
3. 复制 `vendor-smoke.example.json` 到仓库外的路径，替换 workspaceId、projectId、modelId、vendorKey 和 protocolKey 为实际值。示例 UUID 只是占位，不是可用模型。准备一份含短句的非隐私 WAV 音频（最多 10 MiB）。
4. 登录凭证只通过运行进程环境注入 `PEACHAGENT_SMOKE_EMAIL`、`PEACHAGENT_SMOKE_PASSWORD`。不要将密码、真实 Key、配置文件或原始响应提交 Git。

## 默认离线预检

```bash
python3 backend/qa/vendor-smoke.py --config backend/qa/vendor-smoke.example.json
```

此操作不会联网，也不会产生费用。常规 CI 只执行这一步。

## 显式执行真实模型验收

确认账号、绑定和预算后，从仓库根目录执行：

```bash
python3 backend/qa/vendor-smoke.py --config /path/to/test-models.json --wav /path/to/test-voice.wav --execute
```

PowerShell 使用 `python`，将路径替换为本机文件路径。默认 `http://localhost:8080`；如需其他本地端口，用 `--base` 指定。仅允许 loopback API，不自动重试或跳转；非成功退出码表示存在失败或阻塞，不应直接重跑可能已收费的调用。先根据 runId 查询工作台历史和账本。

## 验收证据

每个模型记录类型、协议、供应商标识、runId、状态和用量/费用来源。成功要求真实 Run 终态、顺序 SSE result/terminal、对应类型结果（媒体需实际下载校验）及唯一成功调用账本一致。报告不会输出账号、密钥、模型输入/输出或供应商原始错误。未知用量/费用保留 UNKNOWN；本脚本不证明硬额度、完整供应商兼容性或故障恢复测试全部通过。

只有执行环境实际连到对应供应商、六类真实用例及规定 LLM 路由均成功后，才可将 #23/#26 的真实供应商验收回填为通过。离线 PLAN_OK 不代表供应商验收通过。
