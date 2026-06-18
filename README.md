# 观（Guan）

面向 Obsidian 的链接处理 CLI。输入一个 URL 或本地 Markdown 文件，Guan 会抓取/读取内容、生成结构化笔记，并保存到 Obsidian vault；也可以同步到 S3 兼容对象存储，供内置 Reader 网站展示。

当前项目只保留两个入口：

- CLI / TUI：处理链接、生成笔记、维护索引。
- Reader 网站：读取 OSS 上的 `public-index.json` 和 Markdown 文章并渲染。

## Quickstart

```bash
pnpm install
pnpm build
pnpm dev -- config init --vault /path/to/obsidian-vault
pnpm dev -- doctor
pnpm dev -- process https://example.com/article --llm-provider mock
```

`mock` 只适合冒烟测试。真实生成笔记时，复制 `.env.example` 并配置 OpenAI 兼容接口：

```bash
cp .env.example .env
```

最小配置：

```bash
LINK_PROCESSING_VAULT=/path/to/obsidian-vault
LINK_PROCESSING_LLM_PROVIDER=draft-revise
LINK_PROCESSING_LLM_MODEL=Qwen3.5-4B-OptiQ-4bit
OPENAI_API_KEY=your-key
OPENAI_BASE_URL=http://127.0.0.1:11435/v1
```

## CLI

开发模式：

```bash
pnpm dev -- process https://example.com/article
pnpm dev -- process ./article.md
```

构建后运行：

```bash
pnpm build
node dist/cli/index.js process https://example.com/article
```

全局注册后运行：

```bash
pnpm link --global
link-processing process https://example.com/article
lpa https://example.com/article
```

常用命令：

```bash
link-processing route <url> --json
link-processing inspect <url> --json
link-processing process <url-or-md-file>
link-processing process <url-or-md-file> --json
link-processing process <url-or-md-file> --skip-existing
link-processing process <url-or-md-file> --update-existing
link-processing process <url-or-md-file> --no-oss
link-processing config init --vault /path/to/vault
link-processing config check
link-processing doctor
link-processing reader sync-index
```

`process` 常用选项：

- `--vault <path>`：覆盖 Obsidian vault 路径。
- `--llm-provider <provider>`：`mock`、`draft-revise` 或 `two-step`。
- `--llm-model <model>`：同时作为 draft/revise 的默认模型。
- `--draft-model <model>`：Pass 1 起草模型。
- `--revise-model <model>`：Pass 2 修订模型。
- `--llm-base-url <url>`：OpenAI 兼容接口地址。
- `--config <path>`：配置文件路径，默认 `link-processing.config.yaml`。
- `--skip-existing`：source URL 已存在时跳过。
- `--update-existing`：source URL 已存在时覆盖原笔记。
- `--json`：输出机器可读 JSON。

## TUI

构建并全局注册后，可以从任意目录启动终端 UI：

```bash
pnpm build
pnpm link --global
lpa
lpa https://mp.weixin.qq.com/s/example
link-processing tui https://example.com/article
```

快捷键：

- `Enter`：提交输入的 URL。
- `r`：重试当前 URL。
- `q` 或 `Esc`：退出。

TUI 复用 `process` 的配置解析逻辑，包括 `.env`、`link-processing.config.yaml`、`LINK_PROCESSING_*`、`OPENAI_*` 和 `OSS_*`。

## 配置优先级

`process` 按以下顺序解析配置：

1. CLI flags，例如 `--vault`、`--llm-provider`、`--llm-model`。
2. 环境变量，例如 `LINK_PROCESSING_VAULT`、`OPENAI_API_KEY`。
3. `link-processing.config.yaml`。
4. 内置默认值。

## 支持的链接类型

| Link type | Status | Process support | Notes |
|-----------|--------|-----------------|-------|
| Twitter/X | stable | yes | 使用 fxtwitter JSON 解析。 |
| Technical blog | stable | yes | 使用 HTTP fetch、Readability 和 Markdown 转换。 |
| General article | stable | yes | 适合 article-like HTML 页面。 |
| Docs | stable | yes | 支持静态文档页，不做站点爬取。 |
| WeChat | beta | yes | HTTP 提取可用；未实现 Playwright fallback。 |
| Academic | beta | yes | HTML 页面可能可用；未实现 PDF 解析。 |
| Video | route-only | no | 未实现元数据和转录提取。 |

## Obsidian 输出

笔记默认保存到：

```text
文章摘要/<内容类型>/<YYYY-MM-DD-title>.md
```

每篇笔记包含 YAML frontmatter、来源信息、生成后的 Markdown 正文、知识连接和原始 URL。

本地去重索引位于 vault 内：

```text
.link-processing/source-index.json
```

去重策略：

```bash
link-processing process <url> --skip-existing
link-processing process <url> --update-existing
```

## OSS / S3 兼容对象存储

配置 `OSS_*` 后，`process` 会把生成的笔记同步到对象存储。支持 AWS S3、阿里云 OSS S3 兼容接口、MinIO、Cloudflare R2、腾讯 COS、七牛 Kodo 等 S3 兼容服务。

最小环境变量：

```bash
OSS_ENDPOINT=https://s3.oss-cn-hangzhou.aliyuncs.com
OSS_REGION=cn-hangzhou
OSS_BUCKET=your-bucket
OSS_ACCESS_KEY_ID=your-access-key
OSS_SECRET_ACCESS_KEY=your-secret-key
```

可选环境变量：

```bash
OSS_PREFIX=link-processing/
OSS_FORCE_PATH_STYLE=false
OSS_MODE=mirror
OSS_STRICT=false
```

上传路径：

```text
<OSS_PREFIX>/文章摘要/<内容类型>/<YYYY-MM-DD-title>.md
```

索引文件：

```text
<OSS_PREFIX>/source-index.json   # source URL 去重
<OSS_PREFIX>/public-index.json   # Reader 网站文章列表
```

模式：

- `OSS_MODE=mirror`：先保存到 Obsidian，再同步到 OSS。
- `OSS_MODE=only`：只上传到 OSS，不要求配置 Obsidian vault。
- `--no-oss`：单次运行禁用 OSS 同步。
- `OSS_STRICT=true`：OSS 上传失败时让本次 `process` 失败。

从已有 OSS Markdown 重建 Reader 索引：

```bash
pnpm dev -- reader sync-index
pnpm dev -- reader sync-index --json
```

`public-index.json` 更新会在单个运行进程内串行化。如果多台机器或多个 CLI 进程同时发布到同一个 OSS prefix，建议串行发布，或发布后重新执行 `reader sync-index`。

## Reader 网站

`apps/reader/` 是一个静态 React 网站，用于展示 OSS 上的 Markdown 文章。它读取 `public-index.json`，渲染文章列表，并按 `articles[].path` 加载 Markdown 正文。

本地预览：

```bash
pnpm reader:dev
```

默认访问：

```text
http://127.0.0.1:5173/
```

生产构建：

```bash
pnpm reader:build
```

输出目录：

```text
dist/reader
```

Reader 运行时配置：

```bash
VITE_OSS_BASE_URL=https://bucket.example.com
VITE_OSS_INDEX_PATH=notes/public-index.json
```

如果省略 `VITE_OSS_BASE_URL`，Reader 会使用当前站点 origin。这个模式适合把 `public-index.json` 和 Markdown 文章部署在 Reader 同域名下。

OSS/CDN 要求：

- `public-index.json` 可以公开读取。
- `articles[].path` 指向的 Markdown 对象可以公开读取。
- CORS 允许 Reader 域名发起 `GET`。
- `public-index.json` 使用 `application/json`。
- Markdown 使用 `text/markdown; charset=utf-8` 或其他可读文本类型。
- CDN 对 `public-index.json` 的缓存 TTL 要短，或发布后主动 purge。
- 静态托管需要把 `/articles/*` fallback 到 `index.html`，否则直接刷新文章页可能返回 404。

## 开发

常用检查：

```bash
pnpm build
pnpm typecheck
pnpm test
```

项目结构：

```text
src/                 CLI、核心处理流程、fetcher、LLM、storage
src/cli/             link-processing 和 lpa 入口
apps/reader/         React Reader 网站
tests/               Vitest 测试
docs/                历史设计文档和部署说明
```

## Troubleshooting

运行诊断：

```bash
link-processing doctor
link-processing doctor --json
```

`doctor` 会检查配置加载、vault 可写性、provider 设置、API key 是否存在，以及当前支持的链接能力。

常见处理方式：

- 配置未生效：先运行 `link-processing config check --json`，确认最终解析出的路径和模型。
- LLM 连接失败：确认 `OPENAI_BASE_URL` 是 OpenAI 兼容 `/v1` 地址，且 `OPENAI_API_KEY` 已配置。
- 重复链接未重新处理：使用 `--update-existing`，或删除 vault 内 `.link-processing/source-index.json` 中对应条目。
- OSS 上传失败但本地成功：默认是 best-effort；需要失败即中断时设置 `OSS_STRICT=true`。
