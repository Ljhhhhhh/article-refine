import { describe, expect, test } from "vitest";
import { processedNoteSchema, step1AnalysisSchema } from "../../src/llm/schema.js";

describe("processedNoteSchema", () => {
  test("accepts a complete technical note", () => {
    const parsed = processedNoteSchema.parse({
      title: "AI Agent 架构设计",
      contentType: "技术深度",
      summary: "这是一篇关于 Agent 架构的深度分析。",
      keyPoints: [
        { title: "路由清晰", detail: "URL 路由应当由确定性代码完成。" },
        { title: "输出稳定", detail: "AI 调用需要固定 JSON schema。" },
        { title: "保存可靠", detail: "Obsidian 写入是成功标准。" }
      ],
      technicalAnalysis: {
        architecture: "CLI 调用核心库。",
        mechanism: "抓取、分析、渲染、保存串联。",
        performance: "MVP 先串行执行。",
        deployment: "本地 CLI 使用。"
      },
      knowledgeConnections: ["Agent 工程化", "Obsidian 知识管理"],
      quality: {
        informationDensity: "high",
        originality: "medium",
        practicality: "high",
        recommendedSave: "strong"
      },
      tags: ["#技术深度", "#AI编程", "#链接笔记"]
    });

    expect(parsed.contentType).toBe("技术深度");
  });

  test("requires 3 to 7 key points", () => {
    expect(() =>
      processedNoteSchema.parse({
        title: "标题",
        contentType: "综合",
        summary: "摘要",
        keyPoints: [{ title: "一个", detail: "不足三个" }],
        knowledgeConnections: [],
        quality: {
          informationDensity: "medium",
          originality: "medium",
          practicality: "medium",
          recommendedSave: "normal"
        },
        tags: ["#综合", "#链接笔记"]
      })
    ).toThrow();
  });
});

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
