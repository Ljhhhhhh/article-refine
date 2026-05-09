# Two-Step LLM Extractor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the single-call LLM extractor with a two-step pipeline (Step 1: content analysis, Step 2: type-specific generation) to improve output quality, especially for small models.

**Architecture:** Step 1 LLM call analyzes content and outputs structured metadata (contentType, core arguments, key entities, quality assessment). Step 2 uses this analysis to select one of 5 specialized prompt templates and generate the final ProcessedNote. Both steps use the same OpenAI-compatible API endpoint.

**Tech Stack:** TypeScript, Vitest, Zod, OpenAI SDK

---

## File Structure

### New Files

| File | Responsibility |
|------|---------------|
| `src/llm/prompts/step1-prompt.ts` | Step 1 system prompt constant |
| `src/llm/prompts/step2-tech-deep.ts` | 技术深度 prompt template |
| `src/llm/prompts/step2-opinion.ts` | 观点思考 prompt template |
| `src/llm/prompts/step2-tutorial.ts` | 教程学习 prompt template |
| `src/llm/prompts/step2-news.ts` | 资讯动态 prompt template |
| `src/llm/prompts/step2-general.ts` | 综合 prompt template |
| `src/llm/prompts/index.ts` | Prompt selector: `getStep2Prompt(contentType)` |
| `src/llm/step1-analyzer.ts` | Step 1 LLM call: `Step1Analyzer.analyze()` |
| `src/llm/step2-generator.ts` | Step 2 LLM call: `Step2Generator.generate()` |
| `src/llm/two-step-extractor.ts` | Orchestrator: `TwoStepExtractor.extract()` |
| `tests/llm/step1-analyzer.test.ts` | Step 1 unit tests |
| `tests/llm/step2-generator.test.ts` | Step 2 unit tests |
| `tests/llm/two-step-extractor.test.ts` | Orchestrator unit tests |
| `tests/llm/prompts.test.ts` | Prompt selector tests |

### Modified Files

| File | Change |
|------|--------|
| `src/llm/schema.ts` | Add `step1AnalysisSchema`, `argumentStructure`, `prerequisites`, `expectedOutcome` |
| `src/llm/note-extractor.ts` | Remove `analysis` from `ExtractNoteInput` |
| `src/llm/factory.ts` | Add `two-step` provider, create `TwoStepExtractor` |
| `src/core/process-link.ts` | Remove `analyzeContent()` call |
| `src/templates/standard-template.ts` | Render `argumentStructure`, `prerequisites`, `expectedOutcome` |
| `src/cli/commands/process.ts` | Add `--step1-model`, `--step2-model` options |
| `tests/llm/schema.test.ts` | Add tests for new schema fields |
| `tests/llm/note-extractor.test.ts` | Update MockNoteExtractor tests |
| `tests/llm/openai-extractor.test.ts` | Remove (replaced by two-step tests) |
| `tests/core/process-link.test.ts` | Update to use new ExtractNoteInput |
| `tests/templates/standard-template.test.ts` | Add tests for new sections |

### Deleted Files

| File | Reason |
|------|--------|
| `src/analyzer/content-analyzer.ts` | Replaced by Step 1 |
| `src/analyzer/tag-generator.ts` | Replaced by Step 1 |
| `src/llm/openai-extractor.ts` | Replaced by two-step-extractor.ts |
| `tests/analyzer/tag-generator.test.ts` | Replaced by Step 1 |
| `tests/llm/openai-extractor.test.ts` | Replaced by two-step tests |

---

### Task 1: Schema — Add Step1Analysis and new ProcessedNote fields

**Files:**
- Modify: `src/llm/schema.ts`
- Modify: `tests/llm/schema.test.ts`

- [ ] **Step 1: Write failing tests for new schema fields**

```typescript
// tests/llm/schema.test.ts — append to existing file

import { step1AnalysisSchema } from "../../src/llm/schema.js";

describe("step1AnalysisSchema", () => {
  test("accepts a valid step1 analysis", () => {
    const parsed = step1AnalysisSchema.parse({
      contentType: "技术深度",
      title: "RSC 性能优化实践",
      coreArguments: ["RSC 减少 JS bundle 大小", "服务端渲染组件树"],
      keyEntities: ["React", "Server Components", "Next.js"],
      writingStyle: "技术教程",
      targetAudience: "前端开发者",
      quality: {
        informationDensity: "high",
        originality: "medium",
        practicality: "high"
      },
      suggestedTags: ["#React", "#RSC", "#性能优化"]
    });
    expect(parsed.contentType).toBe("技术深度");
    expect(parsed.coreArguments).toHaveLength(2);
  });

  test("rejects empty coreArguments", () => {
    expect(() =>
      step1AnalysisSchema.parse({
        contentType: "综合",
        title: "标题",
        coreArguments: [],
        keyEntities: [],
        writingStyle: "风格",
        targetAudience: "受众",
        quality: { informationDensity: "low", originality: "low", practicality: "low" },
        suggestedTags: ["#综合", "#链接笔记"]
      })
    ).toThrow();
  });
});

describe("processedNoteSchema with new optional fields", () => {
  test("accepts argumentStructure for opinion content", () => {
    const parsed = processedNoteSchema.parse({
      title: "AI 是否会取代程序员",
      contentType: "观点思考",
      summary: "作者认为 AI 不会完全取代程序员，但会改变工作方式。",
      keyPoints: [
        { title: "观点一", detail: "说明一。" },
        { title: "观点二", detail: "说明二。" },
        { title: "观点三", detail: "说明三。" }
      ],
      argumentStructure: {
        mainClaim: "AI 不会取代程序员",
        supportingArguments: ["创造性问题解决不可自动化", "需求理解需要人类判断"]
      },
      knowledgeConnections: ["AI 编程"],
      quality: { informationDensity: "medium", originality: "high", practicality: "medium", recommendedSave: "normal" },
      tags: ["#观点思考", "#AI"]
    });
    expect(parsed.argumentStructure?.mainClaim).toBe("AI 不会取代程序员");
  });

  test("accepts prerequisites and expectedOutcome for tutorial content", () => {
    const parsed = processedNoteSchema.parse({
      title: "从零搭建 Next.js 项目",
      contentType: "教程学习",
      summary: "教程介绍如何从零开始搭建 Next.js 项目。",
      keyPoints: [
        { title: "步骤一", detail: "说明一。" },
        { title: "步骤二", detail: "说明二。" },
        { title: "步骤三", detail: "说明三。" }
      ],
      prerequisites: ["Node.js 18+", "基础 React 知识"],
      expectedOutcome: "一个可运行的 Next.js 项目",
      knowledgeConnections: ["Next.js"],
      quality: { informationDensity: "high", originality: "low", practicality: "high", recommendedSave: "normal" },
      tags: ["#Next.js", "#教程"]
    });
    expect(parsed.prerequisites).toContain("Node.js 18+");
    expect(parsed.expectedOutcome).toBe("一个可运行的 Next.js 项目");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/llm/schema.test.ts`
Expected: FAIL — `step1AnalysisSchema` not exported, `argumentStructure`/`prerequisites`/`expectedOutcome` not in schema

- [ ] **Step 3: Implement schema changes**

```typescript
// src/llm/schema.ts — full file replacement

import { z } from "zod";

export const contentTypeSchema = z.enum(["技术深度", "观点思考", "教程学习", "资讯动态", "综合"]);
export const qualityLevelSchema = z.enum(["high", "medium", "low"]);
export const recommendedSaveSchema = z.enum(["strong", "normal", "reference"]);

// Step 1 analysis output
export const step1AnalysisSchema = z.object({
  contentType: contentTypeSchema,
  title: z.string().min(1),
  coreArguments: z.array(z.string()).min(1).max(5),
  keyEntities: z.array(z.string()),
  writingStyle: z.string(),
  targetAudience: z.string(),
  quality: z.object({
    informationDensity: qualityLevelSchema,
    originality: qualityLevelSchema,
    practicality: qualityLevelSchema,
  }),
  suggestedTags: z.array(z.string().startsWith("#")).min(2).max(6),
});

export type Step1Analysis = z.infer<typeof step1AnalysisSchema>;

// Final processed note
export const processedNoteSchema = z.object({
  title: z.string().min(1),
  contentType: contentTypeSchema,
  summary: z.string().min(1),
  keyPoints: z
    .array(
      z.object({
        title: z.string().min(1),
        detail: z.string().min(1)
      })
    )
    .min(3)
    .max(7),
  technicalAnalysis: z
    .object({
      architecture: z.string().optional(),
      mechanism: z.string().optional(),
      performance: z.string().optional(),
      deployment: z.string().optional()
    })
    .nullable()
    .optional(),
  argumentStructure: z
    .object({
      mainClaim: z.string(),
      supportingArguments: z.array(z.string())
    })
    .nullable()
    .optional(),
  prerequisites: z.array(z.string()).nullable().optional(),
  expectedOutcome: z.string().nullable().optional(),
  knowledgeConnections: z.array(z.string()).default([]),
  quality: z.object({
    informationDensity: qualityLevelSchema,
    originality: qualityLevelSchema,
    practicality: qualityLevelSchema,
    recommendedSave: recommendedSaveSchema
  }),
  tags: z.array(z.string().startsWith("#")).min(2).max(6)
});

export type ProcessedNote = z.infer<typeof processedNoteSchema>;
export type ContentType = z.infer<typeof contentTypeSchema>;
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/llm/schema.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/llm/schema.ts tests/llm/schema.test.ts
git commit -m "feat: add Step1Analysis schema and new ProcessedNote optional fields"
```

---

### Task 2: Step 1 Prompt

**Files:**
- Create: `src/llm/prompts/step1-prompt.ts`

- [ ] **Step 1: Create Step 1 prompt file**

```typescript
// src/llm/prompts/step1-prompt.ts

export const STEP1_PROMPT = `<role>
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

<title_generation>
标题要求：
- 准确反映文章核心内容，而非泛化描述
- 简洁有力，10-20字
- 技术类用技术术语，观点类体现立场
好："RSC 如何将首屏加载从 2.1s 降至 0.8s"
差："一篇关于 React 的文章"
</title_generation>

<quality_assessment>
信息密度评估：
- high: 包含具体数据、代码、案例、可执行步骤
- medium: 有明确观点但缺乏数据支撑
- low: 泛泛而谈，无新增实质性信息

原创性评估：
- high: 有独特见解、新方法或新数据
- medium: 对已有信息的整理和归纳
- low: 纯转述或重复已有信息

实用性评估：
- high: 读者可直接应用（代码、步骤、决策依据）
- medium: 有参考价值但需适配
- low: 仅作了解，无直接应用价值
</quality_assessment>

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
</output>`;
```

- [ ] **Step 2: Commit**

```bash
git add src/llm/prompts/step1-prompt.ts
git commit -m "feat: add Step 1 analysis prompt"
```

---

### Task 3: Step 2 Prompts — 5 type-specific templates

**Files:**
- Create: `src/llm/prompts/step2-tech-deep.ts`
- Create: `src/llm/prompts/step2-opinion.ts`
- Create: `src/llm/prompts/step2-tutorial.ts`
- Create: `src/llm/prompts/step2-news.ts`
- Create: `src/llm/prompts/step2-general.ts`
- Create: `src/llm/prompts/index.ts`
- Create: `tests/llm/prompts.test.ts`

- [ ] **Step 1: Write failing test for prompt selector**

```typescript
// tests/llm/prompts.test.ts

import { describe, expect, test } from "vitest";
import { getStep2Prompt } from "../../src/llm/prompts/index.js";

describe("getStep2Prompt", () => {
  test("returns tech deep prompt for 技术深度", () => {
    const prompt = getStep2Prompt("技术深度");
    expect(prompt).toContain("技术分析师");
    expect(prompt).toContain("technicalAnalysis");
  });

  test("returns opinion prompt for 观点思考", () => {
    const prompt = getStep2Prompt("观点思考");
    expect(prompt).toContain("思想分析");
    expect(prompt).toContain("argumentStructure");
  });

  test("returns tutorial prompt for 教程学习", () => {
    const prompt = getStep2Prompt("教程学习");
    expect(prompt).toContain("技术教育");
    expect(prompt).toContain("prerequisites");
  });

  test("returns news prompt for 资讯动态", () => {
    const prompt = getStep2Prompt("资讯动态");
    expect(prompt).toContain("资讯分析师");
  });

  test("returns general prompt for 综合", () => {
    const prompt = getStep2Prompt("综合");
    expect(prompt).toContain("内容分析");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/llm/prompts.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Create all 5 prompt files and selector**

```typescript
// src/llm/prompts/step2-tech-deep.ts
export const STEP2_TECH_DEEP = `<role>
你是一位高级技术分析师，擅长从技术文章中提取架构决策、实现细节和性能数据。
你的任务是将网页内容转化为结构化的 Obsidian 链接笔记，帮助开发者建立可检索的个人知识库。
</role>

<field_guidance>
title: 根据内容核心主题生成，要求准确反映核心技术点，10-20字。
summary: 提取具体技术方案（用了什么、怎么做的、效果如何），包含数据指标。读完摘要能判断是否值得精读原文。
keyPoints: 每个要点是一个独立的技术知识点，包含具体的技术名词和效果描述。
  好："使用 tree-shaking 将 bundle 从 500KB 降到 120KB"
  差："文章介绍了性能优化方法"
technicalAnalysis: 必填，从架构、机制、性能、部署四个维度提取。
tags: 基于分析结果的 suggestedTags + 内容中的具体技术/概念。
knowledgeConnections: 关联到相关的技术框架、设计模式或工程实践。
</field_guidance>`;
```

```typescript
// src/llm/prompts/step2-opinion.ts
export const STEP2_OPINION = `<role>
你是一位思想分析专家，擅长提取文章的核心论点、论据链和思维框架。
你的任务是将网页内容转化为结构化的 Obsidian 链接笔记，帮助读者建立观点索引。
</role>

<field_guidance>
title: 根据作者核心立场生成，体现观点方向，10-20字。
summary: 提取作者的核心主张和主要论据，保留作者的立场和视角。
keyPoints: 每个要点是作者的一个独立论点及其支撑。格式："主张：xxx，论据：xxx"
argumentStructure: 必填，提取核心主张（mainClaim）和支撑论据列表（supportingArguments）。
tags: 基于分析结果的 suggestedTags + 文章涉及的思想流派或理论框架。
knowledgeConnections: 关联到相关的思想流派、理论框架或历史案例。
</field_guidance>`;
```

```typescript
// src/llm/prompts/step2-tutorial.ts
export const STEP2_TUTORIAL = `<role>
你是一位技术教育专家，擅长从教程中提取可执行的操作步骤和学习路径。
你的任务是将网页内容转化为结构化的 Obsidian 链接笔记，帮助读者快速掌握操作要领。
</role>

<field_guidance>
title: 根据教程的最终产出或核心技能生成，10-20字。
summary: 提取教程的最终产出物、前置条件和核心步骤概览。
keyPoints: 每个要点是一个关键操作步骤，包含具体命令或操作。按执行顺序排列。
prerequisites: 必填，列出学习本教程需要的前置知识或环境。
expectedOutcome: 必填，描述完成教程后的预期产出。
tags: 基于分析结果的 suggestedTags + 教程涉及的工具和框架。
knowledgeConnections: 关联到相关的工具、框架和最佳实践。
</field_guidance>`;
```

```typescript
// src/llm/prompts/step2-news.ts
export const STEP2_NEWS = `<role>
你是一位科技资讯分析师，擅长从新闻中提取关键事实、时间线和行业影响。
你的任务是将网页内容转化为结构化的 Obsidian 链接笔记，帮助读者快速了解行业动态。
</role>

<field_guidance>
title: 根据新闻核心事实生成，突出关键变化或影响，10-20字。
summary: 提取关键事实（谁、什么、何时、影响）。
keyPoints: 每个要点是一个独立的事实信息。
tags: 基于分析结果的 suggestedTags + 涉及的产品、公司和技术。
knowledgeConnections: 关联到相关产品、公司、技术趋势。
</field_guidance>`;
```

```typescript
// src/llm/prompts/step2-general.ts
export const STEP2_GENERAL = `<role>
你是一位内容分析专家，擅长从各类文章中提取核心信息和独特价值。
你的任务是将网页内容转化为结构化的 Obsidian 链接笔记。
</role>

<field_guidance>
title: 根据文章核心信息生成，10-20字。
summary: 提取文章的核心信息和独特价值。
keyPoints: 每个要点包含一个具体信息点。
tags: 基于分析结果的 suggestedTags + 文章涉及的具体主题。
knowledgeConnections: 关联到相关主题领域。
</field_guidance>`;
```

```typescript
// src/llm/prompts/index.ts
import type { ContentType } from "../schema.js";
import { STEP2_TECH_DEEP } from "./step2-tech-deep.js";
import { STEP2_OPINION } from "./step2-opinion.js";
import { STEP2_TUTORIAL } from "./step2-tutorial.js";
import { STEP2_NEWS } from "./step2-news.js";
import { STEP2_GENERAL } from "./step2-general.js";

const STEP2_PROMPTS: Record<ContentType, string> = {
  技术深度: STEP2_TECH_DEEP,
  观点思考: STEP2_OPINION,
  教程学习: STEP2_TUTORIAL,
  资讯动态: STEP2_NEWS,
  综合: STEP2_GENERAL,
};

export function getStep2Prompt(contentType: ContentType): string {
  return STEP2_PROMPTS[contentType];
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/llm/prompts.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/llm/prompts/ tests/llm/prompts.test.ts
git commit -m "feat: add 5 type-specific Step 2 prompt templates with selector"
```

---

### Task 4: Step 1 Analyzer

**Files:**
- Create: `src/llm/step1-analyzer.ts`
- Create: `tests/llm/step1-analyzer.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// tests/llm/step1-analyzer.test.ts

import { describe, expect, test, vi } from "vitest";
import { Step1Analyzer } from "../../src/llm/step1-analyzer.js";

const validAnalysis = {
  contentType: "技术深度",
  title: "RSC 性能优化实践",
  coreArguments: ["RSC 减少 JS bundle 大小"],
  keyEntities: ["React", "Server Components"],
  writingStyle: "技术教程",
  targetAudience: "前端开发者",
  quality: { informationDensity: "high", originality: "medium", practicality: "high" },
  suggestedTags: ["#React", "#RSC", "#性能优化"]
};

describe("Step1Analyzer", () => {
  test("returns parsed analysis from mocked API response", async () => {
    const mockCreate = vi.fn().mockResolvedValue({
      choices: [{ message: { content: JSON.stringify(validAnalysis) } }]
    });

    const analyzer = new Step1Analyzer({ apiKey: "test", model: "test" });
    // @ts-expect-error mock internal client
    analyzer["client"] = { chat: { completions: { create: mockCreate } } };

    const result = await analyzer.analyze({
      sourceUrl: "https://example.com",
      linkType: "tech_blog",
      title: "原文标题",
      author: "Author",
      rawText: "RSC 性能优化内容..."
    });

    expect(result.contentType).toBe("技术深度");
    expect(result.title).toBe("RSC 性能优化实践");
    expect(result.coreArguments).toContain("RSC 减少 JS bundle 大小");
    expect(mockCreate).toHaveBeenCalledOnce();
  });

  test("handles thinking tags in response", async () => {
    const responseWithThinking = {
      choices: [{
        message: {
          content: `<think>Let me analyze this content... I think it's about React.</think>\n${JSON.stringify(validAnalysis)}`
        }
      }]
    };

    const analyzer = new Step1Analyzer({ apiKey: "test", model: "test" });
    // @ts-expect-error mock internal client
    analyzer["client"] = { chat: { completions: { create: vi.fn().mockResolvedValue(responseWithThinking) } } };

    const result = await analyzer.analyze({
      sourceUrl: "https://example.com",
      linkType: "general",
      rawText: "content"
    });

    expect(result.contentType).toBe("技术深度");
  });

  test("throws LLM_OUTPUT_INVALID when no JSON in response", async () => {
    const analyzer = new Step1Analyzer({ apiKey: "test", model: "test" });
    // @ts-expect-error mock internal client
    analyzer["client"] = { chat: { completions: { create: vi.fn().mockResolvedValue({ choices: [{ message: { content: "no json here" } }] }) } } };

    await expect(
      analyzer.analyze({ sourceUrl: "https://example.com", linkType: "general", rawText: "text" })
    ).rejects.toThrow("LLM_OUTPUT_INVALID");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/llm/step1-analyzer.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement Step1Analyzer**

```typescript
// src/llm/step1-analyzer.ts

import OpenAI from "openai";
import { AppError } from "../errors/errors.js";
import { proxyFetch } from "../fetchers/proxy-fetch.js";
import type { FetchedContent } from "../fetchers/fetcher.js";
import { step1AnalysisSchema, type Step1Analysis } from "./schema.js";
import { STEP1_PROMPT } from "./prompts/step1-prompt.js";
import { extractJson } from "./extract-json.js";

export type Step1AnalyzerOptions = {
  apiKey: string;
  model: string;
  baseUrl?: string;
  maxTokens?: number;
};

export class Step1Analyzer {
  private client: OpenAI;
  private model: string;
  private maxTokens: number;

  constructor(options: Step1AnalyzerOptions) {
    this.client = new OpenAI({
      apiKey: options.apiKey,
      baseURL: options.baseUrl,
      fetch: proxyFetch as typeof fetch
    });
    this.model = options.model;
    this.maxTokens = options.maxTokens ?? 1024;
  }

  async analyze(input: Pick<FetchedContent, "sourceUrl" | "title" | "author" | "rawText"> & { linkType: string }): Promise<Step1Analysis> {
    const userMessage = [
      `来源：${input.sourceUrl}`,
      `类型：${input.linkType}`,
      input.title ? `原文标题：${input.title}` : null,
      input.author ? `作者：${input.author}` : null,
      "",
      "内容：",
      input.rawText.slice(0, 12000)
    ]
      .filter(Boolean)
      .join("\n");

    const response = await this.client.chat.completions.create({
      model: this.model,
      max_tokens: this.maxTokens,
      messages: [
        { role: "system", content: STEP1_PROMPT },
        { role: "user", content: userMessage }
      ]
    });

    const raw = response.choices[0]?.message?.content ?? "";
    const text = raw.replace(/<think>[\s\S]*?<\/think>/g, "").trim();
    const parsed = extractJson(text);
    return step1AnalysisSchema.parse(parsed);
  }
}
```

- [ ] **Step 4: Extract `extractJson` to shared module**

The `extractJson` function currently lives in `openai-extractor.ts`. Extract it to a shared module since both Step 1 and Step 2 need it.

```typescript
// src/llm/extract-json.ts

import { AppError } from "../errors/errors.js";

export function extractJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    // not pure JSON, continue
  }

  const candidates: unknown[] = [];

  for (let end = text.lastIndexOf("}"); end >= 0; end = text.lastIndexOf("}", end - 1)) {
    let depth = 0;
    let start = -1;
    for (let i = end; i >= 0; i--) {
      if (text[i] === "}") depth++;
      if (text[i] === "{") {
        depth--;
        if (depth === 0) {
          start = i;
          break;
        }
      }
    }
    if (start >= 0) {
      const candidate = text.slice(start, end + 1);
      try {
        const parsed = JSON.parse(candidate);
        if (typeof parsed === "object" && parsed !== null) {
          if ("title" in parsed && "summary" in parsed) {
            return parsed;
          }
          candidates.push(parsed);
        }
      } catch {
        // not valid JSON, skip
      }
    }
  }

  if (candidates.length > 0) {
    return candidates[0];
  }

  throw new AppError("LLM_OUTPUT_INVALID", `LLM response did not contain valid JSON. Response preview: ${text.slice(0, 300)}`);
}
```

- [ ] **Step 5: Update openai-extractor.ts to import from shared module**

```typescript
// src/llm/openai-extractor.ts — change import
import { extractJson } from "./extract-json.js";
// remove the local extractJson function
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npx vitest run tests/llm/step1-analyzer.test.ts tests/llm/openai-extractor.test.ts`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add src/llm/step1-analyzer.ts src/llm/extract-json.ts src/llm/openai-extractor.ts tests/llm/step1-analyzer.test.ts
git commit -m "feat: add Step1Analyzer with shared extractJson module"
```

---

### Task 5: Step 2 Generator

**Files:**
- Create: `src/llm/step2-generator.ts`
- Create: `tests/llm/step2-generator.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// tests/llm/step2-generator.test.ts

import { describe, expect, test, vi } from "vitest";
import { Step2Generator } from "../../src/llm/step2-generator.js";

const validNote = {
  title: "RSC 性能优化实践",
  contentType: "技术深度",
  summary: "文章介绍了 RSC 的核心机制和性能优化效果。",
  keyPoints: [
    { title: "服务端渲染", detail: "组件在服务端渲染，减少客户端 JS。" },
    { title: "按需加载", detail: "客户端仅 hydrate 交互部分。" },
    { title: "性能提升", detail: "首屏加载从 2.1s 降至 0.8s。" }
  ],
  technicalAnalysis: {
    architecture: "服务端渲染组件树",
    mechanism: "序列化组件状态发送到客户端",
    performance: "首屏 2.1s → 0.8s",
    deployment: "Next.js App Router"
  },
  knowledgeConnections: ["React", "SSR"],
  quality: { informationDensity: "high", originality: "medium", practicality: "high", recommendedSave: "strong" },
  tags: ["#React", "#RSC", "#性能优化"]
};

const step1Analysis = {
  contentType: "技术深度" as const,
  title: "RSC 性能优化实践",
  coreArguments: ["RSC 减少 JS bundle 大小"],
  keyEntities: ["React", "Server Components"],
  writingStyle: "技术教程",
  targetAudience: "前端开发者",
  quality: { informationDensity: "high" as const, originality: "medium" as const, practicality: "high" as const },
  suggestedTags: ["#React", "#RSC"]
};

describe("Step2Generator", () => {
  test("returns parsed note from mocked API response", async () => {
    const mockCreate = vi.fn().mockResolvedValue({
      choices: [{ message: { content: JSON.stringify(validNote) } }]
    });

    const generator = new Step2Generator({ apiKey: "test", model: "test" });
    // @ts-expect-error mock internal client
    generator["client"] = { chat: { completions: { create: mockCreate } } };

    const result = await generator.generate(
      { sourceUrl: "https://example.com", linkType: "tech_blog", rawText: "content" },
      step1Analysis
    );

    expect(result.title).toBe("RSC 性能优化实践");
    expect(result.contentType).toBe("技术深度");
    expect(result.keyPoints).toHaveLength(3);
    expect(mockCreate).toHaveBeenCalledOnce();

    // Verify the prompt was selected based on contentType
    const callArgs = mockCreate.mock.calls[0][0];
    expect(callArgs.messages[0].content).toContain("技术分析师");
  });

  test("uses opinion prompt for 观点思考 content", async () => {
    const opinionNote = {
      ...validNote,
      contentType: "观点思考",
      argumentStructure: { mainClaim: "AI 不会取代程序员", supportingArguments: ["创造性不可自动化"] }
    };

    const mockCreate = vi.fn().mockResolvedValue({
      choices: [{ message: { content: JSON.stringify(opinionNote) } }]
    });

    const generator = new Step2Generator({ apiKey: "test", model: "test" });
    // @ts-expect-error mock internal client
    generator["client"] = { chat: { completions: { create: mockCreate } } };

    const result = await generator.generate(
      { sourceUrl: "https://example.com", linkType: "general", rawText: "content" },
      { ...step1Analysis, contentType: "观点思考" }
    );

    expect(result.argumentStructure?.mainClaim).toBe("AI 不会取代程序员");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/llm/step2-generator.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement Step2Generator**

```typescript
// src/llm/step2-generator.ts

import OpenAI from "openai";
import { AppError } from "../errors/errors.js";
import { proxyFetch } from "../fetchers/proxy-fetch.js";
import type { FetchedContent } from "../fetchers/fetcher.js";
import { processedNoteSchema, type ProcessedNote, type Step1Analysis } from "./schema.js";
import { getStep2Prompt } from "./prompts/index.js";
import { extractJson } from "./extract-json.js";

export type Step2GeneratorOptions = {
  apiKey: string;
  model: string;
  baseUrl?: string;
  maxTokens?: number;
};

export class Step2Generator {
  private client: OpenAI;
  private model: string;
  private maxTokens: number;

  constructor(options: Step2GeneratorOptions) {
    this.client = new OpenAI({
      apiKey: options.apiKey,
      baseURL: options.baseUrl,
      fetch: proxyFetch as typeof fetch
    });
    this.model = options.model;
    this.maxTokens = options.maxTokens ?? 4096;
  }

  async generate(
    input: Pick<FetchedContent, "sourceUrl" | "rawText"> & { linkType: string },
    analysis: Step1Analysis
  ): Promise<ProcessedNote> {
    const systemPrompt = getStep2Prompt(analysis.contentType);

    const userMessage = [
      `以下是内容分析结果：`,
      JSON.stringify(analysis, null, 2),
      "",
      `以下是原文内容：`,
      input.rawText.slice(0, 12000)
    ].join("\n");

    const response = await this.client.chat.completions.create({
      model: this.model,
      max_tokens: this.maxTokens,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userMessage }
      ]
    });

    const raw = response.choices[0]?.message?.content ?? "";
    const text = raw.replace(/<think>[\s\S]*?<\/think>/g, "").trim();
    const parsed = extractJson(text);
    return processedNoteSchema.parse(parsed);
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/llm/step2-generator.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/llm/step2-generator.ts tests/llm/step2-generator.test.ts
git commit -m "feat: add Step2Generator with type-specific prompt selection"
```

---

### Task 6: TwoStepExtractor Orchestrator

**Files:**
- Create: `src/llm/two-step-extractor.ts`
- Create: `tests/llm/two-step-extractor.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// tests/llm/two-step-extractor.test.ts

import { describe, expect, test, vi } from "vitest";
import { TwoStepExtractor } from "../../src/llm/two-step-extractor.js";

const step1Response = {
  contentType: "技术深度",
  title: "RSC 性能优化",
  coreArguments: ["RSC 减少 bundle"],
  keyEntities: ["React"],
  writingStyle: "技术教程",
  targetAudience: "前端开发者",
  quality: { informationDensity: "high", originality: "medium", practicality: "high" },
  suggestedTags: ["#React", "#RSC"]
};

const step2Response = {
  title: "RSC 性能优化实践",
  contentType: "技术深度",
  summary: "RSC 优化效果显著。",
  keyPoints: [
    { title: "服务端渲染", detail: "组件在服务端渲染。" },
    { title: "按需加载", detail: "客户端仅 hydrate 交互部分。" },
    { title: "性能提升", detail: "首屏 2.1s → 0.8s。" }
  ],
  technicalAnalysis: { architecture: "SSR", mechanism: "序列化", performance: "0.8s", deployment: "Next.js" },
  knowledgeConnections: ["React"],
  quality: { informationDensity: "high", originality: "medium", practicality: "high", recommendedSave: "strong" },
  tags: ["#React", "#RSC", "#性能"]
};

describe("TwoStepExtractor", () => {
  test("orchestrates step1 then step2 and returns final note", async () => {
    const step1Create = vi.fn().mockResolvedValue({
      choices: [{ message: { content: JSON.stringify(step1Response) } }]
    });
    const step2Create = vi.fn().mockResolvedValue({
      choices: [{ message: { content: JSON.stringify(step2Response) } }]
    });

    const extractor = new TwoStepExtractor({
      step1: { apiKey: "test", model: "step1-model" },
      step2: { apiKey: "test", model: "step2-model" }
    });

    // @ts-expect-error mock internal clients
    extractor["step1Client"] = { chat: { completions: { create: step1Create } } };
    // @ts-expect-error mock internal clients
    extractor["step2Client"] = { chat: { completions: { create: step2Create } } };

    const note = await extractor.extract({
      sourceUrl: "https://example.com",
      linkType: "tech_blog",
      title: "原文标题",
      author: "Author",
      rawText: "RSC 内容..."
    });

    expect(note.title).toBe("RSC 性能优化实践");
    expect(note.contentType).toBe("技术深度");
    expect(step1Create).toHaveBeenCalledOnce();
    expect(step2Create).toHaveBeenCalledOnce();
  });

  test("uses step1 analysis to select step2 prompt", async () => {
    const opinionStep1 = { ...step1Response, contentType: "观点思考" };
    const opinionStep2 = { ...step2Response, contentType: "观点思考", argumentStructure: { mainClaim: "claim", supportingArguments: ["arg"] } };

    const extractor = new TwoStepExtractor({
      step1: { apiKey: "test", model: "m1" },
      step2: { apiKey: "test", model: "m2" }
    });

    // @ts-expect-error mock
    extractor["step1Client"] = { chat: { completions: { create: vi.fn().mockResolvedValue({ choices: [{ message: { content: JSON.stringify(opinionStep1) } }] }) } } };
    // @ts-expect-error mock
    extractor["step2Client"] = { chat: { completions: { create: vi.fn().mockResolvedValue({ choices: [{ message: { content: JSON.stringify(opinionStep2) } }] }) } } };

    const note = await extractor.extract({
      sourceUrl: "https://example.com",
      linkType: "general",
      rawText: "opinion content"
    });

    expect(note.contentType).toBe("观点思考");
    expect(note.argumentStructure?.mainClaim).toBe("claim");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/llm/two-step-extractor.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement TwoStepExtractor**

```typescript
// src/llm/two-step-extractor.ts

import { proxyFetch } from "../fetchers/proxy-fetch.js";
import OpenAI from "openai";
import type { ExtractNoteInput, NoteExtractor } from "./note-extractor.js";
import type { ProcessedNote } from "./schema.js";
import { Step1Analyzer, type Step1AnalyzerOptions } from "./step1-analyzer.js";
import { Step2Generator, type Step2GeneratorOptions } from "./step2-generator.js";

export type TwoStepExtractorOptions = {
  step1: Step1AnalyzerOptions;
  step2: Step2GeneratorOptions;
};

export class TwoStepExtractor implements NoteExtractor {
  private step1Analyzer: Step1Analyzer;
  private step2Generator: Step2Generator;

  constructor(options: TwoStepExtractorOptions) {
    this.step1Analyzer = new Step1Analyzer(options.step1);
    this.step2Generator = new Step2Generator(options.step2);
  }

  async extract(input: ExtractNoteInput): Promise<ProcessedNote> {
    const analysis = await this.step1Analyzer.analyze({
      sourceUrl: input.sourceUrl,
      linkType: input.linkType,
      title: input.title,
      author: input.author,
      rawText: input.rawText
    });

    const note = await this.step2Generator.generate(
      { sourceUrl: input.sourceUrl, linkType: input.linkType, rawText: input.rawText },
      analysis
    );

    return note;
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/llm/two-step-extractor.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/llm/two-step-extractor.ts tests/llm/two-step-extractor.test.ts
git commit -m "feat: add TwoStepExtractor orchestrator"
```

---

### Task 7: Update NoteExtractor interface and MockNoteExtractor

**Files:**
- Modify: `src/llm/note-extractor.ts`
- Modify: `tests/llm/note-extractor.test.ts`
- Modify: `tests/core/process-link.test.ts`
- Modify: `tests/llm/openai-extractor.test.ts`

- [ ] **Step 1: Update ExtractNoteInput — remove `analysis` field**

```typescript
// src/llm/note-extractor.ts — full replacement

import type { LinkType } from "../router/types.js";
import { processedNoteSchema, type ProcessedNote } from "./schema.js";

export type ExtractNoteInput = {
  sourceUrl: string;
  linkType: LinkType;
  title?: string;
  author?: string;
  rawText: string;
};

export interface NoteExtractor {
  extract(input: ExtractNoteInput): Promise<ProcessedNote>;
}

export class MockNoteExtractor implements NoteExtractor {
  async extract(input: ExtractNoteInput): Promise<ProcessedNote> {
    return processedNoteSchema.parse({
      title: input.title ?? "未命名链接笔记",
      contentType: "综合",
      summary: input.rawText.slice(0, 120),
      keyPoints: [
        { title: "核心内容", detail: "原文提供了值得保存的核心信息。" },
        { title: "处理价值", detail: "内容可以被结构化为 Obsidian 链接笔记。" },
        { title: "后续连接", detail: "该内容可以与现有知识主题建立关联。" }
      ],
      knowledgeConnections: ["链接笔记", input.linkType],
      quality: {
        informationDensity: "medium",
        originality: "medium",
        practicality: "medium",
        recommendedSave: "normal"
      },
      tags: ["#链接笔记", "#综合"]
    });
  }
}
```

- [ ] **Step 2: Update tests that use old ExtractNoteInput**

Update `tests/llm/note-extractor.test.ts`:

```typescript
// tests/llm/note-extractor.test.ts — full replacement

import { describe, expect, test } from "vitest";
import { MockNoteExtractor } from "../../src/llm/note-extractor.js";

describe("MockNoteExtractor", () => {
  test("returns schema-valid notes for deterministic process tests", async () => {
    const note = await new MockNoteExtractor().extract({
      sourceUrl: "https://example.dev/agent",
      linkType: "tech_blog",
      title: "Agent 工程文章",
      author: "Author",
      rawText: "架构 API 性能 部署 Agent LLM 大模型 ".repeat(20)
    });

    expect(note.title).toBe("Agent 工程文章");
    expect(note.keyPoints).toHaveLength(3);
    expect(note.tags).toContain("#链接笔记");
  });
});
```

Update `tests/core/process-link.test.ts` — remove `analysis` from MockNoteExtractor calls:

```typescript
// No change needed — MockNoteExtractor.extract() signature already updated
// The existing test uses MockNoteExtractor which doesn't pass analysis
// Just verify it still passes
```

- [ ] **Step 3: Update openai-extractor.test.ts**

The existing `openai-extractor.test.ts` uses the old `ExtractNoteInput` with `analysis`. Update it to remove the `analysis` field:

```typescript
// tests/llm/openai-extractor.test.ts — update extract calls
// Remove the `analysis` property from all extract() calls
// The test still tests OpenAINoteExtractor which will be kept for backward compat
```

- [ ] **Step 4: Run all affected tests**

Run: `npx vitest run tests/llm/note-extractor.test.ts tests/llm/openai-extractor.test.ts tests/core/process-link.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/llm/note-extractor.ts tests/llm/note-extractor.test.ts tests/llm/openai-extractor.test.ts
git commit -m "refactor: remove analysis from ExtractNoteInput, update MockNoteExtractor"
```

---

### Task 8: Factory + CLI Wiring

**Files:**
- Modify: `src/llm/factory.ts`
- Modify: `src/cli/commands/process.ts`

- [ ] **Step 1: Update factory to support `two-step` provider**

```typescript
// src/llm/factory.ts — full replacement

import type { LinkProcessingConfig } from "../config/schema.js";
import type { NoteExtractor } from "./note-extractor.js";
import { MockNoteExtractor } from "./note-extractor.js";
import { TwoStepExtractor, type TwoStepExtractorOptions } from "./two-step-extractor.js";

export function createExtractor(llmConfig: LinkProcessingConfig["llm"] & { step1Model?: string; step2Model?: string }): NoteExtractor {
  switch (llmConfig.provider) {
    case "two-step": {
      const apiKey = llmConfig.apiKey ?? process.env.OPENAI_API_KEY;
      if (!apiKey) {
        throw new Error("OpenAI API key required. Set OPENAI_API_KEY env var or apiKey in config.");
      }
      const baseUrl = llmConfig.baseUrl ?? process.env.OPENAI_BASE_URL;
      const step1Model = llmConfig.step1Model ?? process.env.LINK_PROCESSING_STEP1_MODEL ?? llmConfig.model;
      const step2Model = llmConfig.step2Model ?? process.env.LINK_PROCESSING_STEP2_MODEL ?? llmConfig.model;

      const options: TwoStepExtractorOptions = {
        step1: { apiKey, model: step1Model, baseUrl },
        step2: { apiKey, model: step2Model, baseUrl }
      };
      return new TwoStepExtractor(options);
    }
    case "mock":
    default:
      return new MockNoteExtractor();
  }
}
```

- [ ] **Step 2: Update CLI process command**

```typescript
// src/cli/commands/process.ts — update options and provider logic

// Add new options:
.option("--step1-model <model>", "Step 1 LLM model name")
.option("--step2-model <model>", "Step 2 LLM model name")

// Update provider resolution:
const provider = options.llmProvider ?? process.env.LINK_PROCESSING_LLM_PROVIDER ?? "two-step";

// Update createExtractor call:
extractor = createExtractor({
  provider: provider as "mock" | "two-step",
  model,
  baseUrl: options.llmBaseUrl ?? process.env.OPENAI_BASE_URL,
  apiKey: process.env.OPENAI_API_KEY,
  step1Model: options.step1Model,
  step2Model: options.step2Model
});
```

- [ ] **Step 3: Update factory tests**

Update `tests/llm/openai-extractor.test.ts` factory tests:

```typescript
// Replace OpenAINoteExtractor factory test with TwoStepExtractor
test("returns TwoStepExtractor for two-step provider", () => {
  const extractor = createExtractor({
    provider: "two-step",
    model: "test",
    apiKey: "test-key"
  });
  expect(extractor).toBeInstanceOf(TwoStepExtractor);
});
```

- [ ] **Step 4: Run all tests**

Run: `npx vitest run`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/llm/factory.ts src/cli/commands/process.ts tests/llm/openai-extractor.test.ts
git commit -m "feat: wire TwoStepExtractor into factory and CLI"
```

---

### Task 9: Template Rendering — New Sections

**Files:**
- Modify: `src/templates/standard-template.ts`
- Modify: `tests/templates/standard-template.test.ts`

- [ ] **Step 1: Write failing tests for new sections**

```typescript
// tests/templates/standard-template.test.ts — append

test("renders argumentStructure for opinion content", () => {
  const markdown = renderStandardTemplate({
    note: {
      title: "AI 是否会取代程序员",
      contentType: "观点思考",
      summary: "作者认为 AI 不会完全取代程序员。",
      keyPoints: [
        { title: "观点一", detail: "说明一。" },
        { title: "观点二", detail: "说明二。" },
        { title: "观点三", detail: "说明三。" }
      ],
      argumentStructure: {
        mainClaim: "AI 不会取代程序员",
        supportingArguments: ["创造性问题解决不可自动化", "需求理解需要人类判断"]
      },
      knowledgeConnections: ["AI 编程"],
      quality: { informationDensity: "medium", originality: "high", practicality: "medium", recommendedSave: "normal" },
      tags: ["#观点思考", "#AI"]
    },
    sourceUrl: "https://example.com/opinion",
    createdAt: new Date("2026-05-09T00:00:00.000Z"),
    fetchedAt: new Date("2026-05-09T10:00:00.000Z")
  });

  expect(markdown).toContain("## 论点结构");
  expect(markdown).toContain("**核心主张**：AI 不会取代程序员");
  expect(markdown).toContain("- 创造性问题解决不可自动化");
});

test("renders prerequisites and expectedOutcome for tutorial content", () => {
  const markdown = renderStandardTemplate({
    note: {
      title: "从零搭建 Next.js 项目",
      contentType: "教程学习",
      summary: "教程介绍如何从零开始搭建 Next.js 项目。",
      keyPoints: [
        { title: "步骤一", detail: "说明一。" },
        { title: "步骤二", detail: "说明二。" },
        { title: "步骤三", detail: "说明三。" }
      ],
      prerequisites: ["Node.js 18+", "基础 React 知识"],
      expectedOutcome: "一个可运行的 Next.js 项目",
      knowledgeConnections: ["Next.js"],
      quality: { informationDensity: "high", originality: "low", practicality: "high", recommendedSave: "normal" },
      tags: ["#Next.js", "#教程"]
    },
    sourceUrl: "https://example.com/tutorial",
    createdAt: new Date("2026-05-09T00:00:00.000Z"),
    fetchedAt: new Date("2026-05-09T10:00:00.000Z")
  });

  expect(markdown).toContain("## 前置条件");
  expect(markdown).toContain("- Node.js 18+");
  expect(markdown).toContain("## 预期产出");
  expect(markdown).toContain("一个可运行的 Next.js 项目");
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/templates/standard-template.test.ts`
Expected: FAIL — new sections not rendered

- [ ] **Step 3: Update template to render new sections**

```typescript
// src/templates/standard-template.ts — add after technicalAnalysis section (line 66)

  if (note.argumentStructure) {
    lines.push(
      "",
      "## 论点结构",
      "",
      `**核心主张**：${note.argumentStructure.mainClaim}`
    );
    note.argumentStructure.supportingArguments.forEach((arg) => {
      lines.push(`- ${arg}`);
    });
  }

  if (note.prerequisites?.length) {
    lines.push("", "## 前置条件", "");
    note.prerequisites.forEach((p) => lines.push(`- ${p}`));
  }

  if (note.expectedOutcome) {
    lines.push("", "## 预期产出", "");
    lines.push(note.expectedOutcome);
  }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/templates/standard-template.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/templates/standard-template.ts tests/templates/standard-template.test.ts
git commit -m "feat: render argumentStructure, prerequisites, expectedOutcome in template"
```

---

### Task 10: Pipeline Cleanup — Remove Old Files

**Files:**
- Delete: `src/analyzer/content-analyzer.ts`
- Delete: `src/analyzer/tag-generator.ts`
- Delete: `src/llm/openai-extractor.ts`
- Delete: `tests/analyzer/tag-generator.test.ts`
- Delete: `tests/llm/openai-extractor.test.ts`
- Modify: `src/core/process-link.ts`

- [ ] **Step 1: Update process-link.ts — remove analyzeContent**

```typescript
// src/core/process-link.ts — remove these lines:
// import { analyzeContent } from "../analyzer/content-analyzer.js";
// const analysis = analyzeContent(fetched.rawText);
// And update extractor.extract() call to remove analysis parameter:
const note = await options.extractor.extract({
  sourceUrl,
  linkType: routed.linkType,
  title: fetched.title,
  author: fetched.author,
  rawText: fetched.rawText
});
```

- [ ] **Step 2: Delete old files**

```bash
rm src/analyzer/content-analyzer.ts
rm src/analyzer/tag-generator.ts
rm src/llm/openai-extractor.ts
rm tests/analyzer/tag-generator.test.ts
rm tests/llm/openai-extractor.test.ts
```

- [ ] **Step 3: Check for remaining references to deleted modules**

```bash
grep -r "content-analyzer\|tag-generator\|openai-extractor" src/ tests/ --include="*.ts"
```

Fix any remaining imports.

- [ ] **Step 4: Run full test suite**

Run: `npx vitest run`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "refactor: remove old single-call extractor and keyword analyzer"
```

---

### Task 11: Integration Test — End-to-End with Mock

**Files:**
- Modify: `tests/core/process-link.test.ts`

- [ ] **Step 1: Update process-link test to verify two-step pipeline**

The existing test uses `MockNoteExtractor`. Verify it still works with the updated interface (no `analysis` field). Then add a test that verifies the `TwoStepExtractor` can be wired in:

```typescript
// tests/core/process-link.test.ts — the existing test should still pass
// MockNoteExtractor.extract() no longer requires analysis field
// No changes needed to the test itself
```

- [ ] **Step 2: Run full test suite**

Run: `npx vitest run`
Expected: PASS

- [ ] **Step 3: Build**

Run: `npm run build`
Expected: SUCCESS

- [ ] **Step 4: Manual smoke test**

```bash
node dist/cli/index.js process "https://weekly.tw93.fun/posts/266" --json
```

Verify the output has real content (not mock template).

- [ ] **Step 5: Commit if any fixes needed**

```bash
git add -A
git commit -m "fix: integration test fixes after two-step refactor"
```
