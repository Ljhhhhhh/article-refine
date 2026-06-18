import type { Command } from "commander";
import { renderHumanProcessResult } from "../presenters/human.js";
import { renderJson } from "../presenters/json.js";
import { runProcessCommand } from "../process-runner.js";

export function shouldUseOssOnlyMode(
  ossConfig: { enabled: boolean; mode: "mirror" | "only" },
  ossOption: boolean | undefined
): boolean {
  return ossOption !== false && ossConfig.enabled && ossConfig.mode === "only";
}

export function registerProcessCommand(program: Command): void {
  program
    .command("process")
    .argument("<source>", "URL or local .md file path")
    .option("--json", "print machine-readable JSON")
    .option("--vault <path>", "Obsidian vault path")
    .option("--llm-provider <provider>", "LLM provider (mock|draft-revise)")
    .option("--llm-model <model>", "LLM model name (fallback for both passes)")
    .option("--llm-base-url <url>", "OpenAI-compatible API base URL")
    .option("--draft-model <model>", "Draft (Pass 1) LLM model name")
    .option("--revise-model <model>", "Revise (Pass 2, thinking) LLM model name")
    .option("--config <path>", "config path", "link-processing.config.yaml")
    .option("--skip-existing", "skip processing if source URL already exists in the vault index")
    .option("--update-existing", "overwrite the existing note if source URL already exists")
    .option("--no-oss", "disable OSS mirror for this run even if configured")
    .action(
      async (
        source: string,
        options: {
          json?: boolean;
          vault?: string;
          llmProvider?: string;
          llmModel?: string;
          llmBaseUrl?: string;
          draftModel?: string;
          reviseModel?: string;
          config?: string;
          skipExisting?: boolean;
          updateExisting?: boolean;
          oss?: boolean;
        }
      ) => {
        const onProgress = options.json
          ? undefined
          : (step: string) => {
              const labels: Record<string, string> = {
                fetching: "正在抓取内容...",
                preparing: "准备阶段：长文压缩（如需要）...",
                drafting: "Pass 1: 起草笔记...",
                revising: "Pass 2: 对照原文修订...",
                extracting: "正在生成结构化笔记...",
                saving: "保存到 Obsidian...",
                mirroring: "同步到 OSS...",
                uploading: "上传到 OSS..."
              };
              process.stderr.write(`  ${labels[step] ?? step}\n`);
            };

        const result = await runProcessCommand(source, { ...options, onProgress });
        process.stdout.write(options.json ? renderJson(result) : renderHumanProcessResult(result));
        if (!result.ok) process.exitCode = 1;
      }
    );
}
