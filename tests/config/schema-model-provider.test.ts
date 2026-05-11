import { describe, expect, test } from "vitest";
import { configSchema } from "../../src/config/schema.js";
import { defaultConfig } from "../../src/config/load-config.js";

function baseConfig() {
  return defaultConfig("/tmp/vault");
}

describe("configSchema modelProvider", () => {
  test("accepts modelProvider: siliconflow", () => {
    const result = configSchema.parse({
      ...baseConfig(),
      llm: { ...baseConfig().llm, modelProvider: "siliconflow" }
    });
    expect(result.llm.modelProvider).toBe("siliconflow");
  });

  test("accepts modelProvider: openrouter", () => {
    const result = configSchema.parse({
      ...baseConfig(),
      llm: { ...baseConfig().llm, modelProvider: "openrouter" }
    });
    expect(result.llm.modelProvider).toBe("openrouter");
  });

  test("accepts modelProvider: custom-openai-compatible", () => {
    const result = configSchema.parse({
      ...baseConfig(),
      llm: { ...baseConfig().llm, modelProvider: "custom-openai-compatible" }
    });
    expect(result.llm.modelProvider).toBe("custom-openai-compatible");
  });

  test("accepts config without modelProvider (backward compat)", () => {
    const config = baseConfig();
    const result = configSchema.parse(config);
    expect(result.llm.modelProvider).toBeUndefined();
  });

  test("rejects invalid modelProvider value", () => {
    expect(() =>
      configSchema.parse({
        ...baseConfig(),
        llm: { ...baseConfig().llm, modelProvider: "invalid-provider" }
      })
    ).toThrow();
  });

  test("old config shape without modelProvider still parses", () => {
    const oldConfig = {
      ...baseConfig(),
      llm: {
        provider: "draft-revise",
        model: "gpt-4",
        longContentThreshold: 32000
      }
    };
    const result = configSchema.parse(oldConfig);
    expect(result.llm.modelProvider).toBeUndefined();
    expect(result.llm.model).toBe("gpt-4");
  });
});
