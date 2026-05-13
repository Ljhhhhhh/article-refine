import React, { useEffect, useReducer } from "react";
import { Box, Text, useApp, useInput } from "ink";
import { runProcessCommand, type ProcessCommandOptions } from "../process-runner.js";
import { createInitialTuiState, reduceTuiState, summarizeProcessResult } from "./state.js";

export type AppProps = {
  initialUrl?: string;
  options: ProcessCommandOptions;
};

function statusSymbol(status: string): string {
  if (status === "done") return "✓";
  if (status === "active") return "⠋";
  if (status === "failed") return "✕";
  return "○";
}

export function App({ initialUrl, options }: AppProps) {
  const { exit } = useApp();
  const [state, dispatch] = useReducer(reduceTuiState, createInitialTuiState(initialUrl));

  useInput((input, key) => {
    if (input === "q" || key.escape) exit();
    if (state.phase === "input" && key.return && state.url.trim()) {
      dispatch({ type: "start", url: state.url.trim() });
    } else if (state.phase === "input" && key.backspace) {
      dispatch({ type: "set-url", url: state.url.slice(0, -1) });
    } else if (state.phase === "input" && input) {
      dispatch({ type: "set-url", url: `${state.url}${input}` });
    } else if (input === "r" && state.url.trim()) {
      dispatch({ type: "start", url: state.url.trim() });
    }
  });

  useEffect(() => {
    if (state.phase !== "running" || !state.url.trim()) return;
    let cancelled = false;
    runProcessCommand(state.url.trim(), {
      ...options,
      onProgress: (step) => {
        if (!cancelled) dispatch({ type: "progress", step });
        options.onProgress?.(step);
      }
    })
      .then((result) => {
        if (!cancelled) dispatch({ type: "result", result });
      })
      .catch((error) => {
        if (!cancelled) dispatch({ type: "error", message: error instanceof Error ? error.message : "Unknown error" });
      });
    return () => {
      cancelled = true;
    };
  }, [state.phase, state.url]);

  const summary = state.result ? summarizeProcessResult(state.result) : undefined;

  return (
    <Box flexDirection="column" paddingX={1}>
      <Text bold color="cyan">链接笔记助手</Text>
      <Text color="gray">q: 退出 · r: 重试</Text>
      <Box marginTop={1} flexDirection="column">
        <Text>来源: {state.url || "粘贴链接后按 Enter 开始处理"}</Text>
        {state.phase === "input" ? <Text color="yellow">URL: {state.url}</Text> : null}
      </Box>
      <Box marginTop={1} flexDirection="column">
        {state.steps.map((step) => (
          <Text key={step.id} color={step.status === "failed" ? "red" : step.status === "done" ? "green" : step.status === "active" ? "cyan" : "gray"}>
            {statusSymbol(step.status)} {step.label}
          </Text>
        ))}
      </Box>
      <Box marginTop={1} flexDirection="column">
        <Text bold>日志</Text>
        {state.logs.slice(-8).map((log, index) => <Text key={`${log}-${index}`} color="gray">{log}</Text>)}
      </Box>
      {summary ? (
        <Box marginTop={1} flexDirection="column">
          <Text bold color={state.phase === "success" ? "green" : "red"}>{state.phase === "success" ? "✓ 已保存" : "✕ 处理失败"}</Text>
          <Text>{summary.title}</Text>
          <Text color="gray">{summary.destination}</Text>
        </Box>
      ) : null}
      {state.error ? <Text color="red">{state.error}</Text> : null}
    </Box>
  );
}
