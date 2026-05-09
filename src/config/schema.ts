import { z } from "zod";

export const configSchema = z.object({
  obsidian: z.object({
    vaultPath: z.string().min(1),
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
    provider: z.enum(["mock", "two-step"]).default("two-step"),
    model: z.string().default("mock"),
    baseUrl: z.string().url().optional(),
    apiKey: z.string().optional()
  }),
  logging: z.object({
    level: z.enum(["debug", "info", "warn", "error"]).default("info")
  })
});

export type LinkProcessingConfig = z.infer<typeof configSchema>;
