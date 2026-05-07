import type { ContentTypeDirectory } from "../storage/file-naming.js";

const THEME_TAGS: Array<[string, string[]]> = [
  ["#AI编程", ["AI编程", "Agent", "LLM", "大模型"]],
  ["#系统架构", ["系统架构", "微服务", "分布式", "高可用"]],
  ["#前端", ["前端", "React", "Vue", "JavaScript"]],
  ["#后端", ["后端", "Go", "Python", "Java"]],
  ["#DevOps", ["DevOps", "Kubernetes", "Docker", "CI/CD"]],
  ["#产品", ["产品", "UX", "用户研究", "需求分析"]],
  ["#团队协作", ["团队", "协作", "管理", "流程"]],
  ["#创业投资", ["创业", "融资", "商业", "市场"]]
];

export function generateTags(content: string, contentType: ContentTypeDirectory): string[] {
  const tags = [`#${contentType}`, "#链接笔记"];
  const lowerContent = content.toLowerCase();

  for (const [tag, keywords] of THEME_TAGS) {
    if (keywords.some((keyword) => lowerContent.includes(keyword.toLowerCase()))) {
      tags.push(tag);
    }
  }

  const uniqueTags = tags.filter((tag, index) => tags.indexOf(tag) === index);
  return uniqueTags.slice(0, 6);
}
