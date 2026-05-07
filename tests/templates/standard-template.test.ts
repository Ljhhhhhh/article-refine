import { describe, expect, test } from "vitest";
import { renderStandardTemplate } from "../../src/templates/standard-template.js";

describe("renderStandardTemplate", () => {
  test("renders a technical note using the approved standard template", () => {
    const markdown = renderStandardTemplate({
      note: {
        title: "AI Agent 架构设计",
        contentType: "技术深度",
        summary: "Agent 的稳定性来自确定性流程与结构化 LLM 输出的分工。",
        keyPoints: [
          { title: "CLI 稳定", detail: "AI 调用依赖固定命令和 JSON schema。" },
          { title: "保存可靠", detail: "process 成功必须代表 Obsidian 文件已写入。" },
          { title: "LLM 受控", detail: "LLM 输出必须通过 Zod 校验。" }
        ],
        technicalAnalysis: {
          architecture: "CLI 调用核心库，核心库再调用抓取、分析、渲染和保存模块。",
          mechanism: "确定性模块产出上下文，LLM 只负责提炼和组织。",
          performance: "MVP 串行执行，后续可接队列。",
          deployment: "本地 CLI 直接运行。"
        },
        knowledgeConnections: ["Agent 工程化", "Obsidian 知识库"],
        quality: {
          informationDensity: "high",
          originality: "medium",
          practicality: "high",
          recommendedSave: "strong"
        },
        tags: ["#技术深度", "#AI编程", "#链接笔记"]
      },
      sourceUrl: "https://example.com/article",
      author: "Example Author",
      createdAt: new Date("2026-05-07T00:00:00.000Z"),
      fetchedAt: new Date("2026-05-07T10:20:00.000Z")
    });

    expect(markdown).toContain("# AI Agent 架构设计");
    expect(markdown).toContain("> 来源：https://example.com/article");
    expect(markdown).toContain("> 作者：Example Author");
    expect(markdown).toContain("## 核心信息");
    expect(markdown).toContain("## 技术深度解析（技术类内容）");
    expect(markdown).toContain("> **推荐保存**：强烈推荐");
  });

  test("omits technical analysis for non-technical notes", () => {
    const markdown = renderStandardTemplate({
      note: {
        title: "产品观点",
        contentType: "观点思考",
        summary: "这是一篇观点文章。",
        keyPoints: [
          { title: "观点一", detail: "说明一。" },
          { title: "观点二", detail: "说明二。" },
          { title: "观点三", detail: "说明三。" }
        ],
        knowledgeConnections: [],
        quality: {
          informationDensity: "medium",
          originality: "medium",
          practicality: "medium",
          recommendedSave: "normal"
        },
        tags: ["#观点思考", "#链接笔记"]
      },
      sourceUrl: "https://example.com/opinion",
      createdAt: new Date("2026-05-07T00:00:00.000Z"),
      fetchedAt: new Date("2026-05-07T10:20:00.000Z")
    });

    expect(markdown).not.toContain("## 技术深度解析（技术类内容）");
  });
});
