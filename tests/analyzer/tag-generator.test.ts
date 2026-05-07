import { describe, expect, test } from "vitest";
import { generateTags } from "../../src/analyzer/tag-generator.js";

describe("generateTags", () => {
  test("includes content type and fixed link note tag", () => {
    expect(generateTags("普通内容", "综合")).toEqual(["#综合", "#链接笔记"]);
  });

  test("matches theme tags and limits total tags to six", () => {
    const content = "AI编程 Agent LLM 大模型 系统架构 微服务 React JavaScript Kubernetes Docker 产品 UX 创业 融资";

    const tags = generateTags(content, "技术深度");

    expect(tags).toContain("#技术深度");
    expect(tags).toContain("#链接笔记");
    expect(tags).toContain("#AI编程");
    expect(tags.length).toBeLessThanOrEqual(6);
  });

  test("deduplicates tags while preserving first occurrence order", () => {
    const tags = generateTags("技术深度 AI编程 Agent", "技术深度");

    expect(tags).toEqual(["#技术深度", "#链接笔记", "#AI编程"]);
  });
});
