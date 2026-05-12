import type { DuplicatePolicy, Runtime } from "./link-processing-cli.js";

export type StepStatus = "done" | "active" | "pending" | "failed";

export type Step = {
  label: string;
  status: StepStatus;
  detail?: string;
};

export type RunConfig = {
  projectPath: string;
  runtime: Runtime;
  duplicatePolicy: DuplicatePolicy;
  ossEnabled: boolean;
  timeoutSeconds: string;
  cliCommand?: string;
};

export type DashboardResult = {
  ok: boolean;
  title: string;
  message: string;
  path?: string;
};

export type DashboardTask = {
  url: string;
  steps: Step[];
  result?: DashboardResult;
  error?: string;
  running: boolean;
  config?: RunConfig;
};

export function shortenMiddle(value: string, maxLength = 72): string {
  if (value.length <= maxLength) {
    return value;
  }

  const edgeLength = Math.max(8, Math.floor((maxLength - 3) / 2));
  return `${value.slice(0, edgeLength)}...${value.slice(-edgeLength)}`;
}

export function getSourceHost(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return "无效链接";
  }
}

export function getSourceType(url: string): string {
  const host = getSourceHost(url);
  if (host.includes("mp.weixin.qq.com")) return "微信文章";
  if (
    host === "x.com" ||
    host.endsWith(".x.com") ||
    host.includes("twitter.com")
  ) {
    return "Twitter/X";
  }
  return "网页文章";
}

export function getRuntimeLabel(runtime?: Runtime): string {
  if (runtime === "source") return "源码运行";
  if (runtime === "dist") return "构建产物";
  return "未准备";
}

export function getDestinationLabel(
  config?: Pick<RunConfig, "ossEnabled">,
): string {
  if (!config) return "解析中";
  return config.ossEnabled ? "Obsidian + OSS" : "仅本地 Obsidian";
}

export function getDuplicatePolicyLabel(policy?: DuplicatePolicy): string {
  switch (policy) {
    case "skip":
      return "跳过已有";
    case "update":
      return "更新已有";
    case "create":
      return "新建笔记";
    default:
      return "新建笔记";
  }
}

export function getTaskStatus(
  task: Pick<DashboardTask, "running" | "result" | "error">,
): {
  label: string;
  tone: "blue" | "green" | "red";
} {
  if (task.error || task.result?.ok === false) {
    return { label: "失败", tone: "red" };
  }
  if (task.result?.ok) {
    return { label: "已保存", tone: "green" };
  }
  if (task.running) {
    return { label: "处理中", tone: "blue" };
  }
  return { label: "待处理", tone: "blue" };
}

export function getCurrentStep(task: DashboardTask): Step | undefined {
  return (
    task.steps.find((step) => step.status === "active") ?? task.steps.at(-1)
  );
}

export function getStepStatusLabel(status: StepStatus): string {
  switch (status) {
    case "done":
      return "完成";
    case "active":
      return "处理中";
    case "pending":
      return "等待";
    case "failed":
      return "失败";
  }
}

export function formatCliPreview(command?: string): string {
  if (!command) return "准备命令中";
  return shortenMiddle(command.replace(/\s+/g, " "), 96);
}

function escapeMarkdown(value: string): string {
  return value.replace(/([\\`*_{}[\]()#+\-.!|>])/g, "\\$1");
}

export function buildDashboardMarkdown(task: DashboardTask): string {
  const status = getTaskStatus(task);
  const currentStep = getCurrentStep(task);
  const sourceHost = getSourceHost(task.url);
  const sourceType = getSourceType(task.url);
  const lines = [
    "# 保存链接到 Obsidian",
    "",
    `**${status.label}** · ${sourceType} · [${escapeMarkdown(sourceHost)}](${task.url})`,
    "",
    "## 当前",
    "",
    currentStep
      ? `**${escapeMarkdown(currentStep.label)}** — ${escapeMarkdown(currentStep.detail ?? getStepStatusLabel(currentStep.status))}`
      : "准备处理中。",
    "",
    "## 流程",
    "",
    "| 阶段 | 状态 | 详情 |",
    "| --- | --- | --- |",
    ...task.steps.map((step) => {
      const detail = step.detail ? shortenMiddle(step.detail, 64) : "";
      return `| ${escapeMarkdown(step.label)} | ${getStepStatusLabel(step.status)} | ${escapeMarkdown(detail)} |`;
    }),
  ];

  if (task.result) {
    lines.push(
      "",
      "## 结果",
      "",
      `**${escapeMarkdown(task.result.title)}**`,
      "",
      escapeMarkdown(task.result.message),
    );
  }

  if (task.error) {
    lines.push("", "## 错误", "", "```text", task.error, "```");
  }

  if (task.config?.cliCommand) {
    lines.push(
      "",
      "## 命令",
      "",
      "`" + formatCliPreview(task.config.cliCommand) + "`",
    );
  }

  return lines.join("\n");
}
