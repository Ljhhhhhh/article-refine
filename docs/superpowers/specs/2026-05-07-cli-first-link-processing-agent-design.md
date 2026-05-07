# CLI-first LinkProcessingAgent MVP Design

> 日期：2026-05-07
> 状态：已确认设计方向，待实现计划
> 参考文档：`docs/LinkProcessingAgent开发框架完整技术文档.md`

## 1. 目标

LinkProcessingAgent MVP 要把原技术文档中的链接处理能力落成一个可运行的 TypeScript CLI 工具。它的核心体验是：用户或其他 AI Agent 提供 URL，系统完成链接识别、内容抓取、内容分析、结构化提炼、Markdown 渲染，并保存到 Obsidian 知识库。

设计原则：

- 调用对 AI 友好：CLI 参数稳定，`--json` 输出固定 schema，日志不污染 stdout，错误码稳定。
- 输出对人类友好：默认 CLI 输出简洁摘要，保存到 Obsidian 的 Markdown 笔记按原文档模板组织，适合直接阅读。
- Obsidian 保存不可降级：`process` 命令成功的定义是 Markdown 已写入 Obsidian，并返回保存路径。
- 确定性流程优先：URL 路由、抓取、清洗、质量基础判断、文件命名、写入和错误处理由代码确定性完成；LLM 只负责人类阅读质量相关的提炼与组织。

## 2. 范围

MVP 包含：

- Node.js + TypeScript CLI 工程。
- URL 路由：微信公众号、Twitter/X、技术博客、视频、学术论文、产品文档、通用网页。
- 抓取策略链：普通 HTTP 抓取、Readability 正文抽取、Cheerio 清理、Twitter/X API 解析；Playwright 作为微信和 JS 页面 fallback 的接口预留。
- 内容分析：内容类型、质量等级、标签建议、字数和基本元数据。
- LLM 结构化提炼：标题、核心信息、关键要点、技术深度解析、知识连接、质量评估。
- Obsidian Markdown 保存：目录结构、命名、去重、防覆盖、标签。
- CLI JSON 输出、人类摘要输出、稳定错误码。
- Vitest 单元测试和 fixture-based 流程测试。

MVP 不包含：

- Hono API 服务。
- BullMQ/Redis 后台队列。
- 飞书、数据库、远程 API 保存后端。
- Obsidian 标签索引、作者索引、时间线索引的完整自动更新。
- 视频字幕下载和学术 PDF 深度解析。
- 多用户权限系统。

这些能力可以在 CLI 核心闭环稳定后接入，不能阻塞 MVP。

## 3. 推荐技术栈

- Runtime：Node.js 24 LTS。
- Language：TypeScript。
- CLI：Commander 或 Clipanion，优先选择 Commander 以降低 MVP 复杂度。
- Schema validation：Zod。
- HTML parsing：Cheerio。
- Article extraction：`@mozilla/readability` + JSDOM。
- Markdown rendering：自定义模板渲染函数，必要时使用 `gray-matter` 写 front matter。
- LLM：Vercel AI SDK 或 OpenAI SDK，经由 `llm` 适配层封装，避免业务层绑定供应商。
- Tests：Vitest。
- Package manager：pnpm。
- Build/dev：tsx + tsup。

## 4. 架构

系统采用 CLI-first 单体工程，内部拆成核心库和适配器。

```text
CLI command
  -> config loader
  -> URL router
  -> fetcher chain
  -> content normalizer
  -> analyzer
  -> LLM structured extractor
  -> template renderer
  -> Obsidian storage adapter
  -> result presenter
```

模块边界：

- `cli`：解析命令参数，选择人类输出或 JSON 输出，设置 exit code。
- `config`：加载和校验本地配置，包括 Obsidian vault 路径和处理阈值。
- `router`：识别链接类型并选择抓取策略。
- `fetchers`：实现不同来源的内容抓取和 fallback。
- `normalizer`：把 HTML、Twitter/X JSON、metadata-only 内容统一成内部内容结构。
- `analyzer`：做确定性分类、质量基础判断和标签建议。
- `llm`：接收上下文并产出结构化笔记对象，输出必须通过 Zod。
- `templates`：把结构化笔记渲染成原文档第五章风格的 Markdown。
- `storage/obsidian`：创建目录、生成文件名、防覆盖、原子写入。
- `presenters`：输出人类摘要或 AI JSON。
- `errors`：定义稳定错误码、retryable 信息和 exit code 映射。

核心逻辑不依赖 CLI，这样未来可以复用到 API、队列 worker 或 MCP 工具。

## 5. CLI 协议

MVP 命令：

```bash
link-processing process <url>
link-processing process <url> --json
link-processing route <url> --json
link-processing inspect <url> --json
link-processing config init
link-processing config check
```

### 5.1 `process`

完整执行链接处理并保存到 Obsidian。

成功条件：

1. URL 通过校验并完成路由。
2. 内容抓取成功。
3. 内容超过最低阈值，默认 `300` 字符。
4. LLM 输出通过 Zod schema。
5. Markdown 渲染成功。
6. Obsidian 文件写入成功。

默认人类输出：

```text
Link processed and saved

Title: AI 提炼标题
Type: 技术深度
Quality: 强烈推荐
Saved: /Users/me/Obsidian/文章摘要/技术深度/2026-05-07-ai-title.md
Tags: #技术深度 #AI编程 #链接笔记
```

JSON 输出：

```json
{
  "ok": true,
  "command": "process",
  "sourceUrl": "https://example.com/article",
  "linkType": "tech_blog",
  "contentType": "技术深度",
  "title": "AI 提炼标题",
  "quality": {
    "informationDensity": "high",
    "originality": "medium",
    "practicality": "high",
    "recommendedSave": "strong"
  },
  "obsidian": {
    "saved": true,
    "path": "/Users/me/Obsidian/文章摘要/技术深度/2026-05-07-ai-title.md",
    "tags": ["#技术深度", "#AI编程", "#链接笔记"]
  }
}
```

### 5.2 `route`

只识别链接类型和推荐策略，不抓取，不写文件。该命令用于 AI Agent 在处理前探测行为。

示例输出：

```json
{
  "ok": true,
  "command": "route",
  "sourceUrl": "https://x.com/user/status/123",
  "linkType": "twitter",
  "strategy": {
    "primary": "twitter_api",
    "fallback": "web_fetch",
    "requiresFormatting": true
  }
}
```

### 5.3 `inspect`

抓取并分析基础内容，不调用 LLM，不保存 Obsidian。用于调试抓取质量。

示例输出：

```json
{
  "ok": true,
  "command": "inspect",
  "sourceUrl": "https://example.com/article",
  "linkType": "tech_blog",
  "title": "Original title",
  "author": "Author name",
  "wordCount": 1840,
  "contentType": "技术深度",
  "recommendedTags": ["#技术深度", "#AI编程", "#链接笔记"]
}
```

### 5.4 stdout/stderr 规则

- `--json` 模式下 stdout 只输出 JSON。
- 日志、debug、重试信息全部输出到 stderr。
- 默认模式下 stdout 输出给人类读的摘要。
- 成功 exit code 为 `0`。
- 失败 exit code 为非 `0`，由错误类型映射。

## 6. 数据结构

```ts
type LinkType =
  | "weixin"
  | "twitter"
  | "tech_blog"
  | "video"
  | "academic"
  | "docs"
  | "general";

type ContentType =
  | "技术深度"
  | "观点思考"
  | "教程学习"
  | "资讯动态"
  | "综合";

type QualityLevel = "high" | "medium" | "low";
type RecommendedSave = "strong" | "normal" | "reference";

type RoutedLink = {
  sourceUrl: string;
  linkType: LinkType;
  strategy: FetchStrategyConfig;
};

type FetchedContent = {
  sourceUrl: string;
  title?: string;
  author?: string;
  publishedAt?: string;
  rawText: string;
  rawHtml?: string;
  metadata: Record<string, unknown>;
};

type ProcessedNote = {
  title: string;
  contentType: ContentType;
  summary: string;
  keyPoints: string[];
  technicalAnalysis?: {
    architecture?: string;
    mechanism?: string;
    performance?: string;
    deployment?: string;
  };
  knowledgeConnections: string[];
  quality: {
    informationDensity: QualityLevel;
    originality: QualityLevel;
    practicality: QualityLevel;
    recommendedSave: RecommendedSave;
  };
  tags: string[];
  markdown: string;
};

type SavedNote = {
  saved: true;
  path: string;
  filename: string;
  tags: string[];
};
```

所有进入 CLI JSON 输出的对象必须有对应 Zod schema。LLM 输出必须先通过 Zod 校验，再进入模板渲染。

## 7. URL 路由与抓取策略

链接类型：

- `weixin`：`mp.weixin.qq.com`
- `twitter`：`x.com`、`twitter.com`
- `video`：`bilibili.com`、`youtube.com`、`douyin.com`
- `academic`：`arxiv.org`、`doi.org`
- `docs`：常见文档路径和域名特征，例如 `/docs/`、`readme`、官方文档域名。
- `tech_blog`：`.dev`、`.blog`、`medium.com`、`substack.com` 等。
- `general`：未命中特征的通用网页。

MVP 抓取策略：

```text
tech_blog/general/docs:
  web_fetch -> readability -> cheerio cleanup

twitter:
  fxtwitter API -> tweet/article parser -> web_fetch fallback

weixin:
  web_fetch -> readability
  Playwright fallback interface retained but not required for first implementation

video:
  metadata only

academic:
  web_fetch -> readability
```

抓取成功的最低标准：

- `rawText` 非空。
- 默认文本长度不少于 `300` 字符；视频 metadata-only 可低于该阈值，但必须被标记为 `video`。
- 标题缺失时可由 LLM 生成标题，但 `sourceUrl` 必须保留。

## 8. LLM 处理

LLM 不参与 URL 路由、文件命名和写入决策。LLM 只处理面向人类阅读的内容提炼。

输入上下文：

- 原始 URL。
- 链接类型。
- 抓取到的标题、作者、发布时间。
- 清洗后的正文。
- 确定性分析结果。
- 目标输出模板说明。

输出必须包含：

- AI 提炼标题。
- 内容类型。
- 核心信息。
- 3 到 7 个关键要点。
- 技术内容的技术深度解析。
- 知识连接建议。
- 质量评估。
- 推荐标签。

LLM 失败处理：

- 如果输出 JSON 无法通过 Zod，使用同一上下文进行一次 repair。
- repair 后仍失败，返回 `LLM_OUTPUT_INVALID`。
- 不保存半成品 Markdown。

## 9. Obsidian 保存

保存结构必须保持原文档第六章一致：

```text
obsidian_vault/
├── 文章摘要/
│   ├── 技术深度/
│   ├── 观点思考/
│   ├── 资讯动态/
│   ├── 教程学习/
│   └── 综合/
├── 标签索引/
├── 作者索引/
└── 时间线/
```

MVP 必须创建和使用 `文章摘要/<内容类型>/`。`标签索引`、`作者索引`、`时间线` 目录可由 `config init` 或首次保存时创建，但 MVP 不自动维护索引内容。

文件命名：

```text
YYYY-MM-DD-简化标题.md
```

命名规则：

- 移除文件系统非法字符：`< > : " / \ | ? *` 和控制字符。
- 移除常见前缀：`转载`、`翻译`、`分享`、`推荐`。
- 移除常见转载尾缀。
- 标题最多保留 80 个字符。
- 移除结尾中文标点。
- 已存在时追加 ` (1)`、` (2)`，不覆盖旧文件。
- 写入采用临时文件加 rename，避免半写入。

标签规则：

- 必须包含内容类型标签，例如 `#技术深度`。
- 必须包含 `#链接笔记`。
- 主题标签最多 3 个。
- 总标签最多 6 个。
- 标签必须写入 Markdown 头部，并在 JSON 输出中返回。

## 10. Markdown 模板

MVP 默认使用原文档第五章的标准模板。详细模板在内容长度和质量评分都足够高时可作为后续增强。

标准模板结构：

```markdown
# [AI提炼标题]

> 创建日期：[YYYY-MM-DD]
> 来源：[原始URL]
> 作者：[如可获取]
> 抓取时间：[YYYY-MM-DD HH:mm]
> 标签：#[类型标签] #[主题标签1] #[主题标签2] #链接笔记

---

## 核心信息

[1-2句话直接重写原文最核心的信息]

## 关键要点

1. **要点标题**：详细说明

## 技术深度解析（技术类内容）

- **架构设计**：[架构核心原则和组件]
- **实现机制**：[关键实现技术和算法]
- **性能考量**：[性能优化和权衡]
- **部署实践**：[实际部署建议和注意事项]

## 知识连接

- **关联主题**：[相关主题名称]
- **补充说明**：[如何扩展或应用于其他场景]
- **对比分析**：[与其他类似方法/工具的对比]

## 外部资源

- **原文链接**：[原始URL]

---

## 质量评估

> **信息密度**：高/中/低
> **原创性**：高/中/低
> **实用性**：高/中/低
> **推荐保存**：强烈推荐 / 一般推荐 / 仅作参考
```

如果内容不是技术类，`技术深度解析` 部分不渲染。

## 11. 错误处理

稳定错误码：

- `INVALID_URL`：URL 格式非法。
- `UNSUPPORTED_URL`：URL 可解析但当前没有可用策略。
- `FETCH_FAILED`：所有抓取策略失败。
- `CONTENT_TOO_SHORT`：抓取成功但内容低于阈值。
- `LLM_OUTPUT_INVALID`：LLM 输出无法通过 schema 校验。
- `OBSIDIAN_CONFIG_MISSING`：未配置 vault 路径。
- `OBSIDIAN_WRITE_FAILED`：写入 Obsidian 失败。
- `UNKNOWN_ERROR`：未分类错误。

失败 JSON：

```json
{
  "ok": false,
  "command": "process",
  "sourceUrl": "https://example.com/article",
  "error": {
    "code": "FETCH_FAILED",
    "message": "All fetch strategies failed for the URL.",
    "retryable": true
  }
}
```

错误码到 exit code：

- `INVALID_URL`、`UNSUPPORTED_URL`：`2`
- `FETCH_FAILED`、`CONTENT_TOO_SHORT`：`3`
- `LLM_OUTPUT_INVALID`：`4`
- `OBSIDIAN_CONFIG_MISSING`、`OBSIDIAN_WRITE_FAILED`：`5`
- `UNKNOWN_ERROR`：`1`

## 12. 配置

配置文件建议为 `link-processing.config.yaml`，也允许通过 CLI 参数覆盖关键项。

```yaml
obsidian:
  vaultPath: "/Users/me/Obsidian"
  categories:
    technology: "技术深度"
    opinion: "观点思考"
    news: "资讯动态"
    tutorial: "教程学习"
    general: "综合"

processing:
  qualityThreshold: 300
  defaultFormat: "standard"
  timeoutSeconds: 120
  retryCount: 3

llm:
  provider: "openai"
  model: "gpt-5.4"

logging:
  level: "info"
```

`config check` 必须验证：

- 配置文件可读取。
- Obsidian vault 路径存在或可创建。
- `文章摘要` 分类目录可创建。
- LLM provider 所需环境变量存在。

## 13. 测试策略

测试遵循 TDD。实现任何行为前先写失败测试。

必测范围：

- `LinkRouter`：不同 URL 映射到正确 `linkType` 和策略。
- `FileNamingSystem`：非法字符、长标题、重复文件名。
- `TagGenerator`：类型标签、固定标签、主题标签数量限制。
- `TemplateRenderer`：标准模板字段完整，非技术内容不渲染技术解析。
- `CliPresenter`：默认人类输出和 `--json` 输出内容一致但格式不同。
- `ProcessCommand`：使用 mock fetcher 和 mock LLM，验证成功时一定写入 Obsidian。
- 错误路径：抓取失败、内容太短、LLM schema 错、Obsidian 写失败。

测试 fixture：

- `fixtures/html/tech-blog.html`
- `fixtures/html/general-article.html`
- `fixtures/twitter/article.json`
- `fixtures/twitter/tweet.json`
- `fixtures/expected/standard-note.md`

## 14. 文件结构建议

```text
package.json
pnpm-lock.yaml
tsconfig.json
vitest.config.ts
src/
  cli/
    index.ts
    commands/
      process.ts
      route.ts
      inspect.ts
      config.ts
    presenters/
      human.ts
      json.ts
  config/
    load-config.ts
    schema.ts
  core/
    process-link.ts
    route-link.ts
    inspect-link.ts
  router/
    link-router.ts
    types.ts
  fetchers/
    fetcher.ts
    web-fetcher.ts
    twitter-fetcher.ts
    composite-fetcher.ts
  analyzer/
    content-analyzer.ts
    tag-generator.ts
  llm/
    note-extractor.ts
    schema.ts
  templates/
    standard-template.ts
  storage/
    obsidian-storage.ts
    file-naming.ts
  errors/
    errors.ts
    exit-codes.ts
tests/
  router/
  storage/
  templates/
  cli/
  fixtures/
```

每个文件只承担一个清晰职责，避免把 CLI、抓取、LLM 和保存逻辑写在同一个模块里。

## 15. 实施顺序

1. 初始化 TypeScript 工程和测试框架。
2. 写 URL 路由测试并实现 `route` 命令。
3. 写文件命名、标签生成、Obsidian 保存测试并实现保存层。
4. 写模板渲染测试并实现标准模板。
5. 写抓取 fixture 测试并实现 web 和 Twitter 抓取器。
6. 写 LLM schema 测试和 mock extractor。
7. 串联 `process` 主流程，先用 mock LLM 跑通保存闭环。
8. 接入真实 LLM provider。
9. 完成 CLI 人类输出、JSON 输出和错误码。
10. 补 `inspect` 和 `config` 命令。

## 16. 验收标准

MVP 完成时必须满足：

- `link-processing route <url> --json` 返回稳定 JSON。
- `link-processing inspect <url> --json` 能抓取并返回基础分析。
- `link-processing process <url>` 输出人类可读摘要。
- `link-processing process <url> --json` 输出稳定 JSON。
- `process` 成功时一定在 Obsidian vault 下生成 Markdown 文件。
- Markdown 文件符合原文档第五章标准模板。
- 保存目录和文件命名符合原文档第六章要求。
- 失败时不写半成品文件，并返回稳定错误码。
- 所有核心模块有 Vitest 覆盖。

