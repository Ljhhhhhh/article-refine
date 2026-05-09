# Draft-Revise 架构改造方案

> 日期：2026-05-09
> 状态：已确认

## 一、目标与核心决策

**目标**：让读者不读原文也能最快、最准确地掌握作者想表达的核心内容。

**已确认的决策**：
1. Pass 2（修订）启用 thinking，Pass 1（起草）用 /no_think
2. 保留 `contentType`，用于 Obsidian 目录分类
3. 保留 `knowledgeConnections`，用于长期知识索引
4. 保留 `MockNoteExtractor` 用于测试

---

## 二、最终架构图

```
URL
 ↓
routeLink (正则路由 → LinkType)
 ↓
CompositeFetcher (web / twitter / video)
 ↓ raw HTML / JSON
htmlToMarkdown (Readability → HTML → Markdown)
 ↓ 结构化 Markdown 原文
[若 tokens > 8K] longContentCompressor (按标题切块 → 并行摘要 → 合并)
 ↓
DraftGenerator (Pass 1: /no_think, 生成完整 Markdown 笔记)
 ↓ draft: ProcessedNote
Reviser (Pass 2: thinking, 对照原文修订)
 ↓ revised: ProcessedNote
renderStandardTemplate (只渲染 frontmatter + body + 关联 + 原文链接)
 ↓ Markdown
saveObsidianNote (分类目录 + 原子写入)
```

---

## 三、新 Schema 设计

```typescript
// src/llm/schema.ts

export const contentTypeSchema = z.enum([
  "技术深度", "观点思考", "教程学习", "资讯动态", "综合"
]);

export const processedNoteSchema = z.object({
  title: z.string().min(1),
  contentType: contentTypeSchema.default("综合"),
  tags: z.array(z.string())
    .transform(arr => arr.map(t => t.startsWith("#") ? t : `#${t}`).slice(0, 8))
    .pipe(z.array(z.string()).min(1)),
  knowledgeConnections: z.array(z.string()).default([]),
  body: z.string().min(1),  // Markdown 正文，LLM 自由组织
});

export type ProcessedNote = z.infer<typeof processedNoteSchema>;
export type ContentType = z.infer<typeof contentTypeSchema>;
```

**删除**：`Step1Analysis`、`keyPointSchema`、`technicalAnalysis`、`argumentStructure`、`prerequisites`、`expectedOutcome`、`summary`、`keyPoints` 全部移除。

---

## 四、新文件详细设计

### 4.1 `src/fetchers/html-to-markdown.ts`

职责：把 Readability 返回的 HTML `content` 字段转成 Markdown。

依赖：`turndown` + `turndown-plugin-gfm`（支持表格、代码块语言标注）。

关键处理：
- 代码块保留 `language` 提示（从 `class="language-xxx"` 提取）
- 移除图片（`![]()` 保留为 `[图片：{alt}]` 占位）
- 保留内联 `<code>` 为 `` `code` ``
- 保留 blockquote、表格
- 剥除广告/导航残留（正则白名单）

导出 `htmlToMarkdown(html: string): string`。

### 4.2 修改 `src/fetchers/web-fetcher.ts`

`extractReadableHtml` 改动：
- Readability 得到 `article.content`（HTML 字符串）
- 用 `htmlToMarkdown(article.content)` 替换 `article.textContent`
- 写入 `FetchedContent.rawText` 的是 Markdown

Twitter fetcher 本身已经产出 Markdown（`blockToMarkdown`），无需改动。

### 4.3 `src/llm/long-content-compressor.ts`

职责：当原文 Markdown 超过阈值时，分层压缩。

算法：
1. 按 `^#+\s` 切块（优先 H2，若无则 H1，若无则按 2000 字符硬切）
2. 保留块的标题路径（便于理解上下文）
3. 对每块并行调用 LLM 做"结构保留摘要"（不省略代码/数字）
4. 拼接回完整 Markdown 返回

阈值：原文 > 32000 字符（约 8K tokens）才触发。

接口：
```typescript
compressIfLong(markdown: string, options: { 
  client: OpenAI; 
  model: string; 
  maxChars: number;  // 默认 32000
}): Promise<string>
```

### 4.4 `src/llm/draft-generator.ts`

Pass 1：起草。一次性输出完整 `ProcessedNote`（含 body）。

```typescript
export class DraftGenerator {
  async generate(input: DraftInput): Promise<ProcessedNote> {
    const systemPrompt = DRAFT_PROMPT;
    const userMessage = `
来源：${input.sourceUrl}
${input.title ? `原文标题：${input.title}` : ""}
${input.author ? `作者：${input.author}` : ""}

=== 原文（Markdown 格式）===
${input.rawText}
`;
    const response = await client.chat.completions.create({
      model, max_tokens: 8192,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userMessage }
      ]
    });
    // 去除 <think>，extractJson，schema.parse
  }
}
```

### 4.5 `src/llm/reviser.ts`

Pass 2：修订。启用 thinking。

```typescript
export class Reviser {
  async revise(original: RawContentInput, draft: ProcessedNote): Promise<ProcessedNote> {
    const systemPrompt = REVISE_PROMPT;
    const userMessage = `
=== 原文（Markdown 格式）===
${original.rawText}

=== 当前笔记草稿 ===
${JSON.stringify(draft, null, 2)}

请对照原文审查草稿，输出修订后的完整笔记 JSON。
`;
    const response = await client.chat.completions.create({
      model, max_tokens: 12288,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userMessage }
      ]
      // thinking 通过不加 /no_think 启用
    });
  }
}
```

**关键**：Reviser 的 system prompt 不以 `/no_think` 开头，Qwen3 类模型会启用 thinking。输出时用现有的 `<think>` 正则剥离。

### 4.6 `src/llm/draft-revise-extractor.ts`（替代 two-step-extractor）

```typescript
export class DraftReviseExtractor implements NoteExtractor {
  async extract(input: ExtractNoteInput): Promise<ProcessedNote> {
    this.onProgress?.("preparing");
    const prepared = await compressIfLong(input.rawText, {...});
    
    this.onProgress?.("drafting");
    const draft = await this.draftGenerator.generate({
      sourceUrl: input.sourceUrl,
      title: input.title,
      author: input.author,
      rawText: prepared  // 可能是压缩后的
    });
    
    this.onProgress?.("revising");
    const revised = await this.reviser.revise(
      { rawText: input.rawText },  // 修订时用完整原文，不用压缩版本
      draft
    );
    
    return revised;
  }
}
```

**设计亮点**：Draft 用压缩版本（速度），Revise 用完整原文（抓幻觉/遗漏）。

---

## 五、两个核心 Prompt

### 5.1 `src/llm/prompts/draft-prompt.ts`

```
/no_think
<role>
你是一位高效的阅读代理。你刚读完一篇文章，现在要写一份 Markdown 笔记，
让另一位没读过原文的读者在最短时间内掌握作者想传达的全部核心内容。
</role>

<principles>
忠实于原文：作者说了什么你就传达什么。不添加解读、不评价、不总结你的观点。
跟随原文顺序：原文的论述顺序就是笔记的组织顺序。
保留具体性：数字、版本号、产品名、命令、代码片段、引用原样保留。
信息密度跟随原文：原文详的地方详写，原文一笔带过的地方不要凑字数。
</principles>

<body_writing>
body 是一段 Markdown 正文，由你自由组织。选什么结构由原文决定：
- 技术方案类：可用"问题 → 方案 → 效果"或原文章节
- 论证类：可用"核心主张 → 论据1 → 论据2 → 反驳"
- 教程类：用编号步骤 + 代码块
- 事件类：用"发生了什么 → 关键数字 → 影响"
- 其他：跟着原文的章节结构走

可以使用的 Markdown 元素：
- 二级/三级标题组织段落
- 有序/无序列表呈现要点
- 代码块保留命令和代码（保留语言标记）
- > 引用块标注原文的关键引用或作者的原话
- 粗体强调关键数字或术语

不要使用一级标题（# title 由模板负责）。
body 开头不要写"本文讲了..."这种过渡句，直接进入核心内容。
</body_writing>

<metadata>
title：10-25 字，让读者看标题就能决定要不要读正文。
contentType：从 5 类中选一个最贴切的：技术深度/观点思考/教程学习/资讯动态/综合。
tags：3-8 个以 # 开头的具体标签。避免 #技术 #思考 这类空标签。
knowledgeConnections：这篇文章关联到哪些技术/概念/作者/趋势？3-6 条。
</metadata>

<output>
严格输出一个 JSON 对象，无前言无 markdown 代码块：
{
  "title": "string",
  "contentType": "技术深度|观点思考|教程学习|资讯动态|综合",
  "tags": ["#...", ...],
  "knowledgeConnections": ["...", ...],
  "body": "Markdown 格式的笔记正文，可以包含 \n 换行、标题、列表、代码块"
}
</output>
```

### 5.2 `src/llm/prompts/revise-prompt.ts`

```
<role>
你是一位严格的审稿人。你的任务是对照原文审查一份笔记草稿，找出问题并产出修订版。
你需要认真思考每一项审查点，不要放过任何遗漏或幻觉。
</role>

<review_checklist>
对照原文，逐项审查草稿：

[1] 核心主张保真：作者的核心观点/主张/结论是否在 body 中被准确传达？
    - 若被弱化、中立化或扭曲，修复之。

[2] 具体信息保真：原文的数字、日期、版本号、产品名、引用、代码片段
    - 是否在 body 中出现？
    - 是否被错误改写（例如 "2.1s" 被写成 "约 2 秒"）？
    - 发现错误改写 → 恢复原始精确值。

[3] 幻觉检测：body 里的每个具体陈述，是否都能在原文中找到出处？
    - 无法对应到原文的陈述 → 删除。
    - 合理范围内的概括允许（如把 3 句话缩成 1 句），但不能引入原文没说的事实。

[4] 顺序与结构：body 的组织顺序是否偏离原文逻辑？
    - 轻微重排可接受；严重偏离（把结论放开头、把论据放结论前）需调整。

[5] 标题准确性：title 是否准确反映原文核心？
    - 过于泛化或偏题 → 重写。

[6] 标签与关联：tags 是否都是具体词（非 #综合 #思考 这类空标签）？
    - knowledgeConnections 是否基于原文真实涉及的技术/概念？

[7] 遗漏检测：原文中重要但草稿中缺失的核心内容。
    - 补入 body 合适位置。
</review_checklist>

<revision_rules>
- 发现问题就修复，不要保留错误或留下 TODO。
- 原文没明说的内容不要补，宁可空缺也不要编造。
- 保留草稿已经做对的部分，不要无谓重写。
- 输出完整的修订版 JSON，格式与草稿相同。
</revision_rules>

<output>
严格输出一个 JSON 对象，字段与草稿相同：
{
  "title": "string",
  "contentType": "...",
  "tags": ["#...", ...],
  "knowledgeConnections": ["...", ...],
  "body": "..."
}
</output>
```

### 5.3 `src/llm/prompts/compress-prompt.ts`

```
/no_think
<role>
你是一位内容压缩师。你的任务是对一段长文的一个章节做结构保留摘要。
</role>

<rules>
- 保留章节标题层级
- 保留所有代码块、命令、数字、版本号、产品名
- 保留作者的关键论点和原话引用
- 可以合并冗余段落，省略过渡句和修辞
- 压缩比目标：50%-70%
- 输出 Markdown 格式，与输入格式一致
</rules>

<output>
直接输出压缩后的 Markdown，不要任何前言或解释。
</output>
```

---

## 六、模板极简化

### `src/templates/standard-template.ts`

```typescript
export function renderStandardTemplate(input: RenderStandardTemplateInput): string {
  const { note, sourceUrl, author, createdAt, fetchedAt } = input;
  const lines: string[] = [
    `# ${note.title}`,
    "",
    `> 创建日期：${formatDate(createdAt)}`,
    `> 来源：${sourceUrl}`,
    `> 作者：${author ?? "未知"}`,
    `> 抓取时间：${formatDateTime(fetchedAt)}`,
    `> 标签：${note.tags.join(" ")}`,
    "",
    "---",
    "",
    note.body.trim(),
    "",
    "---",
    ""
  ];

  if (note.knowledgeConnections.length > 0) {
    lines.push("## 知识连接", "");
    note.knowledgeConnections.forEach(c => lines.push(`- ${c}`));
    lines.push("");
  }

  lines.push("## 原文链接", "", sourceUrl, "");
  return lines.join("\n");
}
```

---

## 七、文件变更清单

### 新增（8 个）

| 文件 | 职责 |
|------|------|
| `src/fetchers/html-to-markdown.ts` | HTML → Markdown 转换 |
| `src/llm/draft-generator.ts` | Pass 1 起草 |
| `src/llm/reviser.ts` | Pass 2 修订（thinking） |
| `src/llm/long-content-compressor.ts` | 长文分层压缩 |
| `src/llm/draft-revise-extractor.ts` | 新编排器 |
| `src/llm/prompts/draft-prompt.ts` | Pass 1 prompt |
| `src/llm/prompts/revise-prompt.ts` | Pass 2 prompt |
| `src/llm/prompts/compress-prompt.ts` | 压缩 prompt |

### 修改（8 个）

| 文件 | 变更 |
|------|------|
| `src/llm/schema.ts` | 简化 `ProcessedNote`；移除 `Step1Analysis` |
| `src/llm/note-extractor.ts` | `MockNoteExtractor` 适配新 schema（产出 body） |
| `src/llm/factory.ts` | `createExtractor` 返回 `DraftReviseExtractor`；provider 名改为 `"draft-revise"`，保留 `"two-step"` 作为别名兼容 |
| `src/fetchers/web-fetcher.ts` | 集成 `htmlToMarkdown` |
| `src/templates/standard-template.ts` | 极简化（只渲染元数据 + body + 关联 + 原文） |
| `src/cli/commands/process.ts` | 更新 provider 默认值与 CLI flags（--draft-model / --revise-model） |
| `src/config/schema.ts` | 新增 `draftModel`、`reviseModel`、`longContentThreshold` 字段 |
| `package.json` | 新增 `turndown`、`turndown-plugin-gfm`、`@types/turndown` |

### 删除（10 个）

| 文件 | 原因 |
|------|------|
| `src/llm/step1-analyzer.ts` | 被 draft 吸收 |
| `src/llm/step2-generator.ts` | 被 draft 吸收 |
| `src/llm/two-step-extractor.ts` | 被 draft-revise-extractor 取代 |
| `src/llm/prompts/step1-prompt.ts` | 删除 |
| `src/llm/prompts/step2-tech-deep.ts` | 删除 |
| `src/llm/prompts/step2-opinion.ts` | 删除 |
| `src/llm/prompts/step2-tutorial.ts` | 删除 |
| `src/llm/prompts/step2-news.ts` | 删除 |
| `src/llm/prompts/step2-general.ts` | 删除 |
| `src/llm/prompts/index.ts` | 不再需要 prompt 路由 |

### 测试调整

| 文件 | 变更 |
|------|------|
| `tests/llm/schema.test.ts` | 改测新 schema |
| `tests/llm/step1-analyzer.test.ts` | 删除 |
| `tests/llm/step2-generator.test.ts` | 删除 |
| `tests/llm/two-step-extractor.test.ts` | 改名为 `draft-revise-extractor.test.ts`，测 draft + revise 流程 |
| `tests/llm/prompts.test.ts` | 简化，只测三个 prompt 常量非空 |
| `tests/llm/note-extractor.test.ts` | 更新 mock 输出 |
| `tests/templates/standard-template.test.ts` | 改测极简模板 |
| `tests/core/process-link.test.ts` | 更新 mock extractor 产出 |
| `tests/fetchers/web-fetcher.test.ts` | 新增 Markdown 输出断言 |
| `tests/fetchers/html-to-markdown.test.ts` | 新增 |
| `tests/cli/process-command.test.ts` | 更新 flag 名（--draft-model/--revise-model） |

---

## 八、CLI 用法（变更后）

```bash
# 默认
node dist/cli/index.js process <url>

# 显式
node dist/cli/index.js process <url> \
  --llm-provider draft-revise \
  --draft-model Qwen3-4B-Instruct \
  --revise-model Qwen3-4B-Thinking

# mock
node dist/cli/index.js process <url> --llm-provider mock
```

环境变量：
```
LINK_PROCESSING_LLM_PROVIDER=draft-revise
LINK_PROCESSING_DRAFT_MODEL=...
LINK_PROCESSING_REVISE_MODEL=...
```

保留 `two-step` 作为 `draft-revise` 的别名（向后兼容）。

---

## 九、配置变更

```typescript
// src/config/schema.ts
llm: z.object({
  provider: z.enum(["mock", "draft-revise", "two-step"]).default("draft-revise"),
  model: z.string().default("mock"),
  draftModel: z.string().optional(),
  reviseModel: z.string().optional(),
  baseUrl: z.string().url().optional(),
  apiKey: z.string().optional(),
  longContentThreshold: z.number().int().positive().default(32000)
})
```

`two-step` 在 factory 里被当作 `draft-revise` 处理（输出 deprecation warning）。

---

## 十、执行顺序（分 5 阶段）

**阶段 A：Schema + Mock**
1. 改 `schema.ts`
2. 改 `MockNoteExtractor` 输出新结构
3. 改 `standard-template.ts`
4. 改 `tests/llm/schema.test.ts` 和 `tests/templates/standard-template.test.ts`
5. 跑 typecheck + 相关单测

**阶段 B：Fetcher 升级**
6. 加 `turndown` 依赖
7. 新建 `html-to-markdown.ts`
8. 改 `web-fetcher.ts`
9. 新增和更新测试
10. 跑相关单测

**阶段 C：新 LLM 管线**
11. 新建三个 prompt 文件
12. 新建 `draft-generator.ts`、`reviser.ts`、`long-content-compressor.ts`
13. 新建 `draft-revise-extractor.ts`
14. 改 `factory.ts`
15. 新增单测

**阶段 D：清理旧代码**
16. 删除旧 step1/step2/two-step 代码
17. 删除旧 prompt 文件
18. 删除对应测试
19. 改 `config/schema.ts`
20. 改 CLI command
21. 改 CLI 测试

**阶段 E：验证**
22. `pnpm typecheck`
23. `pnpm test`
24. 手工跑一次 mock process（冒烟测试）
25. 如果有可用 LLM，跑一次真实 URL 端到端验证

---

## 十一、风险与对冲

| 风险 | 对冲 |
|------|------|
| turndown 转换某些网站 HTML 产生脏输出 | 在 `html-to-markdown.ts` 加白名单清理规则；对已知脏 HTML 测试 |
| 修订步骤启用 thinking 导致延迟翻倍 | 设置 Reviser 的 `max_tokens` 上限和超时；允许 CLI 传 `--skip-revise` 跳过 |
| 长文压缩丢失重要信息 | 修订步骤用完整原文（不用压缩版）做对照，兜底 |
| 小模型生成的 body 仍不够忠实 | Pass 2 thinking + 明确的 review_checklist 强制对照 |
| 删除旧代码影响未发现的引用 | 按顺序 typecheck，任何 import 错误会立刻暴露 |

---

## 十二、产出效果对比预期

| 场景 | 改造前 | 改造后 |
|------|--------|--------|
| 技术深度文章 | keyPoints 列表，代码被文字描述替代 | body 内嵌代码块，保留实际命令和配置 |
| 长论证文章 | 被压进 3-7 个 {title, detail} | body 呈现完整论证链，论据原话引用 |
| 教程类 | prerequisites/expectedOutcome 碎片化 | body 按步骤顺序组织，每步含完整命令 |
| 长文（>12K） | 被截断 | 分层压缩后完整处理，修订对照完整原文 |
| 小模型幻觉 | 无检测 | Pass 2 明确对照原文扫描 |
