import type { ContentType } from "./schema.js";

export type ContentCategory = {
  contentType: ContentType;
  description: string;
  tags: string[];
};

export const CONTENT_CATEGORIES: ContentCategory[] = [
  {
    contentType: "技术深度",
    description: "技术原理、架构设计、工程实践、性能与安全分析",
    tags: ["技术深度", "AI", "AI编程", "Agent", "LLM", "前端", "React", "性能优化", "架构", "工程化", "数据", "安全", "云服务", "开源"]
  },
  {
    contentType: "观点思考",
    description: "观点、趋势判断、方法论、产品与组织思考",
    tags: ["观点思考", "产品", "创业", "组织", "方法论", "趋势", "效率", "决策", "知识管理"]
  },
  {
    contentType: "教程学习",
    description: "教程、操作步骤、学习资料、工具使用说明",
    tags: ["教程学习", "教程", "工具", "实践", "配置", "调试", "学习资料", "命令行"]
  },
  {
    contentType: "资讯动态",
    description: "新闻、发布、版本更新、行业或产品动态",
    tags: ["资讯动态", "发布", "版本更新", "行业动态", "产品动态", "融资", "政策"]
  },
  {
    contentType: "综合",
    description: "无法归入以上类型的链接笔记",
    tags: ["综合", "链接笔记", "阅读", "收藏"]
  }
];

const allowedTagNames = new Set(CONTENT_CATEGORIES.flatMap((category) => category.tags));

function stripHash(tag: string): string {
  return tag.trim().replace(/^#/, "");
}

export function isAllowedTag(tag: string): boolean {
  return allowedTagNames.has(stripHash(tag));
}

export function normalizeTags(tags: string[], contentType: ContentType, limit = 8): string[] {
  const normalized: string[] = [];
  const seen = new Set<string>();

  for (const tag of tags) {
    const name = stripHash(tag);
    if (!allowedTagNames.has(name) || seen.has(name)) {
      continue;
    }
    seen.add(name);
    normalized.push(`#${name}`);
    if (normalized.length >= limit) {
      break;
    }
  }

  if (normalized.length > 0) {
    return normalized;
  }

  const fallback = CONTENT_CATEGORIES.find((category) => category.contentType === contentType)?.tags[0] ?? "综合";
  return [`#${fallback}`];
}

export function renderCategoryGuide(): string {
  return CONTENT_CATEGORIES.map((category) => {
    const tags = category.tags.map((tag) => `#${tag}`).join(" / ");
    return `- ${category.contentType}：${category.description}。可选 tags：${tags}`;
  }).join("\n");
}
