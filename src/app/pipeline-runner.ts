/**
 * Application pipeline runner that orchestrates all business modules.
 */

import { basename } from "node:path";
import type { AtsJsonAdapterInput } from "../adapters/ats-json/ats-json.adapter.js";
import type {
  SourceAdapter,
  SourceAdapterContext
} from "../adapters/contracts/source-adapter.js";
import type { ResumePdfAdapterInput } from "../adapters/resume-pdf/resume-pdf.adapter.js";
import type { ConfidenceScorer } from "../confidence/contracts/confidence-scorer.js";
import type { Extractor } from "../extraction/contracts/extractor.js";
import { collectCandidateFacts } from "../extraction/fact-collector.js";
import type { MergePolicy } from "../merge/contracts/merge-policy.js";
import { normalizeCandidateFacts } from "../normalization/normalize-facts.js";
import type { ProjectedOutput, Projector } from "../projection/contracts/projector.js";
import type { CandidateFact } from "../types/candidate-fact.js";
import type { CanonicalProfile } from "../types/canonical-profile.js";
import type {
  MergeError,
  ParseError,
  PipelineError,
  ProjectionError,
  ValidationError
} from "../types/errors.js";
import type { ProjectionConfig, ProjectionNormalization } from "../types/projection-config.js";
import type {
  AtsJsonSourceRecord,
  JsonValue,
  ResumePdfSourceRecord,
  SourceRecord
} from "../types/source-record.js";
import { validateCanonical } from "../validation/validate-canonical.js";
import { validateProjectedOutput } from "../validation/validate-projected-output.js";
import { validateProjectionConfig } from "../validation/validate-projection-config.js";
import {
  createPipelineContext,
  finalizePipelineContext,
  type PipelineContext,
  type PipelineInputPaths,
  type PipelineStage,
  withError,
  withMetadata,
  withRuntimeConfig,
  withStageDiagnostic,
  withWarning
} from "./pipeline-context.js";

/**
 * Typed application result container.
 */
export type PipelineResult<TValue, TError> =
  | {
      readonly ok: true;
      readonly value: TValue;
    }
  | {
      readonly ok: false;
      readonly error: TError;
    };

/**
 * Pipeline runner input paths.
 */
export interface PipelineRunnerInput {
  readonly atsPath: string;
  readonly resumePath: string;
  readonly configPath: string;
  readonly outputPath: string | null;
}

/**
 * Successful pipeline payload.
 */
export interface PipelineRunnerSuccess {
  readonly context: PipelineContext;
  readonly canonicalProfile: CanonicalProfile;
  readonly projectedOutput: ProjectedOutput;
  readonly outputJson: string;
  readonly facts: readonly CandidateFact[];
  readonly normalizedFacts: readonly CandidateFact[];
}

/**
 * Failed pipeline payload.
 */
export interface PipelineRunnerFailure {
  readonly context: PipelineContext;
  readonly error: PipelineError;
}

/**
 * Pipeline runner output.
 */
export type PipelineRunnerResult = PipelineResult<PipelineRunnerSuccess, PipelineRunnerFailure>;

/**
 * Dependencies required by pipeline runner.
 */
export interface PipelineRunnerDependencies {
  readonly atsAdapter: SourceAdapter<AtsJsonAdapterInput, AtsJsonSourceRecord>;
  readonly resumeAdapter: SourceAdapter<ResumePdfAdapterInput, ResumePdfSourceRecord>;
  readonly extractors: readonly Extractor[];
  readonly mergePolicy: MergePolicy;
  readonly confidenceScorer: ConfidenceScorer;
  readonly projector: Projector;
  readonly readTextFile: (path: string) => Promise<string>;
  readonly readBinaryFile: (path: string) => Promise<Uint8Array>;
  readonly now?: () => Date;
}

const NORMALIZATION_DIRECTIVE_ALIAS: Readonly<Record<string, ProjectionNormalization>> = {
  e164: "E164",
  "yyyy-mm": "YYYY-MM",
  "iso-3166-alpha-2": "ISO-3166-alpha-2",
  iso3166alpha2: "ISO-3166-alpha-2",
  canonical: "canonical"
};

const isObjectRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const nowIso = (now: () => Date): string => now().toISOString();

const updateStage = (
  context: PipelineContext,
  stage: PipelineStage,
  status: "success" | "error",
  startedAtIso: string,
  startedAtMs: number,
  message: string | null,
  now: () => Date
): PipelineContext => {
  const finishedAt = now();
  const durationMs = Math.max(0, finishedAt.getTime() - startedAtMs);
  return withStageDiagnostic(context, {
    stage,
    status,
    startedAt: startedAtIso,
    finishedAt: finishedAt.toISOString(),
    durationMs,
    message
  });
};

const incrementMetadata = (
  context: PipelineContext,
  delta: Partial<PipelineContext["metadata"]>
): PipelineContext =>
  withMetadata(context, {
    sourceAttempted: context.metadata.sourceAttempted + (delta.sourceAttempted ?? 0),
    sourceLoaded: context.metadata.sourceLoaded + (delta.sourceLoaded ?? 0),
    sourceFailed: context.metadata.sourceFailed + (delta.sourceFailed ?? 0),
    factsExtracted: context.metadata.factsExtracted + (delta.factsExtracted ?? 0),
    factsNormalized: context.metadata.factsNormalized + (delta.factsNormalized ?? 0)
  });

const createValidationError = (
  code: string,
  message: string,
  details: JsonValue | null,
  fieldPath: string | null = null
): ValidationError => ({
  kind: "ValidationError",
  stage: "validation",
  code,
  message,
  timestamp: new Date().toISOString(),
  sourceKind: null,
  sourceId: null,
  fieldPath,
  details,
  cause: null,
  retryable: false
});

const createParseError = (
  code: string,
  message: string,
  sourceKind: ParseError["sourceKind"],
  sourceId: string,
  details: JsonValue | null
): ParseError => ({
  kind: "ParseError",
  stage: "parse",
  code,
  message,
  timestamp: new Date().toISOString(),
  sourceKind,
  sourceId,
  fieldPath: null,
  details,
  cause: null,
  retryable: false
});

const createMergeError = (
  code: string,
  message: string,
  details: JsonValue | null
): MergeError => ({
  kind: "MergeError",
  stage: "merge",
  code,
  message,
  timestamp: new Date().toISOString(),
  sourceKind: null,
  sourceId: null,
  fieldPath: null,
  details,
  cause: null,
  retryable: false
});

const createProjectionError = (
  code: string,
  message: string,
  details: JsonValue | null,
  fieldPath: string
): ProjectionError => ({
  kind: "ProjectionError",
  stage: "projection",
  code,
  message,
  timestamp: new Date().toISOString(),
  sourceKind: null,
  sourceId: null,
  fieldPath,
  details,
  cause: null,
  retryable: false
});

const isPipelineError = (value: unknown): value is PipelineError => {
  if (!isObjectRecord(value)) {
    return false;
  }
  return (
    typeof value.kind === "string" &&
    typeof value.stage === "string" &&
    typeof value.code === "string" &&
    typeof value.message === "string"
  );
};

const coerceNormalizeDirectives = (value: unknown): readonly unknown[] => {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.map((item) => {
    if (typeof item !== "string") {
      return item;
    }
    const normalized = NORMALIZATION_DIRECTIVE_ALIAS[item.trim().toLowerCase()];
    return normalized ?? item;
  });
};

const coerceProjectionFieldPayload = (value: unknown): unknown => {
  if (!isObjectRecord(value)) {
    return value;
  }

  const rawFrom = value.from;
  const rawMapping = value.mapping;
  const resolvedMapping =
    rawMapping === "direct" || rawMapping === "mapped"
      ? rawMapping
      : typeof rawFrom === "string"
        ? "mapped"
        : "direct";

  return {
    path: value.path,
    type: value.type,
    required: typeof value.required === "boolean" ? value.required : false,
    normalize: coerceNormalizeDirectives(value.normalize),
    mapping: resolvedMapping,
    from: resolvedMapping === "mapped" ? rawFrom : null
  };
};

const coerceProjectionConfigPayload = (input: unknown): unknown => {
  if (!isObjectRecord(input)) {
    return input;
  }

  return {
    fields: Array.isArray(input.fields)
      ? input.fields.map((item) => coerceProjectionFieldPayload(item))
      : input.fields,
    includeConfidence:
      typeof input.includeConfidence === "boolean"
        ? input.includeConfidence
        : input.include_confidence,
    includeProvenance:
      typeof input.includeProvenance === "boolean"
        ? input.includeProvenance
        : input.include_provenance,
    onMissing: input.onMissing ?? input.on_missing
  };
};

const toPipelineInputPaths = (input: PipelineRunnerInput): PipelineInputPaths => ({
  atsPath: input.atsPath,
  resumePath: input.resumePath,
  configPath: input.configPath,
  outputPath: input.outputPath
});

const toFailure = (
  context: PipelineContext,
  error: PipelineError,
  now: () => Date
): PipelineRunnerResult => ({
  ok: false,
  error: {
    context: finalizePipelineContext(context, nowIso(now)),
    error
  }
});

const toSourceAdapterContext = (
  sourceId: string,
  sourceOrder: number,
  ingestedAt: string
): SourceAdapterContext => ({
  sourceId,
  sourceOrder,
  ingestedAt,
  candidateReference: null
});

/**
 * Creates a deterministic pipeline runner that composes existing modules.
 */
export const createPipelineRunner = (
  dependencies: PipelineRunnerDependencies
): {
  run(input: PipelineRunnerInput): Promise<PipelineRunnerResult>;
} => {
  const now = dependencies.now ?? (() => new Date());

  return {
    async run(input: PipelineRunnerInput): Promise<PipelineRunnerResult> {
      const startIso = nowIso(now);
      let context = createPipelineContext(toPipelineInputPaths(input), startIso);

      let runtimeConfigPayload: unknown;
      let runtimeConfig: ProjectionConfig;
      let atsSource: AtsJsonSourceRecord | null = null;
      let resumeSource: ResumePdfSourceRecord | null = null;
      let facts: readonly CandidateFact[] = [];
      let normalizedFacts: readonly CandidateFact[] = [];
      let canonical: CanonicalProfile;
      let scoredCanonical: CanonicalProfile;
      let projectedOutput: ProjectedOutput;
      let validatedProjectedOutput: ProjectedOutput;

      {
        const stage: PipelineStage = "load_runtime_config";
        const stageStarted = now();
        try {
          const rawConfigText = await dependencies.readTextFile(input.configPath);
          runtimeConfigPayload = JSON.parse(rawConfigText) as unknown;
          context = updateStage(
            context,
            stage,
            "success",
            stageStarted.toISOString(),
            stageStarted.getTime(),
            null,
            now
          );
        } catch (error) {
          const validationError = createValidationError(
            "PIPELINE_RUNTIME_CONFIG_LOAD_FAILED",
            "Failed to load runtime config.",
            {
              configPath: input.configPath,
              reason: error instanceof Error ? error.message : "Unknown runtime config load failure."
            }
          );
          context = withError(context, validationError);
          context = updateStage(
            context,
            stage,
            "error",
            stageStarted.toISOString(),
            stageStarted.getTime(),
            validationError.message,
            now
          );
          return toFailure(context, validationError, now);
        }
      }

      {
        const stage: PipelineStage = "validate_config";
        const stageStarted = now();
        try {
          const normalizedPayload = coerceProjectionConfigPayload(runtimeConfigPayload);
          runtimeConfig = validateProjectionConfig(normalizedPayload);
          context = withRuntimeConfig(context, runtimeConfig);
          context = updateStage(
            context,
            stage,
            "success",
            stageStarted.toISOString(),
            stageStarted.getTime(),
            null,
            now
          );
        } catch (error) {
          const validationError: ValidationError = isPipelineError(error)
            ? (error as ValidationError)
            : createValidationError(
                "PIPELINE_RUNTIME_CONFIG_INVALID",
                "Runtime config validation failed.",
                {
                  reason:
                    error instanceof Error ? error.message : "Unknown runtime config validation failure."
                }
              );
          context = withError(context, validationError);
          context = updateStage(
            context,
            stage,
            "error",
            stageStarted.toISOString(),
            stageStarted.getTime(),
            validationError.message,
            now
          );
          return toFailure(context, validationError, now);
        }
      }

      {
        const stage: PipelineStage = "load_ats_json";
        const stageStarted = now();
        context = incrementMetadata(context, {
          sourceAttempted: 1
        });

        const sourceId = `ats:${basename(input.atsPath)}`;
        const sourceContext = toSourceAdapterContext(sourceId, 1, stageStarted.toISOString());

        try {
          const atsRaw = await dependencies.readTextFile(input.atsPath);
          const adapterResult = await dependencies.atsAdapter.read(atsRaw, sourceContext);
          if (adapterResult.ok) {
            atsSource = adapterResult.value;
            context = incrementMetadata(context, {
              sourceLoaded: 1
            });
            context = updateStage(
              context,
              stage,
              "success",
              stageStarted.toISOString(),
              stageStarted.getTime(),
              null,
              now
            );
          } else {
            const parseError = adapterResult.error;
            context = withError(context, parseError);
            context = incrementMetadata(context, {
              sourceFailed: 1
            });
            context = updateStage(
              context,
              stage,
              "error",
              stageStarted.toISOString(),
              stageStarted.getTime(),
              parseError.message,
              now
            );
          }
        } catch (error) {
          const parseError = createParseError(
            "PIPELINE_ATS_SOURCE_LOAD_FAILED",
            "Failed to load ATS JSON source.",
            "ats_json",
            sourceId,
            {
              path: input.atsPath,
              reason: error instanceof Error ? error.message : "Unknown ATS load failure."
            }
          );
          context = withError(context, parseError);
          context = incrementMetadata(context, {
            sourceFailed: 1
          });
          context = updateStage(
            context,
            stage,
            "error",
            stageStarted.toISOString(),
            stageStarted.getTime(),
            parseError.message,
            now
          );
        }
      }

      {
        const stage: PipelineStage = "load_resume_pdf";
        const stageStarted = now();
        context = incrementMetadata(context, {
          sourceAttempted: 1
        });

        const sourceId = `resume:${basename(input.resumePath)}`;
        const sourceContext = toSourceAdapterContext(sourceId, 2, stageStarted.toISOString());

        try {
          const resumeBytes = await dependencies.readBinaryFile(input.resumePath);
          const adapterResult = await dependencies.resumeAdapter.read(
            {
              bytes: resumeBytes,
              fileName: basename(input.resumePath),
              candidateReference: null
            },
            sourceContext
          );
          if (adapterResult.ok) {
            resumeSource = adapterResult.value;
            context = incrementMetadata(context, {
              sourceLoaded: 1
            });
            context = updateStage(
              context,
              stage,
              "success",
              stageStarted.toISOString(),
              stageStarted.getTime(),
              null,
              now
            );
          } else {
            const parseError = adapterResult.error;
            context = withError(context, parseError);
            context = incrementMetadata(context, {
              sourceFailed: 1
            });
            context = updateStage(
              context,
              stage,
              "error",
              stageStarted.toISOString(),
              stageStarted.getTime(),
              parseError.message,
              now
            );
          }
        } catch (error) {
          const parseError = createParseError(
            "PIPELINE_RESUME_SOURCE_LOAD_FAILED",
            "Failed to load resume PDF source.",
            "resume_pdf",
            sourceId,
            {
              path: input.resumePath,
              reason: error instanceof Error ? error.message : "Unknown resume load failure."
            }
          );
          context = withError(context, parseError);
          context = incrementMetadata(context, {
            sourceFailed: 1
          });
          context = updateStage(
            context,
            stage,
            "error",
            stageStarted.toISOString(),
            stageStarted.getTime(),
            parseError.message,
            now
          );
        }
      }

      {
        const stage: PipelineStage = "validate_sources";
        const stageStarted = now();
        const sourceCount = Number(atsSource !== null) + Number(resumeSource !== null);
        if (sourceCount === 0) {
          const validationError = createValidationError(
            "PIPELINE_SOURCES_EMPTY",
            "No valid source records available after source loading.",
            {
              atsPath: input.atsPath,
              resumePath: input.resumePath
            }
          );
          context = withError(context, validationError);
          context = updateStage(
            context,
            stage,
            "error",
            stageStarted.toISOString(),
            stageStarted.getTime(),
            validationError.message,
            now
          );
          return toFailure(context, validationError, now);
        }

        context = updateStage(
          context,
          stage,
          "success",
          stageStarted.toISOString(),
          stageStarted.getTime(),
          `loaded_sources=${sourceCount}`,
          now
        );
      }

      {
        const stage: PipelineStage = "extract_candidate_facts";
        const stageStarted = now();
        const sourceRecords: readonly SourceRecord[] = [atsSource, resumeSource].filter(
          (source): source is SourceRecord => source !== null
        );

        try {
          const extraction = collectCandidateFacts({
            sources: sourceRecords,
            extractors: dependencies.extractors
          });
          facts = extraction.facts;
          context = incrementMetadata(context, {
            factsExtracted: facts.length
          });

          if (extraction.errors.length > 0) {
            context = extraction.errors.reduce(
              (nextContext, extractionError) => withError(nextContext, extractionError),
              context
            );
            context = withWarning(
              context,
              `${extraction.errors.length} extraction error(s) captured during fact collection.`
            );
          }
          if (facts.length === 0) {
            context = withWarning(context, "No candidate facts extracted from available sources.");
          }

          context = updateStage(
            context,
            stage,
            "success",
            stageStarted.toISOString(),
            stageStarted.getTime(),
            `facts=${facts.length}`,
            now
          );
        } catch (error) {
          const mergeError = createMergeError(
            "PIPELINE_FACT_COLLECTION_FAILED",
            "Fact collection failed unexpectedly.",
            {
              reason: error instanceof Error ? error.message : "Unknown fact collection failure."
            }
          );
          context = withError(context, mergeError);
          context = updateStage(
            context,
            stage,
            "error",
            stageStarted.toISOString(),
            stageStarted.getTime(),
            mergeError.message,
            now
          );
          return toFailure(context, mergeError, now);
        }
      }

      {
        const stage: PipelineStage = "normalize_candidate_facts";
        const stageStarted = now();
        try {
          normalizedFacts = normalizeCandidateFacts(facts);
          context = incrementMetadata(context, {
            factsNormalized: normalizedFacts.length
          });
          context = updateStage(
            context,
            stage,
            "success",
            stageStarted.toISOString(),
            stageStarted.getTime(),
            `facts=${normalizedFacts.length}`,
            now
          );
        } catch (error) {
          const mergeError = createMergeError(
            "PIPELINE_NORMALIZATION_FAILED",
            "Fact normalization failed unexpectedly.",
            {
              reason: error instanceof Error ? error.message : "Unknown normalization failure."
            }
          );
          context = withError(context, mergeError);
          context = updateStage(
            context,
            stage,
            "error",
            stageStarted.toISOString(),
            stageStarted.getTime(),
            mergeError.message,
            now
          );
          return toFailure(context, mergeError, now);
        }
      }

      {
        const stage: PipelineStage = "merge_canonical_profile";
        const stageStarted = now();
        try {
          canonical = dependencies.mergePolicy.merge(normalizedFacts);
          context = updateStage(
            context,
            stage,
            "success",
            stageStarted.toISOString(),
            stageStarted.getTime(),
            null,
            now
          );
        } catch (error) {
          const mergeError = createMergeError(
            "PIPELINE_MERGE_FAILED",
            "Canonical merge failed.",
            {
              reason: error instanceof Error ? error.message : "Unknown merge failure."
            }
          );
          context = withError(context, mergeError);
          context = updateStage(
            context,
            stage,
            "error",
            stageStarted.toISOString(),
            stageStarted.getTime(),
            mergeError.message,
            now
          );
          return toFailure(context, mergeError, now);
        }
      }

      {
        const stage: PipelineStage = "compute_confidence";
        const stageStarted = now();
        try {
          scoredCanonical = dependencies.confidenceScorer.score(canonical);
          context = updateStage(
            context,
            stage,
            "success",
            stageStarted.toISOString(),
            stageStarted.getTime(),
            null,
            now
          );
        } catch (error) {
          const mergeError = createMergeError(
            "PIPELINE_CONFIDENCE_SCORING_FAILED",
            "Confidence scoring failed.",
            {
              reason: error instanceof Error ? error.message : "Unknown confidence scoring failure."
            }
          );
          context = withError(context, mergeError);
          context = updateStage(
            context,
            stage,
            "error",
            stageStarted.toISOString(),
            stageStarted.getTime(),
            mergeError.message,
            now
          );
          return toFailure(context, mergeError, now);
        }
      }

      {
        const stage: PipelineStage = "validate_canonical_profile";
        const stageStarted = now();
        try {
          scoredCanonical = validateCanonical(scoredCanonical);
          context = updateStage(
            context,
            stage,
            "success",
            stageStarted.toISOString(),
            stageStarted.getTime(),
            null,
            now
          );
        } catch (error) {
          const validationError: ValidationError = isPipelineError(error)
            ? (error as ValidationError)
            : createValidationError(
                "PIPELINE_CANONICAL_INVALID",
                "Canonical profile validation failed.",
                {
                  reason:
                    error instanceof Error ? error.message : "Unknown canonical validation failure."
                }
              );
          context = withError(context, validationError);
          context = updateStage(
            context,
            stage,
            "error",
            stageStarted.toISOString(),
            stageStarted.getTime(),
            validationError.message,
            now
          );
          return toFailure(context, validationError, now);
        }
      }

      {
        const stage: PipelineStage = "project_output";
        const stageStarted = now();
        try {
          projectedOutput = dependencies.projector.project(scoredCanonical, runtimeConfig);
          context = updateStage(
            context,
            stage,
            "success",
            stageStarted.toISOString(),
            stageStarted.getTime(),
            null,
            now
          );
        } catch (error) {
          const projectionError: ProjectionError = isPipelineError(error)
            ? (error as ProjectionError)
            : createProjectionError(
                "PIPELINE_PROJECTION_FAILED",
                "Projection failed.",
                {
                  reason: error instanceof Error ? error.message : "Unknown projection failure."
                },
                "projection"
              );
          context = withError(context, projectionError);
          context = updateStage(
            context,
            stage,
            "error",
            stageStarted.toISOString(),
            stageStarted.getTime(),
            projectionError.message,
            now
          );
          return toFailure(context, projectionError, now);
        }
      }

      {
        const stage: PipelineStage = "validate_projected_output";
        const stageStarted = now();
        try {
          validatedProjectedOutput = validateProjectedOutput(projectedOutput, runtimeConfig);
          context = updateStage(
            context,
            stage,
            "success",
            stageStarted.toISOString(),
            stageStarted.getTime(),
            null,
            now
          );
        } catch (error) {
          const validationError: ValidationError = isPipelineError(error)
            ? (error as ValidationError)
            : createValidationError(
                "PIPELINE_PROJECTED_OUTPUT_INVALID",
                "Projected output validation failed.",
                {
                  reason:
                    error instanceof Error
                      ? error.message
                      : "Unknown projected output validation failure."
                }
              );
          context = withError(context, validationError);
          context = updateStage(
            context,
            stage,
            "error",
            stageStarted.toISOString(),
            stageStarted.getTime(),
            validationError.message,
            now
          );
          return toFailure(context, validationError, now);
        }
      }

      let outputJson: string;
      {
        const stage: PipelineStage = "emit_json";
        const stageStarted = now();
        try {
          outputJson = JSON.stringify(validatedProjectedOutput, null, 2);
          context = updateStage(
            context,
            stage,
            "success",
            stageStarted.toISOString(),
            stageStarted.getTime(),
            null,
            now
          );
        } catch (error) {
          const validationError = createValidationError(
            "PIPELINE_JSON_EMIT_FAILED",
            "Failed to serialize projected output as JSON.",
            {
              reason: error instanceof Error ? error.message : "Unknown JSON emit failure."
            }
          );
          context = withError(context, validationError);
          context = updateStage(
            context,
            stage,
            "error",
            stageStarted.toISOString(),
            stageStarted.getTime(),
            validationError.message,
            now
          );
          return toFailure(context, validationError, now);
        }
      }

      const finalizedContext = finalizePipelineContext(context, nowIso(now));
      return {
        ok: true,
        value: {
          context: finalizedContext,
          canonicalProfile: scoredCanonical,
          projectedOutput: validatedProjectedOutput,
          outputJson,
          facts,
          normalizedFacts
        }
      };
    }
  };
};

/**
 * Convenience one-shot pipeline execution helper.
 */
export const runPipeline = async (
  input: PipelineRunnerInput,
  dependencies: PipelineRunnerDependencies
): Promise<PipelineRunnerResult> => createPipelineRunner(dependencies).run(input);
