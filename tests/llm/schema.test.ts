import { describe, expect, test } from "vitest";
import { processedNoteSchema } from "../../src/llm/schema.js";

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
