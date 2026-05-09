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
    "## 核心信息",
    "",
    note.summary,
    "",
    "## 关键要点",
    ""
  ];

  note.keyPoints.forEach((point, index) => {
    lines.push(`${index + 1}. **${point.title}**：${point.detail}`);
  });

  if (note.contentType === "技术深度" && note.technicalAnalysis) {
    lines.push(
      "",
      "## 技术深度解析（技术类内容）",
      "",
      `- **架构设计**：${note.technicalAnalysis.architecture ?? "原文未提供明确架构信息。"}`,
      `- **实现机制**：${note.technicalAnalysis.mechanism ?? "原文未提供明确实现机制。"}`,
      `- **性能考量**：${note.technicalAnalysis.performance ?? "原文未提供明确性能信息。"}`,
      `- **部署实践**：${note.technicalAnalysis.deployment ?? "原文未提供明确部署信息。"}`
    );
  }

  if (note.argumentStructure) {
    lines.push(
      "",
      "## 论点结构",
      "",
      `**核心主张**：${note.argumentStructure.mainClaim}`
    );
    note.argumentStructure.supportingArguments.forEach((arg) => {
      lines.push(`- ${arg}`);
    });
  }

  if (note.prerequisites?.length) {
    lines.push("", "## 前置条件", "");
    note.prerequisites.forEach((p) => lines.push(`- ${p}`));
  }

  if (note.expectedOutcome) {
    lines.push("", "## 预期产出", "");
    lines.push(note.expectedOutcome);
  }

  lines.push("", "## 知识连接", "");
  if (note.knowledgeConnections.length > 0) {
    note.knowledgeConnections.forEach((connection) => {
      lines.push(`- **关联主题**：${connection}`);
    });
  } else {
    lines.push("- **关联主题**：暂无明确关联主题");
  }

  lines.push(
    "",
    "## 外部资源",
    "",
    `- **原文链接**：${sourceUrl}`,
    ""
  );

  return lines.join("\n");
}
