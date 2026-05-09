import type { ProcessedNote } from "../llm/schema.js";

type RenderStandardTemplateInput = {
  note: ProcessedNote;
  sourceUrl: string;
  author?: string;
  createdAt: Date;
  fetchedAt: Date;
};

function formatDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function formatDateTime(date: Date): string {
  return date.toISOString().replace("T", " ").slice(0, 16);
}

export function renderStandardTemplate(input: RenderStandardTemplateInput): string {
  const { note, sourceUrl, author, createdAt, fetchedAt } = input;

  const lines: string[] = [
    `# ${note.title}`,
    "",
    `> 创建日期：${formatDate(createdAt)}`,
    `> 来源：${sourceUrl}`,
    `> 作者：${author ?? "未知"}`,
    `> 抓取时间：${formatDateTime(fetchedAt)}`,
    `> 标签：${note.tags.join(" ")}`,
    "",
    "---",
    "",
    note.body.trim(),
    "",
    "---",
    ""
  ];

  if (note.knowledgeConnections.length > 0) {
    lines.push("## 知识连接", "");
    note.knowledgeConnections.forEach((connection) => {
      lines.push(`- ${connection}`);
    });
    lines.push("");
  }

  lines.push("## 原文链接", "", sourceUrl, "");

  return lines.join("\n");
}
