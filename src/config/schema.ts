import { z } from "zod";

export const modelProviderSchema = z.enum([
  "siliconflow",
  "openrouter",
  "custom-openai-compatible"
]);
export type ModelProvider = z.infer<typeof modelProviderSchema>;

export const normalizedLlmProviderSchema = z
  .enum(["mock", "draft-revise", "two-step", "openai"])
  .transform((provider): "mock" | "draft-revise" | "two-step" =>
    provider === "openai" ? "draft-revise" : provider
  );

export const ossConfigSchema = z.object({
  enabled: z.boolean().default(false),
  endpoint: z.string().url().optional(),
  region: z.string().optional(),
  bucket: z.string().optional(),
  prefix: z.string().default(""),
  accessKeyId: z.string().optional(),
  secretAccessKey: z.string().optional(),
  forcePathStyle: z.boolean().default(false),
  mode: z.enum(["mirror", "only"]).default("mirror"),
  strict: z.boolean().default(false)
});

export const storageConfigSchema = z
  .object({
    oss: ossConfigSchema.default({
      enabled: false,
      prefix: "",
      forcePathStyle: false,
      mode: "mirror",
      strict: false
    })
  })
  .default({
    oss: {
      enabled: false,
      prefix: "",
      forcePathStyle: false,
      mode: "mirror",
      strict: false
    }
  });

export const configSchema = z.object({
  obsidian: z.object({
    vaultPath: z.string().default(""),
    categories: z.object({
      technology: z.literal("技术深度"),
      opinion: z.literal("观点思考"),
      news: z.literal("资讯动态"),
      tutorial: z.literal("教程学习"),
      general: z.literal("综合")
    })
  }),
  processing: z.object({
    qualityThreshold: z.number().int().positive().default(300),
    defaultFormat: z.literal("standard").default("standard"),
    timeoutSeconds: z.number().int().positive().default(120),
    retryCount: z.number().int().nonnegative().default(3)
  }),
  llm: z.object({
    provider: normalizedLlmProviderSchema.default("draft-revise"),
    modelProvider: modelProviderSchema.optional(),
    model: z.string().default("mock"),
    draftModel: z.string().optional(),
    reviseModel: z.string().optional(),
    baseUrl: z.string().url().optional(),
    apiKey: z.string().optional(),
    longContentThreshold: z.number().int().positive().default(32000)
  }),
  logging: z.object({
    level: z.enum(["debug", "info", "warn", "error"]).default("info")
  }),
  storage: storageConfigSchema
});

export type LinkProcessingConfig = z.infer<typeof configSchema>;
