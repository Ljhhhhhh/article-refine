import YAML from "yaml";
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

function stripHash(tag: string): string {
  return tag.replace(/^#/, "");
}

function formatObsidianLink(connection: string): string {
  const trimmed = connection.trim();
  return trimmed.startsWith("[[") && trimmed.endsWith("]]") ? trimmed : `[[${trimmed}]]`;
}

function renderFrontmatter(input: RenderStandardTemplateInput): string {
  const { note, sourceUrl, author, createdAt, fetchedAt } = input;
  const yaml = YAML.stringify({
    title: note.title,
    source_url: sourceUrl,
    author: author ?? "未知",
    content_type: note.contentType,
    created: formatDate(createdAt),
    fetched: formatDateTime(fetchedAt),
    tags: note.tags.map(stripHash)
  });

  return ["---", yaml.trimEnd(), "---", ""].join("\n");
}

export function renderStandardTemplate(input: RenderStandardTemplateInput): string {
  const { note, sourceUrl, author, createdAt, fetchedAt } = input;

  const lines: string[] = [
    renderFrontmatter(input),
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
      lines.push(`- ${formatObsidianLink(connection)}`);
    });
    lines.push("");
  }

  return lines.join("\n");
}
