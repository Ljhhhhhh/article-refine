# 两步 LLM 提取器设计

> 日期：2026-05-09
> 状态：待审核

## 目标

将当前单次 LLM 调用拆分为两步管线，提升内容分析质量和类型化输出效果。

## 当前架构

```
URL → Router → Fetcher → Analyzer(关键词) → Extractor(单次LLM) → Template → Storage
```

问题：
- 单次 LLM 调用既要理解内容又要生成结构化输出，对小模型负担过重
- 一个通用 prompt 无法针对不同内容类型优化
- 关键词分析器（content-analyzer.ts）分类粗糙

## 新架构

```
URL → Router → Fetcher → Step1-Analyzer(LLM) → Step2-Generator(LLM) → Template → Storage
```

移除 `content-analyzer.ts` 和 `tag-generator.ts`，其职责被 Step 1 完全吸收。

## Step 1 — 内容分析

### 输入

`FetchedContent`（rawText, title, author, sourceUrl, linkType）

### 输出

```typescript
const step1AnalysisSchema = z.object({
  contentType: z.enum(["技术深度", "观点思考", "教程学习", "资讯动态", "综合"]),
  title: z.string().min(1),                    // LLM 根据内容生成的标题
  coreArguments: z.array(z.string()).min(1).max(5),  // 作者的核心主张
  keyEntities: z.array(z.string()),            // 关键实体（技术/人名/产品）
  writingStyle: z.string(),                    // 写作风格描述
  targetAudience: z.string(),                  // 目标受众
  quality: z.object({
    informationDensity: z.enum(["high", "medium", "low"]),
    originality: z.enum(["high", "medium", "low"]),
    practicality: z.enum(["high", "medium", "low"]),
  }),
  suggestedTags: z.array(z.string().startsWith("#")).min(2).max(6),
});
```

### Prompt 设计

```text
<role>
你是一位内容分析专家。你的任务是快速理解一篇文章的核心价值，
提取关键分析信息，为后续的结构化笔记生成提供上下文。
</role>

<analysis_process>
按以下步骤分析（在内心完成，不输出思考过程）：
1. 识别内容类型：技术深度/观点思考/教程学习/资讯动态/综合
2. 提取作者的核心主张（原文中的关键论点，不是你的总结）
3. 识别关键实体（技术名词、人名、产品名、概念）
4. 判断写作风格和目标受众
5. 评估内容质量（信息密度、原创性、实用性）
6. 基于内容主题生成 2-6 个标签建议
7. 生成一个准确反映内容核心的标题（10-20字）
</analysis_process>

<output>
严格输出 JSON，格式如下：
{
  "contentType": "技术深度|观点思考|教程学习|资讯动态|综合",
  "title": "根据内容核心生成的标题",
  "coreArguments": ["核心论点1", "核心论点2"],
  "keyEntities": ["实体1", "实体2"],
  "writingStyle": "写作风格描述",
  "targetAudience": "目标受众描述",
  "quality": {
    "informationDensity": "high|medium|low",
    "originality": "high|medium|low",
    "practicality": "high|medium|low"
  },
  "suggestedTags": ["#标签1", "#标签2"]
}
只输出 JSON，不要其他文字。
</output>
```

### 参数

- `max_tokens`: 1024
- 不使用 `response_format: { type: "json_object" }`（兼容小模型）

### 质量门控

无。用户发起的请求始终处理，不做质量筛选。

## Step 2 — 类型化内容生成

### 输入

- `FetchedContent`（原始内容）
- `Step1Analysis`（Step 1 的分析结果）

### Prompt 选择

根据 `Step1Analysis.contentType` 从 5 个专用模板中选择：

```typescript
const STEP2_PROMPTS: Record<ContentType, string> = {
  技术深度: TECH_DEEP_PROMPT,
  观点思考: OPINION_PROMPT,
  教程学习: TUTORIAL_PROMPT,
  资讯动态: NEWS_PROMPT,
  综合: GENERAL_PROMPT,
};
```

### 共享基础结构

```text
<role>
你是一位{角色描述}。你的任务是将网页内容转化为结构化的 Obsidian 链接笔记。
</role>

<context>
以下是内容分析结果：
{Step1Analysis JSON}

以下是原文内容：
{rawText，截断到 12000 字符}
</context>

<field_guidance>
title: 根据内容核心主题生成，要求：
  - 准确反映文章核心内容，而非泛化描述
  - 简洁有力，10-20字
  - 技术类用技术术语，观点类体现立场
  好："RSC 如何将首屏加载从 2.1s 降至 0.8s"
  差："一篇关于 React 的文章"
summary: {类型特定的摘要策略}
keyPoints: {类型特定的要点要求}
tags: 基于 Step1Analysis 的 suggestedTags + 内容中的具体技术/概念
</field_guidance>

<output_format>
严格输出 JSON，符合 ProcessedNote schema。
</output_format>
```

### 各模板差异化指令

#### 技术深度

```text
<role>你是一位高级技术分析师，擅长从技术文章中提取架构决策、实现细节和性能数据。</role>

<field_guidance>
summary: 提取具体技术方案（用了什么、怎么做的、效果如何），
  包含数据指标。读完摘要能判断是否值得精读原文。
keyPoints: 每个要点是一个独立的技术知识点，包含具体的技术名词和效果描述。
  好："使用 tree-shaking 将 bundle 从 500KB 降到 120KB"
  差："文章介绍了性能优化方法"
technicalAnalysis: 必填，从架构、机制、性能、部署四个维度提取。
</field_guidance>
```

#### 观点思考

```text
<role>你是一位思想分析专家，擅长提取文章的核心论点、论据链和思维框架。</role>

<field_guidance>
summary: 提取作者的核心主张和主要论据，保留作者的立场和视角。
keyPoints: 每个要点是作者的一个独立论点及其支撑。
  格式："主张：xxx，论据：xxx"
argumentStructure: 提取核心主张和支撑论据列表。
knowledgeConnections: 关联到相关的思想流派、理论框架或历史案例。
</field_guidance>
```

#### 教程学习

```text
<role>你是一位技术教育专家，擅长从教程中提取可执行的操作步骤和学习路径。</role>

<field_guidance>
summary: 提取教程的最终产出物、前置条件和核心步骤概览。
keyPoints: 每个要点是一个关键操作步骤，包含具体命令或操作。按执行顺序排列。
prerequisites: 列出学习本教程需要的前置知识或环境。
expectedOutcome: 描述完成教程后的预期产出。
knowledgeConnections: 关联到相关的工具、框架和最佳实践。
</field_guidance>
```

#### 资讯动态

```text
<role>你是一位科技资讯分析师，擅长从新闻中提取关键事实、时间线和行业影响。</role>

<field_guidance>
summary: 提取关键事实（谁、什么、何时、影响）。
keyPoints: 每个要点是一个独立的事实信息。
knowledgeConnections: 关联到相关产品、公司、技术趋势。
</field_guidance>
```

#### 综合

```text
<role>你是一位内容分析专家，擅长从各类文章中提取核心信息和独特价值。</role>

<field_guidance>
summary: 提取文章的核心信息和独特价值。
keyPoints: 每个要点包含一个具体信息点。
</field_guidance>
```

### 参数

- `max_tokens`: 4096

## Schema 变更

新增可选字段到 `ProcessedNote`：

```typescript
// 观点思考类特有
argumentStructure: z.object({
  mainClaim: z.string(),
  supportingArguments: z.array(z.string()),
}).nullable().optional(),

// 教程学习类特有
prerequisites: z.array(z.string()).nullable().optional(),
expectedOutcome: z.string().nullable().optional(),
```

## 模板渲染变更

`standard-template.ts` 新增 section：

```typescript
// 观点思考类
if (note.argumentStructure) {
  lines.push("", "## 论点结构", "");
  lines.push(`**核心主张**：${note.argumentStructure.mainClaim}`);
  note.argumentStructure.supportingArguments.forEach((arg) => {
    lines.push(`- ${arg}`);
  });
}

// 教程学习类
if (note.prerequisites?.length) {
  lines.push("", "## 前置条件", "");
  note.prerequisites.forEach((p) => lines.push(`- ${p}`));
}
if (note.expectedOutcome) {
  lines.push("", "## 预期产出", "");
  lines.push(note.expectedOutcome);
}
```

## 文件变更清单

### 新增

| 文件 | 职责 |
|------|------|
| `src/llm/step1-analyzer.ts` | Step 1 LLM 调用 |
| `src/llm/step2-generator.ts` | Step 2 LLM 调用 |
| `src/llm/prompts/step1-prompt.ts` | Step 1 system prompt |
| `src/llm/prompts/step2-tech-deep.ts` | 技术深度 prompt |
| `src/llm/prompts/step2-opinion.ts` | 观点思考 prompt |
| `src/llm/prompts/step2-tutorial.ts` | 教程学习 prompt |
| `src/llm/prompts/step2-news.ts` | 资讯动态 prompt |
| `src/llm/prompts/step2-general.ts` | 综合 prompt |
| `src/llm/prompts/index.ts` | prompt 选择器 |
| `src/llm/two-step-extractor.ts` | 两步编排器 |

### 修改

| 文件 | 变更 |
|------|------|
| `src/llm/note-extractor.ts` | 移除 `analysis` 字段 |
| `src/llm/schema.ts` | 新增 `Step1Analysis`、`argumentStructure`、`prerequisites`、`expectedOutcome` |
| `src/llm/factory.ts` | 创建 `TwoStepExtractor` 替代 `OpenAINoteExtractor` |
| `src/core/process-link.ts` | 移除 `analyzeContent()` 调用 |
| `src/templates/standard-template.ts` | 新增论点结构、前置条件、预期产出 section |
| `src/cli/commands/process.ts` | 新增 `--step1-model`、`--step2-model` 参数 |

### 删除

| 文件 | 原因 |
|------|------|
| `src/analyzer/content-analyzer.ts` | 职责被 Step 1 吸收 |
| `src/analyzer/tag-generator.ts` | 职责被 Step 1 吸收 |
| `src/llm/openai-extractor.ts` | 被 `two-step-extractor.ts` 替代 |

## CLI 用法

```bash
# 默认两步模式，同一模型
node dist/cli/index.js process <url> --llm-provider two-step

# 指定不同模型
node dist/cli/index.js process <url> \
  --llm-provider two-step \
  --step1-model Qwen3.5-4B-OptiQ-4bit \
  --step2-model Qwen3.5-4B-OptiQ-4bit

# mock 模式保留用于测试
node dist/cli/index.js process <url> --llm-provider mock
```

## 环境变量

```env
LINK_PROCESSING_LLM_PROVIDER=two-step
OPENAI_API_KEY=your-key
OPENAI_BASE_URL=http://127.0.0.1:11435/v1
# 可选：分别指定 step1/step2 模型
LINK_PROCESSING_STEP1_MODEL=Qwen3.5-4B-OptiQ-4bit
LINK_PROCESSING_STEP2_MODEL=Qwen3.5-4B-OptiQ-4bit
```

## 测试策略

1. 单元测试：`extractJson()` 边界情况（thinking 文本、嵌套 JSON、纯 JSON）
2. 单元测试：prompt 选择器对 5 种 contentType 的路由
3. 单元测试：`Step1Analysis` schema 验证
4. 集成测试：mock extractor 验证管线端到端
5. 端到端测试：真实 LLM 测试 weekly.tw93.fun 和 x.com URL
