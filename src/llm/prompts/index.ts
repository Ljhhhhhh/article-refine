import type { ContentType } from "../schema.js";
import { STEP2_TECH_DEEP } from "./step2-tech-deep.js";
import { STEP2_OPINION } from "./step2-opinion.js";
import { STEP2_TUTORIAL } from "./step2-tutorial.js";
import { STEP2_NEWS } from "./step2-news.js";
import { STEP2_GENERAL } from "./step2-general.js";

const STEP2_PROMPTS: Record<ContentType, string> = {
  技术深度: STEP2_TECH_DEEP,
  观点思考: STEP2_OPINION,
  教程学习: STEP2_TUTORIAL,
  资讯动态: STEP2_NEWS,
  综合: STEP2_GENERAL,
};

export function getStep2Prompt(contentType: ContentType): string {
  return STEP2_PROMPTS[contentType];
}
