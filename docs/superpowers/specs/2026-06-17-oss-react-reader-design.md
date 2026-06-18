# OSS React Reader P0 Design

> 日期：2026-06-17
> 状态：待确认

## 1. 目标

实现一个 React 阅读网站，让读者可以浏览并阅读 `lpa` CLI 生成、保存到 OSS 的 Markdown 文章。

P0 的核心闭环是：

```text
lpa process <url>
  -> 上传 Markdown 到 OSS
  -> 更新公开文章索引
  -> React 站点读取索引
  -> 用户打开文章详情页阅读 Markdown
```

设计原则：

- 数据契约先行：阅读站只消费稳定的公开索引，不直接理解 CLI 的去重索引细节。
- 公开阅读优先：P0 不做登录、权限、签名 URL 和私有文章。
- 静态部署优先：React 站点应能部署到任意静态托管服务。
- 最小可用：先解决“能发现、能打开、能读”，搜索、评论、后台和运营能力后置。

## 2. 当前状态

项目已有 OSS 存储能力：

- Markdown 对象路径：`<OSS_PREFIX>/文章摘要/<内容类型>/<YYYY-MM-DD-title>.md`
- OSS-only 模式会写入：`<OSS_PREFIX>/source-index.json`
- `source-index.json` 当前用于原始链接去重和更新。
- Markdown 文件包含 YAML frontmatter。

相关模块：

- `src/core/process-link.ts`
- `src/storage/oss-key.ts`
- `src/storage/source-index.ts`
- `src/templates/standard-template.ts`

现有 `SourceIndexEntry`：

```ts
type SourceIndexEntry = {
  sourceUrl: string;
  normalizedSourceUrl: string;
  urlHash: string;
  path: string;
  title: string;
  contentType: ContentTypeDirectory;
  updatedAt: string;
};
```

Markdown frontmatter：

```yaml
title: string
source_url: string
author: string
content_type: string
created: YYYY-MM-DD
fetched: YYYY-MM-DD HH:mm
tags: string[]
clickbait_index: number
```

## 3. 决策

新增一个面向阅读站的公开索引，不直接把 `source-index.json` 作为网站长期数据契约。

原因：

- `source-index.json` 的主职责是去重，不是内容展示。
- 它包含 `urlHash`、`normalizedSourceUrl` 等内部字段，阅读站不需要。
- 后续文章发布状态、摘要、封面、排序、RSS、sitemap 都应围绕公开索引演进。
- 保留 `source-index.json` 可以避免影响现有 CLI 去重逻辑。

公开索引对象路径：

```text
<OSS_PREFIX>/public-index.json
```

P0 允许 `public-index.json` 字段少，但结构必须可扩展。

## 4. 公开索引契约

```ts
type PublicArticleIndex = {
  version: 1;
  generatedAt: string;
  articles: PublicArticleEntry[];
};

type PublicArticleEntry = {
  slug: string;
  title: string;
  path: string;
  contentType: "技术深度" | "观点思考" | "教程学习" | "资讯动态" | "综合";
  created: string;
  updatedAt: string;
  tags: string[];
  author?: string;
  sourceUrl: string;
};
```

示例：

```json
{
  "version": 1,
  "generatedAt": "2026-06-17T00:00:00.000Z",
  "articles": [
    {
      "slug": "2026-06-17-agent-engineering",
      "title": "Agent 工程文章",
      "path": "notes/文章摘要/综合/2026-06-17-Agent 工程文章.md",
      "contentType": "综合",
      "created": "2026-06-17",
      "updatedAt": "2026-06-17T00:00:00.000Z",
      "tags": ["AI", "工程"],
      "author": "未知",
      "sourceUrl": "https://example.com/article"
    }
  ]
}
```

字段规则：

- `slug`：由文件名派生，移除 `.md`，做 URL-safe 编码前的稳定标识。
- `path`：OSS 对象 key，不是完整 HTTPS URL。
- `created`：优先取 Markdown frontmatter 的 `created`，取不到时用 `updatedAt.slice(0, 10)`。
- `tags`：优先取 Markdown frontmatter 的 `tags`，取不到时为空数组。
- `articles`：按 `updatedAt` 倒序写入，便于前端直接展示。

## 5. OSS 访问模型

P0 假设文章公开可读。

React 站点需要配置：

```ts
type ReaderRuntimeConfig = {
  ossBaseUrl: string;
  indexPath: string;
};
```

示例：

```text
VITE_OSS_BASE_URL=https://bucket.example.com
VITE_OSS_INDEX_PATH=notes/public-index.json
```

前端拼接规则：

```text
indexUrl = `${ossBaseUrl}/${indexPath}`
articleUrl = `${ossBaseUrl}/${entry.path}`
```

OSS 必须允许浏览器读取：

- `GET public-index.json`
- `GET *.md`
- `Content-Type: application/json`
- `Content-Type: text/markdown; charset=utf-8`
- CORS 允许阅读站域名。

P0 不处理：

- 私有 bucket
- 临时签名 URL
- 防盗链
- 用户级权限

## 6. React 站点范围

推荐技术栈：

- React
- Vite
- React Router
- `react-markdown`
- `remark-gfm`
- `gray-matter` 或等价 frontmatter parser
- 轻量代码高亮库，P0 可延后

页面：

```text
/
  文章列表

/articles/:slug
  文章详情

*
  404
```

首页能力：

- 拉取公开索引。
- 按更新时间倒序展示文章。
- 展示标题、分类、日期、标签。
- 加载中、空列表、加载失败状态。

详情页能力：

- 根据 `slug` 在公开索引中找到文章。
- 拉取 Markdown。
- 解析 frontmatter。
- 渲染正文 Markdown。
- 展示标题、作者、日期、标签、来源链接。
- 图片自适应宽度。
- 代码块横向滚动。
- 外链新窗口打开。

## 7. CLI 改动范围

新增 `public-index` 存储模块，避免污染 `source-index`：

```text
src/storage/public-index.ts
```

职责：

- 从 OSS 读取 `<prefix>/public-index.json`。
- upsert 当前文章 entry。
- 写回排序后的公开索引。

在 OSS-only 上传成功后更新公开索引：

```text
processOssOnly()
  -> upload markdown
  -> upsertSourceIndexEntryInOss()
  -> upsertPublicArticleIndexInOss()
```

mirror 模式有两个可选方向：

1. P0 只支持 OSS-only 作为阅读站发布模式。
2. mirror 模式上传成功后也更新 OSS `public-index.json`。

建议 P0 选择方向 2，因为用户当前描述是“生成的 md 文章会通过 OSS 保存”，不应强迫必须使用 OSS-only。

## 8. 任务拆分

### Task 1：公开索引数据层

改动：

- 新增 `src/storage/public-index.ts`
- 新增单元测试 `tests/storage/public-index.test.ts`

验证：

- 空索引读取返回 `{ version: 1, articles: [] }`
- upsert 同 slug 文章会覆盖旧 entry
- 写回后按 `updatedAt` 倒序排序

### Task 2：处理流程写入公开索引

改动：

- 在 `src/core/process-link.ts` 的 OSS 上传成功路径更新 `public-index.json`
- mirror 和 only 两种模式都覆盖

验证：

- OSS-only 成功上传后写入 `source-index.json` 和 `public-index.json`
- mirror 成功上传后写入 `public-index.json`
- OSS 上传失败时不更新公开索引

### Task 3：React 阅读站骨架

建议目录：

```text
apps/reader/
```

能力：

- Vite React 项目
- 读取 `VITE_OSS_BASE_URL`
- 读取 `VITE_OSS_INDEX_PATH`
- 首页列表
- 详情页路由

验证：

- 使用 fixture index 和 Markdown 能本地打开列表与详情。
- 桌面和移动端基础布局不破。

### Task 4：Markdown 渲染

能力：

- frontmatter 解析
- GFM 表格、列表、引用、代码块
- 图片响应式
- 外链安全属性

验证：

- 标准模板生成的 Markdown 可正确渲染。
- 代码块、表格、图片不会撑破页面。

### Task 5：部署与配置文档

改动：

- README 增加阅读站配置说明。
- 增加 OSS CORS 配置检查清单。

验证：

- 新用户能根据文档配置 OSS base URL 和 index path。

## 9. 非目标

P0 不做：

- 登录和权限
- 评论
- 点赞
- 管理后台
- 全文搜索
- RSS
- sitemap
- 阅读统计
- 私有 OSS 读取
- 服务端渲染

这些能力等阅读闭环稳定后再进入 P1/P2。

## 10. 验收标准

功能验收：

- 使用 `lpa process <url>` 成功上传文章后，OSS 出现 Markdown 文件。
- OSS 出现或更新 `public-index.json`。
- React 首页能显示该文章。
- 点击文章后能打开详情页并渲染 Markdown。
- 直接访问不存在的 slug 显示 404。

工程验收：

- 新增数据层有单元测试。
- 现有 `source-index` 行为不被破坏。
- `pnpm test` 通过。
- `pnpm typecheck` 通过。

产品验收：

- 首页能在 3 秒内展示文章列表。
- 移动端正文阅读不需要横向滚动。
- OSS 403/404/网络失败时有明确错误态。

## 11. 待确认问题

1. 阅读站是否只服务公开文章？
2. `apps/reader` 是否可以作为 monorepo 子应用加入当前仓库？
3. 是否接受 P0 用 Vite SPA，而不是 Next.js/SSR？
4. 是否需要 mirror 模式也自动更新 `public-index.json`？
5. 文章 URL 是否使用 slug：`/articles/:slug`，还是直接使用 encoded path？

推荐默认答案：

- 公开文章：是。
- 子应用：是。
- Vite SPA：是。
- mirror 模式更新公开索引：是。
- URL 使用 slug：是。
