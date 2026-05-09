import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { resolveProcessConfig } from "../config/resolve-config.js";
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

  try {
    const probeDir = path.join(resolved.config.obsidian.vaultPath, ".link-processing");
    await mkdir(probeDir, { recursive: true });
    await writeFile(path.join(probeDir, ".doctor-write-test"), "ok", "utf8");
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
