import {
  Action,
  ActionPanel,
  Color,
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
  formatCliExecutionError,
  formatProcessResult,
  runLinkProcessingCli,
  validateHttpUrl,
} from "./link-processing-cli.js";
import {
  type DashboardTask,
  type StepStatus,
  buildDashboardMarkdown,
  formatCliPreview,
  getCurrentStep,
  getDestinationLabel,
  getDuplicatePolicyLabel,
  getRuntimeLabel,
  getSourceHost,
  getSourceType,
  getStepStatusLabel,
  getTaskStatus,
  shortenMiddle,
} from "./save-url-view-model.js";

const STORAGE_KEY = "active-task";

type Preferences = {
  projectPath: string;
  runtime: Runtime;
  duplicatePolicy: DuplicatePolicy;
  ossEnabled?: boolean;
  nodePath?: string;
  timeoutSeconds: string;
};

type TaskState = DashboardTask;

function parseTimeoutMs(value: string): number {
  const seconds = Number.parseInt(value, 10);
  if (!Number.isFinite(seconds) || seconds <= 0) return 180_000;
  return seconds * 1000;
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return "未知错误。";
}

function quoteShellArg(value: string): string {
  if (/^[A-Za-z0-9_/:=@%+.,-]+$/.test(value)) {
    return value;
  }

  return JSON.stringify(value);
}

function formatCliCommand(command: string, args: string[]): string {
  return [command, ...args].map(quoteShellArg).join(" ");
}

function getResultPath(result: ProcessResult): string | undefined {
  if (!result.ok) {
    return undefined;
  }
  let resultPath: string | undefined;
  if ("skipped" in result && result.skipped) {
    resultPath = result.existingPath;
  } else {
    resultPath = result.obsidian?.path ?? result.obsidian?.relativePath;
  }
  return resultPath?.startsWith("/") ? resultPath : undefined;
}

function metadataColor(status: StepStatus): Color {
  switch (status) {
    case "done":
      return Color.Green;
    case "active":
      return Color.Blue;
    case "failed":
      return Color.Red;
    case "pending":
      return Color.SecondaryText;
  }
}

function metadataIcon(status: StepStatus): Icon {
  switch (status) {
    case "done":
      return Icon.CheckCircle;
    case "active":
      return Icon.CircleProgress50;
    case "failed":
      return Icon.XMarkCircle;
    case "pending":
      return Icon.Circle;
  }
}

function statusColor(tone: ReturnType<typeof getTaskStatus>["tone"]): Color {
  switch (tone) {
    case "green":
      return Color.Green;
    case "red":
      return Color.Red;
    case "blue":
      return Color.Blue;
  }
}

function TaskMetadata({ task }: { task: TaskState }) {
  const status = getTaskStatus(task);
  const currentStep = getCurrentStep(task);
  const config = task.config;

  return (
    <Detail.Metadata>
      <Detail.Metadata.TagList title="状态">
        <Detail.Metadata.TagList.Item
          text={status.label}
          color={statusColor(status.tone)}
        />
      </Detail.Metadata.TagList>
      <Detail.Metadata.Link
        title="来源"
        target={task.url}
        text={shortenMiddle(getSourceHost(task.url), 34)}
      />
      <Detail.Metadata.Label
        title="类型"
        text={getSourceType(task.url)}
        icon={{ source: Icon.Document, tintColor: Color.Blue }}
      />
      <Detail.Metadata.Separator />
      <Detail.Metadata.Label
        title="当前步骤"
        text={currentStep?.label ?? "准备中"}
        icon={{
          source: currentStep ? metadataIcon(currentStep.status) : Icon.Circle,
          tintColor: currentStep
            ? metadataColor(currentStep.status)
            : Color.SecondaryText,
        }}
      />
      <Detail.Metadata.TagList title="流程">
        {task.steps.map((step) => (
          <Detail.Metadata.TagList.Item
            key={step.label}
            text={`${step.label}: ${getStepStatusLabel(step.status)}`}
            color={metadataColor(step.status)}
          />
        ))}
      </Detail.Metadata.TagList>
      <Detail.Metadata.Separator />
      <Detail.Metadata.Label
        title="运行方式"
        text={getRuntimeLabel(config?.runtime)}
        icon={{ source: Icon.Hammer, tintColor: Color.SecondaryText }}
      />
      <Detail.Metadata.Label
        title="保存位置"
        text={getDestinationLabel(config)}
        icon={{
          source: config?.ossEnabled ? Icon.Cloud : Icon.HardDrive,
          tintColor: Color.Blue,
        }}
      />
      <Detail.Metadata.Label
        title="重复链接"
        text={getDuplicatePolicyLabel(config?.duplicatePolicy)}
        icon={{ source: Icon.Document, tintColor: Color.SecondaryText }}
      />
      <Detail.Metadata.Label
        title="超时"
        text={config ? `${config.timeoutSeconds}s` : "180s"}
        icon={{ source: Icon.Clock, tintColor: Color.SecondaryText }}
      />
      <Detail.Metadata.Separator />
      <Detail.Metadata.Label
        title="项目"
        text={config ? shortenMiddle(config.projectPath, 44) : "解析项目中"}
        icon={{ source: Icon.Folder, tintColor: Color.SecondaryText }}
      />
      <Detail.Metadata.Label
        title="CLI"
        text={formatCliPreview(config?.cliCommand)}
        icon={{ source: Icon.Code, tintColor: Color.SecondaryText }}
      />
    </Detail.Metadata>
  );
}

// ─── Task Progress View ──────────────────────────────────────────

function TaskProgress({ url }: { url: string }) {
  const { push } = useNavigation();
  const [task, setTask] = useState<TaskState>({
    url,
    steps: [
      { label: "校验链接", status: "pending" },
      { label: "准备命令", status: "pending" },
      { label: "处理内容", status: "pending" },
      { label: "返回结果", status: "pending" },
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
        title: "正在保存到 Obsidian",
      });

      // Step 1: Validate URL
      let validatedUrl: string;
      try {
        validatedUrl = validateHttpUrl(url);
        updateStep(0, "done", shortenMiddle(validatedUrl, 72));
        await saveState({
          ...task,
          steps: [{ ...task.steps[0], status: "done" }],
        });
      } catch (e) {
        updateStep(0, "failed", errorMessage(e));
        setTask((prev) => ({
          ...prev,
          running: false,
          error: errorMessage(e),
        }));
        toast.style = Toast.Style.Failure;
        toast.title = "链接无效";
        toast.message = errorMessage(e);
        await clearState();
        return;
      }

      // Step 2: Build CLI args
      const cliInput = {
        projectPath: preferences.projectPath,
        runtime: preferences.runtime,
        url: validatedUrl,
        duplicatePolicy: preferences.duplicatePolicy,
        ossEnabled: preferences.ossEnabled !== false,
        nodePath: preferences.nodePath || undefined,
      };
      const invocation = buildProcessArgs(cliInput);
      const cliCommand = formatCliCommand(invocation.command, invocation.args);
      setTask((prev) => ({
        ...prev,
        config: {
          projectPath: preferences.projectPath,
          runtime: preferences.runtime,
          duplicatePolicy: preferences.duplicatePolicy,
          ossEnabled: preferences.ossEnabled !== false,
          timeoutSeconds: preferences.timeoutSeconds,
          cliCommand,
        },
      }));
      updateStep(1, "done", getRuntimeLabel(preferences.runtime));

      // Step 3: Run CLI
      updateStep(2, "active", "抓取内容并生成笔记");
      toast.message = validatedUrl;

      let result: ProcessResult;
      try {
        const timeoutMs = parseTimeoutMs(preferences.timeoutSeconds);
        result = await runLinkProcessingCli(cliInput, timeoutMs);
      } catch (e) {
        updateStep(2, "failed", "执行失败");
        updateStep(3, "failed", "未返回结果");
        const msg = formatCliExecutionError(e);
        setTask((prev) => ({ ...prev, running: false, error: msg }));
        toast.style = Toast.Style.Failure;
        toast.title = "保存失败";
        toast.message = msg;
        await clearState();
        return;
      }

      // Step 4: Show result
      updateStep(2, "done");
      const formatted = formatProcessResult(result);
      updateStep(3, result.ok ? "done" : "failed", formatted.title);
      setTask((prev) => ({
        ...prev,
        running: false,
        result: { ok: result.ok, ...formatted, path: getResultPath(result) },
      }));

      toast.style = result.ok ? Toast.Style.Success : Toast.Style.Failure;
      toast.title = formatted.title;
      toast.message = formatted.message;
      await clearState();
    })();
  }, []);

  return (
    <Detail
      isLoading={task.running}
      markdown={buildDashboardMarkdown(task)}
      metadata={<TaskMetadata task={task} />}
      actions={
        <ActionPanel>
          <ActionPanel.Section title="来源">
            <Action.OpenInBrowser
              title="打开原链接"
              url={task.url}
              icon={Icon.Globe}
            />
            <Action.CopyToClipboard
              title="复制原链接"
              content={task.url}
              icon={Icon.Link}
            />
          </ActionPanel.Section>
          <ActionPanel.Section title="结果">
            {task.result?.path ? (
              <Action.ShowInFinder
                title="显示已保存笔记"
                path={task.result.path}
              />
            ) : null}
            {task.result ? (
              <Action.CopyToClipboard
                title={task.result.ok ? "复制结果" : "复制失败信息"}
                content={task.result.message}
                icon={Icon.Clipboard}
              />
            ) : null}
            {task.error ? (
              <Action.CopyToClipboard
                title="复制错误"
                content={task.error}
                icon={Icon.ExclamationMark}
              />
            ) : null}
            <Action
              title="保存另一个链接"
              icon={Icon.PlusCircle}
              onAction={() => push(<UrlForm />)}
            />
          </ActionPanel.Section>
          <ActionPanel.Section title="诊断">
            {task.config?.cliCommand ? (
              <Action.CopyToClipboard
                title="复制完整 CLI 命令"
                content={task.config.cliCommand}
                icon={Icon.Terminal}
              />
            ) : null}
            {task.config?.projectPath ? (
              <Action.ShowInFinder
                title="显示项目目录"
                path={task.config.projectPath}
                icon={Icon.Folder}
              />
            ) : null}
          </ActionPanel.Section>
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
            title="保存链接"
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
        title="链接"
        placeholder="粘贴 http/https 链接"
        autoFocus
      />
    </Form>
  );
}

// ─── Main Command ────────────────────────────────────────────────

type Arguments = {
  url?: string;
};

export default function Command(props: { arguments: Arguments }) {
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
    return <Detail isLoading markdown="正在检查进行中的任务..." />;
  }

  return <UrlForm />;
}
