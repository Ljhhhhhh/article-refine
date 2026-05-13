import type { ProcessResult, ProcessSuccessResult } from "../../core/process-link.js";

export type TuiPhase = "input" | "running" | "success" | "failed";
export type TuiStepStatus = "pending" | "active" | "done" | "failed";
export type TuiStepId = "validate" | "fetch" | "generate" | "deliver";

export type TuiStep = {
  id: TuiStepId;
  label: string;
  status: TuiStepStatus;
};

export type TuiState = {
  phase: TuiPhase;
  url: string;
  logs: string[];
  steps: TuiStep[];
  result?: ProcessResult;
  error?: string;
};

export type TuiAction =
  | { type: "set-url"; url: string }
  | { type: "start"; url: string }
  | { type: "progress"; step: string }
  | { type: "result"; result: ProcessResult }
  | { type: "error"; message: string }
  | { type: "reset" };

const INITIAL_STEPS: TuiStep[] = [
  { id: "validate", label: "解析链接", status: "pending" },
  { id: "fetch", label: "抓取内容", status: "pending" },
  { id: "generate", label: "生成笔记", status: "pending" },
  { id: "deliver", label: "保存/上传", status: "pending" }
];

const PROGRESS_MAP: Record<string, { active: TuiStepId; log: string; doneBefore: TuiStepId[] }> = {
  fetching: { active: "fetch", log: "正在抓取页面内容", doneBefore: ["validate"] },
  extracting: { active: "generate", log: "正在生成结构化笔记", doneBefore: ["validate", "fetch"] },
  drafting: { active: "generate", log: "Pass 1: 起草笔记", doneBefore: ["validate", "fetch"] },
  revising: { active: "generate", log: "Pass 2: 对照原文修订", doneBefore: ["validate", "fetch"] },
  saving: { active: "deliver", log: "保存到 Obsidian", doneBefore: ["validate", "fetch", "generate"] },
  mirroring: { active: "deliver", log: "同步到 OSS", doneBefore: ["validate", "fetch", "generate"] },
  uploading: { active: "deliver", log: "上传到 OSS", doneBefore: ["validate", "fetch", "generate"] }
};

function cloneSteps(): TuiStep[] {
  return INITIAL_STEPS.map((step) => ({ ...step }));
}

export function createInitialTuiState(url = ""): TuiState {
  return {
    phase: url ? "running" : "input",
    url,
    logs: [],
    steps: cloneSteps()
  };
}

function markProgress(steps: TuiStep[], progress: { active: TuiStepId; doneBefore: TuiStepId[] }): TuiStep[] {
  return steps.map((step) => {
    if (progress.doneBefore.includes(step.id)) return { ...step, status: "done" };
    if (step.id === progress.active) return { ...step, status: "active" };
    return step;
  });
}

export function reduceTuiState(state: TuiState, action: TuiAction): TuiState {
  switch (action.type) {
    case "set-url":
      return { ...state, url: action.url };
    case "start":
      return { ...createInitialTuiState(action.url), phase: "running" };
    case "progress": {
      const progress = PROGRESS_MAP[action.step];
      if (!progress) return { ...state, logs: [...state.logs, action.step] };
      return {
        ...state,
        steps: markProgress(state.steps, progress),
        logs: [...state.logs, progress.log]
      };
    }
    case "result": {
      const ok = action.result.ok;
      return {
        ...state,
        phase: ok ? "success" : "failed",
        result: action.result,
        steps: state.steps.map((step) => ({
          ...step,
          status: ok ? "done" : step.status === "pending" ? "pending" : "failed"
        }))
      };
    }
    case "error":
      return {
        ...state,
        phase: "failed",
        error: action.message,
        logs: [...state.logs, action.message],
        steps: state.steps.map((step) =>
          step.status === "active" ? { ...step, status: "failed" } : step
        )
      };
    case "reset":
      return createInitialTuiState();
  }
}

export function summarizeProcessResult(result: ProcessResult): { title: string; destination: string } {
  if (!result.ok) return { title: result.error.code, destination: result.error.message };
  if ("skipped" in result && result.skipped) return { title: "已存在，跳过处理", destination: result.existingPath };
  const success = result as ProcessSuccessResult;
  return {
    title: success.title,
    destination: success.oss?.uploaded ? success.oss.httpsUrl : success.obsidian?.path ?? ""
  };
}
