import { z } from "zod";

export const contentTypeSchema = z.enum(["技术深度", "观点思考", "教程学习", "资讯动态", "综合"]);
export const qualityLevelSchema = z.enum(["high", "medium", "low"]);
export const recommendedSaveSchema = z.enum(["strong", "normal", "reference"]);

// Step 1 analysis output
export const step1AnalysisSchema = z.object({
  contentType: contentTypeSchema,
  title: z.string().min(1),
  coreArguments: z.array(z.string()).min(1).max(5),
  keyEntities: z.array(z.string()),
  writingStyle: z.string(),
  targetAudience: z.string(),
  quality: z.object({
    informationDensity: qualityLevelSchema,
    originality: qualityLevelSchema,
    practicality: qualityLevelSchema,
  }),
  suggestedTags: z.array(z.string().startsWith("#")).min(2).max(6),
});

export type Step1Analysis = z.infer<typeof step1AnalysisSchema>;

// Final processed note
export const processedNoteSchema = z.object({
  title: z.string().min(1),
  contentType: contentTypeSchema,
  summary: z.string().min(1),
  keyPoints: z
    .array(
      z.object({
        title: z.string().min(1),
        detail: z.string().min(1)
      })
    )
    .min(3)
    .max(7),
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
  quality: z.object({
    informationDensity: qualityLevelSchema,
    originality: qualityLevelSchema,
    practicality: qualityLevelSchema,
    recommendedSave: recommendedSaveSchema
  }),
  tags: z.array(z.string().startsWith("#")).min(2).max(6)
});

export type ProcessedNote = z.infer<typeof processedNoteSchema>;
export type ContentType = z.infer<typeof contentTypeSchema>;
