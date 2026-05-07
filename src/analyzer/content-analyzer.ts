import { generateTags } from "./tag-generator.js";
import type { ContentType } from "../llm/schema.js";

export type AnalysisResult = {
  wordCount: number;
  contentType: ContentType;
  recommendedTags: string[];
  qualityHints: {
    informationDensity: "high" | "medium" | "low";
    practicality: "high" | "medium" | "low";
  };
};

const INDICATORS: Record<ContentType, string[]> = {
  技术深度: ["架构", "设计模式", "源码", "API", "性能", "部署", "框架", "算法", "数据结构"],
  观点思考: ["我认为", "在我看来", "观点", "启示", "反思", "争议"],
  教程学习: ["第一步", "然后", "接下来", "示例", "配置", "安装", "操作步骤"],
  资讯动态: ["发布", "更新", "宣布", "近日", "近期", "新版本", "路线图"],
  综合: []
};

export function analyzeContent(content: string): AnalysisResult {
  const compact = content.trim();
  const wordCount = compact.split(/\s+/).filter(Boolean).length;
  const scores = Object.entries(INDICATORS).map(([contentType, indicators]) => ({
    contentType: contentType as ContentType,
    score: indicators.filter((indicator) => compact.includes(indicator)).length
  }));
  const best = scores.sort((a, b) => b.score - a.score)[0];
  const contentType = best.score > 0 ? best.contentType : "综合";

  return {
    wordCount,
    contentType,
    recommendedTags: generateTags(compact, contentType),
    qualityHints: {
      informationDensity: wordCount > 1000 ? "high" : wordCount > 300 ? "medium" : "low",
      practicality: /示例|配置|步骤|部署|代码|API/.test(compact) ? "high" : "medium"
    }
  };
}
