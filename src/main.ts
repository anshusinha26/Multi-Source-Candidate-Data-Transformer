/**
 * Composition root for CLI application.
 */

import { readFile, writeFile } from "node:fs/promises";
import { atsJsonSourceAdapter } from "./adapters/ats-json/ats-json.adapter.js";
import { resumePdfSourceAdapter } from "./adapters/resume-pdf/resume-pdf.adapter.js";
import { createPipelineRunner } from "./app/pipeline-runner.js";
import { runCli } from "./cli/index.js";
import { weightedConfidenceScorer } from "./confidence/weighted-confidence.scorer.js";
import { atsJsonExtractor } from "./extraction/ats-json.extractor.js";
import { resumePdfExtractor } from "./extraction/resume-pdf.extractor.js";
import { deterministicMergePolicy } from "./merge/deterministic-merge.policy.js";
import { profileProjector } from "./projection/project-profile.js";

const createRunner = () =>
  createPipelineRunner({
    atsAdapter: atsJsonSourceAdapter,
    resumeAdapter: resumePdfSourceAdapter,
    extractors: [atsJsonExtractor, resumePdfExtractor],
    mergePolicy: deterministicMergePolicy,
    confidenceScorer: weightedConfidenceScorer,
    projector: profileProjector,
    readTextFile: async (path: string) => readFile(path, "utf8"),
    readBinaryFile: async (path: string) => new Uint8Array(await readFile(path))
  });

/**
 * Main process bootstrap.
 */
export const main = async (): Promise<number> => {
  const pipelineRunner = createRunner();

  return runCli(process.argv.slice(2), {
    runPipeline: (input) => pipelineRunner.run(input),
    writeTextFile: async (path: string, content: string) => {
      await writeFile(path, content, "utf8");
    }
  });
};

void main()
  .then((exitCode) => {
    process.exitCode = exitCode;
  })
  .catch((error: unknown) => {
    process.stderr.write(
      `${
        error instanceof Error
          ? error.message
          : "Unexpected fatal failure while starting CLI."
      }\n`
    );
    process.exitCode = 1;
  });
