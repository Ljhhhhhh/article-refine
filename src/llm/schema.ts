import { z } from "zod";

export const contentTypeSchema = z.enum([
  "技术深度",
  "观点思考",
  "教程学习",
  "资讯动态",
  "综合"
]);

export const processedNoteSchema = z.object({
  title: z.string().min(1),
  contentType: contentTypeSchema.default("综合"),
  tags: z
    .array(z.string())
    .transform((arr) => arr.map((t) => (t.startsWith("#") ? t : `#${t}`)).slice(0, 8))
    .pipe(z.array(z.string()).min(1)),
  knowledgeConnections: z.array(z.string()).default([]),
  clickbaitIndex: z.number().int().min(1).max(10).default(5),
  body: z.string().min(1)
});

export type ProcessedNote = z.infer<typeof processedNoteSchema>;
export type ContentType = z.infer<typeof contentTypeSchema>;
