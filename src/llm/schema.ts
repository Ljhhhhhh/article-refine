import { z } from "zod";

export const contentTypeSchema = z.enum(["技术深度", "观点思考", "教程学习", "资讯动态", "综合"]);

// Step 1 analysis output
export const step1AnalysisSchema = z.object({
  contentType: contentTypeSchema.default("综合"),
  title: z.string().min(1),
  coreArguments: z.array(z.string()).min(1).max(5).default([]),
  keyEntities: z.array(z.string()).default([]),
  writingStyle: z.string().default(""),
  targetAudience: z.string().default(""),
  suggestedTags: z
    .array(z.string())
    .transform((arr) => arr.map((t) => t.startsWith("#") ? t : `#${t}`).slice(0, 6))
    .pipe(z.array(z.string()).min(1))
    .default(["#综合"]),
});

export type Step1Analysis = z.infer<typeof step1AnalysisSchema>;

// Coerce string keyPoints to {title, detail} objects
const keyPointSchema = z.preprocess(
  (val) => {
    if (typeof val === "string") {
      return { title: val.slice(0, 30), detail: val };
    }
    return val;
  },
  z.object({
    title: z.string().min(1),
    detail: z.string().min(1)
  })
);

// Final processed note
export const processedNoteSchema = z.object({
  title: z.string().min(1),
  contentType: contentTypeSchema.default("综合"),
  summary: z.string().min(1),
  keyPoints: z.array(keyPointSchema).min(1).max(7),
  technicalAnalysis: z
    .object({
      architecture: z.string().optional(),
      mechanism: z.string().optional(),
      performance: z.string().optional(),
      deployment: z.string().optional()
    })
    .nullable()
    .optional(),
  argumentStructure: z
    .object({
      mainClaim: z.string(),
      supportingArguments: z.array(z.string())
    })
    .nullable()
    .optional(),
  prerequisites: z.array(z.string()).nullable().optional(),
  expectedOutcome: z.string().nullable().optional(),
  knowledgeConnections: z.array(z.string()).default([]),
  tags: z.array(z.string()).transform((arr) => arr.map((t) => t.startsWith("#") ? t : `#${t}`).slice(0, 6)).pipe(z.array(z.string()).min(1))
});

export type ProcessedNote = z.infer<typeof processedNoteSchema>;
export type ContentType = z.infer<typeof contentTypeSchema>;
