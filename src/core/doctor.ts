import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { resolveProcessConfig } from "../config/resolve-config.js";
import { OssUploader } from "../storage/oss-uploader.js";
import { listLinkCapabilities } from "../router/capabilities.js";

export type DoctorCheck = {
  id: string;
  label: string;
  status: "pass" | "warn" | "fail";
  message: string;
};

export type DoctorResult = {
  ok: boolean;
  checks: DoctorCheck[];
};

export async function runDoctor(input: { configPath?: string }): Promise<DoctorResult> {
  const checks: DoctorCheck[] = [];
  const resolved = await resolveProcessConfig({ configPath: input.configPath, cli: {} });

  if (!resolved.ok) {
    return {
      ok: false,
      checks: [
        {
          id: "config",
          label: "Configuration",
          status: "fail",
          message: resolved.error.message
        }
      ]
    };
  }

  checks.push({
    id: "config",
    label: "Configuration",
    status: resolved.loadedConfigFile ? "pass" : "warn",
    message: resolved.loadedConfigFile
      ? `Loaded ${resolved.configPath}`
      : `No config file loaded; using env and CLI defaults.`
  });

  const isOssOnly = resolved.config.storage.oss.enabled && resolved.config.storage.oss.mode === "only";

  if (isOssOnly) {
    checks.push({
      id: "vault",
      label: "Obsidian vault",
      status: "pass",
      message: "Skipped: OSS-only mode does not require a local vault."
    });
  } else {
    const probePath = path.join(resolved.config.obsidian.vaultPath, ".link-processing", ".doctor-write-test");
    try {
      const probeDir = path.dirname(probePath);
      await mkdir(probeDir, { recursive: true });
      await writeFile(probePath, "ok", "utf8");
      await rm(probePath, { force: true });
      checks.push({
        id: "vault",
        label: "Obsidian vault",
        status: "pass",
        message: `Writable: ${resolved.config.obsidian.vaultPath}`
      });
    } catch (error) {
      checks.push({
        id: "vault",
        label: "Obsidian vault",
        status: "fail",
        message: error instanceof Error ? error.message : "Vault write check failed."
      });
    }
  }

  checks.push({
    id: "llm-provider",
    label: "LLM provider",
    status: "pass",
    message: `Provider: ${resolved.config.llm.provider}`
  });

  if (resolved.config.llm.provider !== "mock" && !resolved.config.llm.apiKey) {
    checks.push({
      id: "llm-api-key",
      label: "LLM API key",
      status: "fail",
      message: "OPENAI_API_KEY or llm.apiKey is required for draft-revise and two-step."
    });
  } else {
    checks.push({
      id: "llm-api-key",
      label: "LLM API key",
      status: resolved.config.llm.provider === "mock" ? "warn" : "pass",
      message:
        resolved.config.llm.provider === "mock"
          ? "Mock provider does not call an LLM."
          : "API key configured."
    });
  }

  const oss = resolved.config.storage.oss;
  if (!oss.enabled) {
    checks.push({
      id: "oss",
      label: isOssOnly ? "OSS storage" : "OSS mirror",
      status: isOssOnly ? "fail" : "warn",
      message: isOssOnly
        ? "OSS-only mode requires OSS to be enabled and configured."
        : "OSS mirror is not configured; notes are saved locally only."
    });
  } else if (
    !oss.endpoint ||
    !oss.region ||
    !oss.bucket ||
    !oss.accessKeyId ||
    !oss.secretAccessKey
  ) {
    checks.push({
      id: "oss",
      label: isOssOnly ? "OSS storage" : "OSS mirror",
      status: "fail",
      message:
        "OSS is enabled but endpoint, region, bucket, and credentials must all be provided."
    });
  } else {
    try {
      const uploader = new OssUploader({
        endpoint: oss.endpoint,
        region: oss.region,
        bucket: oss.bucket,
        prefix: oss.prefix,
        accessKeyId: oss.accessKeyId,
        secretAccessKey: oss.secretAccessKey,
        forcePathStyle: oss.forcePathStyle
      });
      await uploader.head();
      checks.push({
        id: "oss",
        label: isOssOnly ? "OSS storage" : "OSS mirror",
        status: "pass",
        message: `Bucket reachable: ${oss.bucket} @ ${oss.endpoint}`
      });
    } catch (error) {
      checks.push({
        id: "oss",
        label: isOssOnly ? "OSS storage" : "OSS mirror",
        status: "fail",
        message: error instanceof Error ? error.message : "OSS head bucket failed."
      });
    }
  }

  const capabilities = listLinkCapabilities();
  const processable = Object.values(capabilities).filter((capability) => capability.canProcess).length;
  checks.push({
    id: "capabilities",
    label: "Link capabilities",
    status: "pass",
    message: `${processable} link types are processable; video is route-only.`
  });

  return {
    ok: checks.every((check) => check.status !== "fail"),
    checks
  };
}
