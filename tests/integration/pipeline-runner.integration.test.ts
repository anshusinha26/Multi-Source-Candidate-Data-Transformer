import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { atsJsonSourceAdapter } from "../../src/adapters/ats-json/ats-json.adapter.js";
import type { SourceAdapter } from "../../src/adapters/contracts/source-adapter.js";
import {
  resumePdfSourceAdapter,
  type ResumePdfAdapterInput
} from "../../src/adapters/resume-pdf/resume-pdf.adapter.js";
import { createPipelineRunner } from "../../src/app/pipeline-runner.js";
import { weightedConfidenceScorer } from "../../src/confidence/weighted-confidence.scorer.js";
import { atsJsonExtractor } from "../../src/extraction/ats-json.extractor.js";
import { resumePdfExtractor } from "../../src/extraction/resume-pdf.extractor.js";
import { deterministicMergePolicy } from "../../src/merge/deterministic-merge.policy.js";
import { profileProjector } from "../../src/projection/project-profile.js";
import type { ResumePdfSourceRecord } from "../../src/types/source-record.js";
import { fixturePath, loadFixtureJson } from "../helpers/load-fixture.js";

const readTextFile = async (path: string): Promise<string> => readFile(path, "utf8");
const readBinaryFile = async (path: string): Promise<Uint8Array> =>
  new Uint8Array(await readFile(path));

const fixedNow = (): Date => new Date("2026-06-30T10:00:00.000Z");

const resumeTextAdapter: SourceAdapter<ResumePdfAdapterInput, ResumePdfSourceRecord> = {
  kind: "resume_pdf",
  read(input, context) {
    return {
      ok: true,
      value: {
        sourceId: context.sourceId,
        kind: "resume_pdf",
        group: "unstructured",
        candidateReference: context.candidateReference,
        ingestedAt: context.ingestedAt,
        sourceOrder: context.sourceOrder,
        payload: {
          fileName: input.fileName,
          mimeType: "application/pdf",
          bytes: input.bytes
        }
      }
    };
  }
};

describe("pipeline integration", () => {
  it("runs full happy path deterministically and produces projected output", async () => {
    const expectedProjected = await loadFixtureJson<Record<string, unknown>>(
      "expected/custom-output.json"
    );

    const runner = createPipelineRunner({
      atsAdapter: atsJsonSourceAdapter,
      resumeAdapter: resumeTextAdapter,
      extractors: [atsJsonExtractor, resumePdfExtractor],
      mergePolicy: deterministicMergePolicy,
      confidenceScorer: weightedConfidenceScorer,
      projector: profileProjector,
      readTextFile,
      readBinaryFile,
      now: fixedNow
    });

    const input = {
      atsPath: fixturePath("ats/sample.json"),
      resumePath: fixturePath("resume/sample.txt"),
      configPath: fixturePath("config/custom-config.json"),
      outputPath: null
    } as const;

    const first = await runner.run(input);
    const second = await runner.run(input);

    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);

    if (!first.ok || !second.ok) {
      return;
    }

    expect(first.value.outputJson).toBe(second.value.outputJson);

    expect(first.value.canonicalProfile.fullName).toBe("Jane Doe");
    expect(first.value.canonicalProfile.provenance.length).toBeGreaterThan(0);
    expect(first.value.canonicalProfile.provenance.some((entry) => entry.sourceKind === "ats_json")).toBe(
      true
    );
    expect(
      first.value.canonicalProfile.provenance.some((entry) => entry.sourceKind === "resume_pdf")
    ).toBe(true);

    expect(first.value.canonicalProfile.overallConfidence.value).toBeGreaterThanOrEqual(0);
    expect(first.value.canonicalProfile.overallConfidence.value).toBeLessThanOrEqual(1);
    first.value.canonicalProfile.fieldConfidence.forEach((entry) => {
      expect(entry.score.value).toBeGreaterThanOrEqual(0);
      expect(entry.score.value).toBeLessThanOrEqual(1);
    });

    const projected = first.value.projectedOutput as Record<string, unknown>;
    expect(projected.candidate).toEqual(expectedProjected.candidate);
    expect(projected.contact).toEqual(expectedProjected.contact);
    expect(projected.profile).toEqual(expectedProjected.profile);
    expect(projected.overallConfidence).toEqual(expect.any(Number));
  });

  it("loads resume PDF source successfully when ATS source is valid", async () => {
    const runner = createPipelineRunner({
      atsAdapter: atsJsonSourceAdapter,
      resumeAdapter: resumePdfSourceAdapter,
      extractors: [atsJsonExtractor, resumePdfExtractor],
      mergePolicy: deterministicMergePolicy,
      confidenceScorer: weightedConfidenceScorer,
      projector: profileProjector,
      readTextFile,
      readBinaryFile,
      now: fixedNow
    });

    const result = await runner.run({
      atsPath: fixturePath("ats/sample.json"),
      resumePath: fixturePath("resume/sample.pdf"),
      configPath: fixturePath("config/custom-config.json"),
      outputPath: null
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(result.value.context.metadata.sourceLoaded).toBe(2);
    expect(result.value.context.metadata.sourceFailed).toBe(0);
    expect(
      result.value.context.diagnostics.errors.some((error) => error.code === "RESUME_PDF_PARSE_FAILED")
    ).toBe(false);

    const projected = result.value.projectedOutput as Record<string, unknown>;
    expect(projected.candidate).toEqual({
      id: "ats:sample.json",
      name: "Jane Doe"
    });
    expect((projected.contact as Record<string, unknown>).primaryPhone).toBe("+14155552671");
  });
});
