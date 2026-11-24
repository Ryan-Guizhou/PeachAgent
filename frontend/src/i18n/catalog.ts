import { ApiError } from '../api'

type Translation = readonly [string, string]

/** 系统枚举与固定字段的双语展示；模型标识、扩展字段和用户数据保持原样。 */
const labels: Record<string, Translation> = {
  ACTIVE: ['启用', 'Active'],
  ARCHIVED: ['已归档', 'Archived'],
  REVOKED: ['已撤销', 'Revoked'],
  REDACTED: ['已清除', 'Cleared'],
  DISABLED: ['已停用', 'Disabled'],
  DRAFT: ['草稿', 'Draft'],
  DECLARED: ['已声明', 'Declared'],
  VERIFIED: ['已验证', 'Verified'],
  UNVERIFIED: ['未验证', 'Unverified'],
  STALE: ['待重新验证', 'Revalidation required'],
  QUEUED: ['排队中', 'Queued'],
  RUNNING: ['运行中', 'Running'],
  CANCEL_REQUESTED: ['正在停止', 'Stopping'],
  SUCCEEDED: ['成功', 'Succeeded'],
  FAILED: ['失败', 'Failed'],
  CANCELLED: ['已取消', 'Cancelled'],
  INTERRUPTED: ['已中断', 'Interrupted'],
  PENDING: ['等待中', 'Pending'],
  COMPLETE: ['已完成', 'Complete'],
  ERROR: ['错误', 'Error'],
  PREPARED: ['已准备', 'Prepared'],
  DISPATCHING: ['已派发', 'Dispatching'],
  UNKNOWN: ['未知', 'Unknown'],
  REPORTED: ['供应商报告', 'Reported'],
  ESTIMATED: ['估算', 'Estimated'],
  CHAT: ['模型对话', 'Chat'],
  MODEL_DEBUG: ['模型诊断', 'Model diagnostic'],
  LLM: ['大语言模型', 'LLM'],
  EMBEDDING: ['向量模型', 'Embedding'],
  RERANK: ['重排模型', 'Rerank'],
  IMAGE: ['图像生成', 'Image'],
  STT: ['语音识别', 'Speech to text'],
  TTS: ['语音合成', 'Text to speech'],
  TENANT: ['租户', 'Tenant'],
  WORKSPACE: ['工作空间', 'Workspace'],
  PROJECT: ['项目', 'Project'],
  DAY: ['按日', 'Daily'],
  MONTH: ['按月', 'Monthly'],
  BEARER: ['Bearer 令牌', 'Bearer token'],
  API_KEY: ['API 密钥', 'API key'],
  NONE: ['无认证', 'No authentication'],
  workspace: ['工作空间', 'Workspace'],
  project: ['项目', 'Project'],
  credential: ['凭证', 'Credential'],
  rotate: ['轮换凭证', 'Rotate credential'],
  provider: ['供应商连接', 'Provider connection'],
  model: ['模型', 'Model'],
  prompt: ['提示词', 'Prompt'],
  preview: ['提示词预览', 'Prompt preview'],
  reference: ['版本引用', 'Version reference'],
  plugin: ['插件声明', 'Plugin manifest'],
  budget: ['预算策略', 'Budget policy'],
  debug: ['模型诊断', 'Model diagnostic'],
  status: ['状态', 'Status'],
  delta: ['增量内容', 'Delta'],
  result: ['结果', 'Result'],
  terminal: ['终态', 'Terminal'],
  temperature: ['采样温度', 'Temperature'],
  maxOutputTokens: ['最大输出 Token', 'Maximum output tokens'],
  contextWindow: ['上下文窗口', 'Context window'],
  includeUsage: ['请求用量报告', 'Include usage'],
  completionTokenParameter: ['使用 completion token 参数', 'Use completion token parameter'],
  size: ['尺寸', 'Size'],
  voice: ['音色', 'Voice'],
  topN: ['返回数量', 'Top N'],
  returnDocuments: ['返回文档', 'Return documents'],
  maxCalls: ['周期调用上限', 'Calls per period'],
  maxTokens: ['周期 Token 上限', 'Tokens per period'],
  maxCost: ['周期费用上限', 'Cost per period'],
  maxConcurrency: ['并发上限', 'Concurrency limit'],
  maxRunSeconds: ['单次运行秒数', 'Run duration (seconds)'],
  maxRunTokens: ['单次 Token 上限', 'Tokens per run'],
  maxRunCost: ['单次费用上限', 'Cost per run'],
}

const errors: Record<string, Translation> = {
  SESSION_EXPIRED: ['会话已过期，请重新登录。', 'Session expired. Sign in again.'],
  NOT_FOUND: ['资源不存在或不可访问。', 'Resource not found or unavailable.'],
  CSRF_DENIED: ['安全校验失败，请刷新后重试。', 'Security validation failed. Refresh and try again.'],
  ORIGIN_DENIED: ['请求来源不被允许。', 'Request origin is not allowed.'],
  INVALID_FIELD: ['请检查必填项、格式和长度。', 'Check required fields, format and length.'],
  INVALID_CURSOR: ['分页游标无效，请刷新。', 'Invalid pagination cursor. Refresh the list.'],
  VERSION_CONFLICT: ['资源已更新，请刷新后重试。', 'Resource changed. Refresh and try again.'],
  CONVERSATION_BUSY: ['会话有运行中的任务或不可编辑。', 'Conversation is busy or read-only.'],
  MODEL_NOT_VERIFIED: ['模型需要先通过诊断。', 'Run a model diagnostic first.'],
  MODEL_NOT_BOUND: ['模型尚未绑定到当前项目。', 'Bind the model to this project first.'],
  MODEL_UNAVAILABLE: ['模型或连接已停用。', 'The model or connection is disabled.'],
  MODEL_CONFIG_CHANGED: ['模型配置已变化，请刷新后重试。', 'Model configuration changed. Refresh and try again.'],
  MODEL_CONFIG_INVALID: ['模型协议或配置不符合要求。', 'Invalid model protocol or configuration.'],
  CREDENTIAL_REVOKED: ['凭证已撤销，请重新配置。', 'Credential revoked. Configure a new credential.'],
  CREDENTIAL_CHANGED: ['凭证已变更，请重新验证。', 'Credential changed. Verify again.'],
  CREDENTIAL_SCOPE_MISMATCH: [
    '凭证与连接来源或认证类型不匹配。',
    'Credential origin or authentication type does not match.',
  ],
  CONCURRENCY_LIMIT: ['并发已达到上限。', 'Concurrency limit reached.'],
  BUDGET_UNCERTAIN: [
    '存在未知用量或费用，无法确认可用预算。',
    'Unknown usage or costs prevent confirming the available budget.',
  ],
  BUDGET_EXCEEDED: ['预算已达到上限。', 'Budget limit reached.'],
  QUEUE_FULL: ['任务队列已满，请稍后重试。', 'Run queue is full. Try again later.'],
  CONTEXT_LIMIT: ['本次输入超出模型上下文限制。', 'Input exceeds the model context limit.'],
  INVALID_MANIFEST: ['插件声明或 Schema 无效。', 'Invalid plugin manifest or schema.'],
  MANIFEST_VERSION_EXISTS: ['该插件版本已存在。', 'This plugin version already exists.'],
  INTERNAL_ERROR: ['请求失败，请根据错误码检查服务日志。', 'Request failed. Check service logs using the error code.'],
}
const select = (value: Translation, locale: string) => value[locale === 'en-US' ? 1 : 0]
export function systemLabel(value: unknown, locale: string): string {
  if (value === null || value === undefined) return '—'
  const key = String(value)
  return labels[key] ? select(labels[key], locale) : key
}
export function errorLabel(error: unknown, locale: string): string {
  if (error instanceof ApiError) {
    const message =
      errors[error.code] ||
      (error.status === 401 ? errors.SESSION_EXPIRED : error.status === 404 ? errors.NOT_FOUND : undefined)
    if (message) return select(message, locale) + ' (' + error.code + ')'
    return locale === 'en-US'
      ? (error.message || 'Request failed') + ' (' + error.code + ')'
      : '请求失败，请检查配置或服务日志。 (' + error.code + ')'
  }
  if (error instanceof SyntaxError) return locale === 'en-US' ? 'Invalid JSON format.' : 'JSON 格式无效。'
  if (error instanceof TypeError)
    return locale === 'en-US' ? 'Network request failed. Check the connection.' : '网络请求失败，请检查连接。'
  return error instanceof Error ? error.message : String(error)
}
