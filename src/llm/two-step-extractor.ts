import type { ExtractNoteInput, NoteExtractor } from "./note-extractor.js";
import type { ProcessedNote } from "./schema.js";
import { Step1Analyzer, type Step1AnalyzerOptions } from "./step1-analyzer.js";
import { Step2Generator, type Step2GeneratorOptions } from "./step2-generator.js";

export type TwoStepExtractorOptions = {
  step1: Step1AnalyzerOptions;
  step2: Step2GeneratorOptions;
  onProgress?: (step: string) => void;
};

export class TwoStepExtractor implements NoteExtractor {
  private step1Analyzer: Step1Analyzer;
  private step2Generator: Step2Generator;
  private onProgress?: (step: string) => void;

  constructor(options: TwoStepExtractorOptions) {
    this.step1Analyzer = new Step1Analyzer(options.step1);
    this.step2Generator = new Step2Generator(options.step2);
    this.onProgress = options.onProgress;
  }

  async extract(input: ExtractNoteInput): Promise<ProcessedNote> {
    this.onProgress?.("analyzing");
    const analysis = await this.step1Analyzer.analyze({
      sourceUrl: input.sourceUrl,
      linkType: input.linkType,
      title: input.title,
      author: input.author,
      rawText: input.rawText
    });

    this.onProgress?.("generating");
    const note = await this.step2Generator.generate(
      { sourceUrl: input.sourceUrl, linkType: input.linkType, rawText: input.rawText },
      analysis
    );

    return note;
  }
}
