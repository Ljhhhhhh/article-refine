import {
  Action,
  ActionPanel,
  Clipboard,
  Detail,
  Form,
  Icon,
  LocalStorage,
  Toast,
  getPreferenceValues,
  showToast,
  useNavigation,
} from "@raycast/api";
import { useEffect, useRef, useState } from "react";
import {
  type DuplicatePolicy,
  type ProcessResult,
  type Runtime,
  buildProcessArgs,
  formatProcessResult,
  parseProcessResult,
  validateHttpUrl,
} from "./link-processing-cli.js";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const STORAGE_KEY = "active-task";

type Preferences = {
  projectPath: string;
  runtime: Runtime;
  duplicatePolicy: DuplicatePolicy;
  ossEnabled?: boolean;
  timeoutSeconds: string;
};

type StepStatus = "done" | "active" | "pending";

type Step = {
  label: string;
  status: StepStatus;
  detail?: string;
};

type TaskState = {
  url: string;
  steps: Step[];
  result?: { ok: boolean; title: string; message: string };
  error?: string;
  running: boolean;
};

function parseTimeoutMs(value: string): number {
  const seconds = Number.parseInt(value, 10);
  if (!Number.isFinite(seconds) || seconds <= 0) return 180_000;
  return seconds * 1000;
}

function stepIcon(status: StepStatus): string {
  switch (status) {
    case "done":
      return "✅";
    case "active":
      return "⏳";
    case "pending":
      return "○";
  }
}

function buildMarkdown(task: TaskState): string {
  const lines = [`# Saving URL\n`, `**URL:** ${task.url}\n`];

  for (const step of task.steps) {
    const icon = stepIcon(step.status);
    const detail = step.detail ? ` — ${step.detail}` : "";
    lines.push(`${icon} **${step.label}**${detail}`);
  }

  if (task.result) {
    lines.push(
      "",
      "---",
      "",
      task.result.ok ? `### ✅ ${task.result.title}` : `### ❌ ${task.result.title}`,
      "",
      task.result.message,
    );
  }

  if (task.error) {
    lines.push("", "---", "", `### ❌ Error`, "", task.error);
  }

  return lines.join("\n");
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return "Unknown error.";
}

// ─── Task Progress View ──────────────────────────────────────────

function TaskProgress({ url }: { url: string }) {
  const [task, setTask] = useState<TaskState>({
    url,
    steps: [
      { label: "URL Validated", status: "pending" },
      { label: "CLI Invoked", status: "pending" },
      { label: "Processing", status: "pending" },
      { label: "Result", status: "pending" },
    ],
    running: true,
  });
  const startedRef = useRef(false);

  function updateStep(index: number, status: StepStatus, detail?: string) {
    setTask((prev) => {
      const steps = [...prev.steps];
      steps[index] = { ...steps[index], status, detail };
      return { ...prev, steps };
    });
  }

  async function saveState(t: TaskState) {
    await LocalStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ url: t.url, savedAt: Date.now() }),
    );
  }

  async function clearState() {
    await LocalStorage.removeItem(STORAGE_KEY);
  }

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;

    (async () => {
      const preferences = getPreferenceValues<Preferences>();
      const toast = await showToast({
        style: Toast.Style.Animated,
        title: "Saving to Obsidian",
      });

      // Step 1: Validate URL
      let validatedUrl: string;
      try {
        validatedUrl = validateHttpUrl(url);
        updateStep(0, "done", validatedUrl);
        await saveState({ ...task, steps: [{ ...task.steps[0], status: "done" }] });
      } catch (e) {
        updateStep(0, "done", errorMessage(e));
        setTask((prev) => ({
          ...prev,
          running: false,
          error: errorMessage(e),
        }));
        toast.style = Toast.Style.Failure;
        toast.title = "Invalid URL";
        toast.message = errorMessage(e);
        await clearState();
        return;
      }

      // Step 2: Build CLI args
      const invocation = buildProcessArgs({
        projectPath: preferences.projectPath,
        runtime: preferences.runtime,
        url: validatedUrl,
        duplicatePolicy: preferences.duplicatePolicy,
        ossEnabled: preferences.ossEnabled !== false,
      });
      updateStep(1, "done", `${invocation.command} ${invocation.args.slice(0, 3).join(" ")}...`);

      // Step 3: Run CLI
      updateStep(2, "active", "Fetching content, generating note...");
      toast.message = validatedUrl;

      let result: ProcessResult;
      try {
        const timeoutMs = parseTimeoutMs(preferences.timeoutSeconds);
        const { stdout } = await execFileAsync(
          invocation.command,
          invocation.args,
          {
            cwd: invocation.cwd,
            timeout: timeoutMs,
            maxBuffer: 1024 * 1024 * 10,
          },
        );
        result = parseProcessResult(stdout);
      } catch (e) {
        updateStep(2, "done", "Failed");
        const msg = errorMessage(e);
        setTask((prev) => ({ ...prev, running: false, error: msg }));
        toast.style = Toast.Style.Failure;
        toast.title = "Save Failed";
        toast.message = msg;
        await clearState();
        return;
      }

      // Step 4: Show result
      updateStep(2, "done");
      const formatted = formatProcessResult(result);
      updateStep(3, result.ok ? "done" : "done", formatted.title);
      setTask((prev) => ({
        ...prev,
        running: false,
        result: { ok: result.ok, ...formatted },
      }));

      toast.style = result.ok ? Toast.Style.Success : Toast.Style.Failure;
      toast.title = formatted.title;
      toast.message = formatted.message;
      await clearState();
    })();
  }, []);

  const resultActions = task.result
    ? task.result.ok
      ? [
          <Action.CopyToClipboard
            key="copy-result"
            title="Copy Result"
            content={task.result.message}
          />,
          <Action.SubmitForm
            key="new-url"
            title="Save Another URL"
            onSubmit={() => {
              setTask({
                url: "",
                steps: [],
                running: false,
              });
            }}
          />,
        ]
      : [
          <Action.CopyToClipboard
            key="copy-error"
            title="Copy Error"
            content={task.result.message}
          />,
        ]
    : [];

  const errorActions = task.error
    ? [<Action.CopyToClipboard key="copy-error" title="Copy Error" content={task.error} />]
    : [];

  return (
    <Detail
      isLoading={task.running}
      markdown={buildMarkdown(task)}
      actions={
        <ActionPanel>
          {resultActions}
          {errorActions}
        </ActionPanel>
      }
    />
  );
}

// ─── URL Input Form ──────────────────────────────────────────────

function UrlForm() {
  const { push } = useNavigation();

  return (
    <Form
      actions={
        <ActionPanel>
          <Action.SubmitForm
            title="Save URL"
            icon={Icon.Download}
            onSubmit={(values: { url: string }) => {
              const url = values.url?.trim();
              if (url) {
                push(<TaskProgress url={url} />);
              }
            }}
          />
        </ActionPanel>
      }
    >
      <Form.TextField
        id="url"
        title="URL"
        placeholder="https://example.com/article"
        autoFocus
      />
    </Form>
  );
}

// ─── Main Command ────────────────────────────────────────────────

type Arguments = {
  url?: string;
};

export default function Command(
  props: { arguments: Arguments },
) {
  const urlArg = props.arguments.url?.trim();

  if (urlArg) {
    return <TaskProgress url={urlArg} />;
  }

  return <UrlFormWithResume />;
}

function UrlFormWithResume() {
  const { push } = useNavigation();
  const [resuming, setResuming] = useState(true);
  const [savedUrl, setSavedUrl] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const saved = await LocalStorage.getItem<string>(STORAGE_KEY);
      if (saved) {
        try {
          const parsed = JSON.parse(saved) as { url: string };
          if (parsed.url) {
            setSavedUrl(parsed.url);
          }
        } catch {
          // ignore invalid saved state
        }
      }
      setResuming(false);
    })();
  }, []);

  useEffect(() => {
    if (!resuming && savedUrl) {
      push(<TaskProgress url={savedUrl} />);
    }
  }, [resuming, savedUrl]);

  if (resuming) {
    return <Detail isLoading markdown="Checking for active tasks..." />;
  }

  return <UrlForm />;
}
