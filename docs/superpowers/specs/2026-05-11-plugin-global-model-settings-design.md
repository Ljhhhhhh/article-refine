# 插件全局模型配置设计

> 日期：2026-05-11
> 状态：待审核

## 1. 目标

让 Chrome 插件可以配置后端服务的全局 LLM 模型设置，并在保存后立即生效。后续通过 popup、右键菜单、快捷键触发的所有链接处理任务都使用新的模型配置。

本次设计同时解决三个问题：

- 插件 options 页缺少模型选择和模型参数配置。
- 当前配置和文案偏 OpenAI，不利于硅基流动、OpenRouter 等 OpenAI-compatible 供应商。
- popup 只能保存当前页或右键链接，缺少手动输入单个 URL 后解析总结的入口。

## 2. 当前状态

后端已经有基础 LLM 配置字段：

- `llm.provider`
- `llm.model`
- `llm.draftModel`
- `llm.reviseModel`
- `llm.baseUrl`
- `llm.apiKey`
- `llm.longContentThreshold`

但这些字段只能通过配置文件、环境变量或 CLI 参数进入服务。Chrome 插件当前只保存以下本地设置：

- `serverUrl`
- `token`
- `duplicatePolicy`
- `ossEnabled`

HTTP API 的 `/v1/process` 只接收 `url`、`duplicatePolicy`、`oss`，所以插件无法修改全局模型，也不应该在每次处理请求里传模型覆盖。

## 3. 决策

采用后端全局设置 API。插件 options 页作为服务端全局配置面板，保存后由后端热更新运行时配置。

```text
Chrome options
  -> GET /v1/settings
  -> PUT /v1/settings
  -> Agent 校验新配置并重建 extractor
  -> 后续 process 请求使用新 extractor
```

不采用 popup 单次覆盖模型。popup 保持轻量，只新增手动 URL 输入和保存入口。

## 4. 配置模型

将“处理策略”和“模型供应商”分开：

```yaml
llm:
  provider: draft-revise
  modelProvider: siliconflow
  model: Qwen/Qwen3-32B
  draftModel: Qwen/Qwen3-32B
  reviseModel: deepseek-ai/DeepSeek-R1
  baseUrl: https://api.siliconflow.cn/v1
  apiKey: sk-...
  longContentThreshold: 32000
```

字段含义：

- `provider`：笔记生成管线。继续支持 `mock`、`draft-revise`、`two-step`、`openai`，其中 `openai` 和 `two-step` 仍作为兼容别名归一到 `draft-revise`。
- `modelProvider`：模型供应商 profile。新增枚举 `siliconflow`、`openrouter`、`custom-openai-compatible`。
- `model`：默认模型。`draftModel` 或 `reviseModel` 为空时回退到该模型。
- `draftModel`：起草阶段模型。
- `reviseModel`：修订阶段模型。
- `baseUrl`：OpenAI-compatible API base URL。
- `apiKey`：供应商 API Key。
- `longContentThreshold`：进入长文压缩前的字符阈值。

旧配置兼容：

- 没有 `modelProvider` 时，根据 `baseUrl` 推断；无法推断时用 `custom-openai-compatible`。
- 已有 `OPENAI_API_KEY`、`OPENAI_BASE_URL` 环境变量继续有效。
- 后续可新增更中性的环境变量，如 `LINK_PROCESSING_LLM_API_KEY`、`LINK_PROCESSING_LLM_BASE_URL`，优先级高于旧 OpenAI 命名。

## 5. 内置供应商 Profile

### SiliconFlow

- 默认 `baseUrl`: `https://api.siliconflow.cn/v1`
- 认证：Bearer API Key
- 模型示例：使用供应商模型 ID，例如 `Qwen/Qwen3-32B` 或 `deepseek-ai/DeepSeek-R1`
- 参考：SiliconFlow 官方文档示例使用 OpenAI SDK，并设置 `base_url` 为 `https://api.siliconflow.cn/v1`。

### OpenRouter

- 默认 `baseUrl`: `https://openrouter.ai/api/v1`
- 认证：Bearer API Key
- 模型示例：`openai/gpt-5.2`、`anthropic/claude-sonnet-4` 等 OpenRouter 模型 ID
- 可选 headers：后续可支持 `HTTP-Referer`、`X-OpenRouter-Title`。本次先不暴露，避免扩大配置面。
- 参考：OpenRouter 官方 Quickstart 支持直接把 OpenAI SDK 的 `baseURL` 指向 `https://openrouter.ai/api/v1`。

### Custom OpenAI-compatible

- 默认 `baseUrl`: 空
- 用户必须手填 `baseUrl`、`apiKey`、`model`
- 适用于本地 vLLM、Ollama OpenAI shim、公司内网网关或其他兼容服务。

## 6. HTTP API

新增：

```text
GET /v1/settings
PUT /v1/settings
```

两个接口都应通过现有 Bearer Token 认证。`GET /v1/healthz` 仍保持无需认证。

### GET /v1/settings

返回当前运行时设置。敏感字段不返回明文。

```json
{
  "ok": true,
  "settings": {
    "llm": {
      "provider": "draft-revise",
      "modelProvider": "siliconflow",
      "model": "Qwen/Qwen3-32B",
      "draftModel": "Qwen/Qwen3-32B",
      "reviseModel": "deepseek-ai/DeepSeek-R1",
      "baseUrl": "https://api.siliconflow.cn/v1",
      "apiKeyConfigured": true,
      "longContentThreshold": 32000
    }
  },
  "persistence": {
    "loadedConfigFile": true,
    "configPath": "link-processing.config.yaml",
    "canPersist": true
  }
}
```

### PUT /v1/settings

只允许更新明确支持的全局设置。第一版只接收 `llm`。

```json
{
  "llm": {
    "provider": "draft-revise",
    "modelProvider": "openrouter",
    "model": "openai/gpt-5.2",
    "draftModel": "",
    "reviseModel": "",
    "baseUrl": "https://openrouter.ai/api/v1",
    "apiKey": "sk-or-...",
    "longContentThreshold": 32000
  }
}
```

响应：

```json
{
  "ok": true,
  "settings": {
    "llm": {
      "provider": "draft-revise",
      "modelProvider": "openrouter",
      "model": "openai/gpt-5.2",
      "draftModel": null,
      "reviseModel": null,
      "baseUrl": "https://openrouter.ai/api/v1",
      "apiKeyConfigured": true,
      "longContentThreshold": 32000
    }
  },
  "persistence": {
    "persisted": true,
    "configPath": "link-processing.config.yaml"
  }
}
```

API Key 更新规则：

- `apiKey` 为非空字符串：替换当前 API Key。
- `apiKey` 为空字符串或未传：保留已有 API Key。
- 增加 `clearApiKey: true` 时才清空 API Key。
- 如果已有 API Key 只来自环境变量，且本次请求没有显式传入新的 `apiKey`，写回配置文件时不把环境变量里的密钥落盘。

Dry run：

- `PUT /v1/settings?dryRun=1` 只做 schema 校验、必填项检查和 extractor 构造检查。
- dry run 不替换运行时配置，也不写回配置文件。
- dry run 不调用真实 LLM，因此只能验证本地配置形态，不能证明 API Key 或模型名一定可用。

错误：

- 400 `INVALID_OPTIONS`：字段格式错误、缺少必填项、URL 非法。
- 401 `UNAUTHORIZED`：Token 缺失或错误。
- 500 `SETTINGS_UPDATE_FAILED`：配置写回失败，运行时配置保持旧值。

## 7. 热更新机制

`createAgent()` 内部从不可变局部变量改为运行时状态：

```ts
let runtimeConfig = resolved.config;
let extractor = createExtractor(runtimeConfig.llm);
```

新增 Agent 方法：

- `getSettings()`
- `updateSettings(patch)`

`updateSettings()` 顺序：

1. 合并旧配置和 patch。
2. 用 `configSchema` 校验。
3. 尝试创建新 extractor。
4. 如果是 dry run，返回脱敏后的预览设置，不替换运行时状态。
5. 如果加载自配置文件，则先写回 `link-processing.config.yaml`。
6. 写回成功后，一次性替换 `runtimeConfig` 和 `extractor`。
7. 返回脱敏后的新设置。

如果配置文件写回失败，`runtimeConfig` 和 `extractor` 都保持旧值，避免 UI 显示失败但服务实际已经切换。

正在执行中的任务继续使用任务开始时捕获的 extractor；后续任务使用新 extractor。这样避免任务中途切模型。

## 8. 持久化策略

如果服务启动时加载了配置文件：

- `PUT /v1/settings` 成功后写回同一个 `configPath`。
- 只修改 `llm` 字段，保留其他配置字段。

如果服务只靠环境变量或 CLI override 启动：

- 运行时立即生效。
- 返回 `persisted: false`。
- options 页显示简短提示：当前服务会话已生效，重启后需要配置文件或环境变量保留设置。

不会从 Chrome 插件直接写本地文件。所有持久化都由本地后端服务完成。

## 9. Options 页

新增 sidebar 导航项：`模型配置`，放在 `服务器连接` 之后。

表单字段：

- 供应商：`SiliconFlow`、`OpenRouter`、`自定义兼容接口`
- API Key：密码输入框，支持显示/隐藏；已配置时显示脱敏状态
- Base URL：选择供应商后填入默认值，允许手动覆盖
- 默认模型：必填
- 起草模型：可选，为空时使用默认模型
- 修订模型：可选，为空时使用默认模型
- 长文压缩阈值：数字输入，默认 `32000`

操作：

- `保存设置`：调用 `PUT /v1/settings`，成功后提示是否已持久化。
- `测试模型配置`：调用 `PUT /v1/settings?dryRun=1`，确认字段、必填项和 extractor 构造可通过；不保存、不热更新。

UI 约束：

- 沿用现有 options 页的工具型布局、sidebar 和 card 样式。
- 标签始终可见，错误提示放在字段下方。
- API Key 不回显明文。
- `Base URL`、模型名等长文本不能溢出容器。

## 10. Popup 手动 URL

popup 保持轻量，只新增单个 URL 输入区：

```text
当前页
[保存当前页]

手动链接
[ https://example.com/article ]
[保存该链接]
```

行为：

- 当前页不是 `http/https` 时，只禁用当前页保存按钮，不禁用整个 popup。
- 手动输入只接受单个 `http/https` URL。
- 手动保存仍通过 background service worker 调用 `chrome.runtime.sendMessage({ type: "save", url, overrides })`。
- popup 关闭后任务继续由 service worker 完成。
- 无效 URL 在 popup 内显示错误，不发送给后端。

## 11. 安全与隐私

- Settings API 必须走现有 Bearer Token 认证。
- API Key 只保存在本地服务配置或运行时内存中，不保存到 Chrome storage。
- `GET /v1/settings` 永不返回明文 API Key。
- 插件端不记录 API Key 到 console。
- 非本地服务地址仍沿用现有 options 页安全提示，建议配置 Token。

## 12. 测试

后端：

- `configSchema` 支持 `modelProvider` 并兼容旧配置。
- `resolveProcessConfig` 支持新的中性环境变量，并继续支持 `OPENAI_API_KEY`、`OPENAI_BASE_URL`。
- `createExtractor` 对 SiliconFlow/OpenRouter/custom 都走 OpenAI-compatible 路径。
- `GET /v1/settings` 返回脱敏配置。
- `PUT /v1/settings` 校验、热更新和持久化行为正确。
- `PUT /v1/settings` 的空 API Key 保留旧值，`clearApiKey` 才清空。
- settings 接口受 Bearer Token 保护。

插件：

- `api.js` 增加 `getServiceSettings()`、`updateServiceSettings()`。
- options 页能读取、编辑、保存模型配置。
- 切换供应商会设置对应默认 `baseUrl`，但不覆盖用户已手动修改的自定义 URL。
- popup 手动 URL 有效时可发送保存消息。
- popup 手动 URL 无效时显示本地错误且不发送消息。

回归：

- 现有 popup 保存当前页、context menu 保存页面、context menu 保存链接、快捷键保存当前页继续可用。
- 现有 CLI `process`、`serve`、`doctor` 不因新增字段改变默认行为。

## 13. 非目标

- 不做多 profile 管理。
- 不做 per-request 模型覆盖。
- 不在 popup 里展示模型选择。
- 不在第一版实现模型列表自动拉取。
- 不在第一版实现 OpenRouter attribution headers 的 UI。
- 不在第一版迁移掉旧 `OPENAI_*` 环境变量命名。

## 14. 实施顺序建议

1. 扩展 config schema 和 LLM profile 类型。
2. 重构 Agent 为可热更新运行时状态。
3. 增加 settings API 和测试。
4. 增加配置文件写回逻辑和脱敏序列化。
5. 扩展插件 `api.js`。
6. 更新 options 页模型配置 UI。
7. 更新 popup 手动 URL UI。
8. 补齐 README 中第三方供应商配置说明。

## 15. 参考

- SiliconFlow OpenAI-compatible 示例：`https://docs.siliconflow.cn/cn/usercases/use-siliconcloud-in-KiloCode`
- OpenRouter OpenAI SDK Quickstart：`https://openrouter.ai/docs/quickstart`
