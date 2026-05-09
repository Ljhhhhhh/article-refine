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
