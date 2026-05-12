import {
  Clipboard,
  LaunchProps,
  Toast,
  getPreferenceValues,
  showToast,
} from "@raycast/api";
import {
  DuplicatePolicy,
  Runtime,
  formatProcessResult,
  runLinkProcessingCli,
  validateHttpUrl,
} from "./link-processing-cli.js";

type Arguments = {
  url: string;
};

type Preferences = {
  projectPath: string;
  runtime: Runtime;
  duplicatePolicy: DuplicatePolicy;
  ossEnabled?: boolean;
  timeoutSeconds: string;
};

function parseTimeoutMs(value: string): number {
  const seconds = Number.parseInt(value, 10);
  if (!Number.isFinite(seconds) || seconds <= 0) return 180_000;
  return seconds * 1000;
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return "Unknown error.";
}

export default async function Command(
  props: LaunchProps<{ arguments: Arguments }>,
) {
  const preferences = getPreferenceValues<Preferences>();
  const toast = await showToast({
    style: Toast.Style.Animated,
    title: "Saving to Obsidian",
  });

  try {
    const url = validateHttpUrl(props.arguments.url);
    toast.message = url;

    const result = await runLinkProcessingCli(
      {
        projectPath: preferences.projectPath,
        runtime: preferences.runtime,
        url,
        duplicatePolicy: preferences.duplicatePolicy,
        ossEnabled: preferences.ossEnabled !== false,
      },
      parseTimeoutMs(preferences.timeoutSeconds),
    );

    const formatted = formatProcessResult(result);
    toast.title = formatted.title;
    toast.message = formatted.message;
    toast.style = result.ok ? Toast.Style.Success : Toast.Style.Failure;

    if (!result.ok) {
      toast.primaryAction = {
        title: "Copy Error",
        onAction: () => Clipboard.copy(formatted.message),
      };
    }
  } catch (error) {
    const message = errorMessage(error);
    toast.title = "Save Failed";
    toast.message = message;
    toast.style = Toast.Style.Failure;
    toast.primaryAction = {
      title: "Copy Error",
      onAction: () => Clipboard.copy(message),
    };
  }
}
