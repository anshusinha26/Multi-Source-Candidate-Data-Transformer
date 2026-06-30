/**
 * Shared context models and immutable helpers for pipeline execution metadata.
 */

import type { PipelineError } from "../types/errors.js";
import type { ProjectionConfig } from "../types/projection-config.js";

/**
 * Logical pipeline stage names.
 */
export type PipelineStage =
  | "load_runtime_config"
  | "validate_config"
  | "load_ats_json"
  | "load_resume_pdf"
  | "validate_sources"
  | "extract_candidate_facts"
  | "normalize_candidate_facts"
  | "merge_canonical_profile"
  | "compute_confidence"
  | "validate_canonical_profile"
  | "project_output"
  | "validate_projected_output"
  | "emit_json";

/**
 * CLI/runtime input paths for one pipeline run.
 */
export interface PipelineInputPaths {
  readonly atsPath: string;
  readonly resumePath: string;
  readonly configPath: string;
  readonly outputPath: string | null;
}

/**
 * Deterministic stage diagnostic record.
 */
export interface PipelineStageDiagnostic {
  readonly stage: PipelineStage;
  readonly status: "success" | "error";
  readonly startedAt: string;
  readonly finishedAt: string;
  readonly durationMs: number;
  readonly message: string | null;
}

/**
 * Aggregate diagnostics payload.
 */
export interface PipelineDiagnostics {
  readonly warnings: readonly string[];
  readonly errors: readonly PipelineError[];
  readonly stageHistory: readonly PipelineStageDiagnostic[];
}

/**
 * Execution metadata counters.
 */
export interface PipelineExecutionMetadata {
  readonly sourceAttempted: number;
  readonly sourceLoaded: number;
  readonly sourceFailed: number;
  readonly factsExtracted: number;
  readonly factsNormalized: number;
}

/**
 * Pipeline context carried through orchestration.
 */
export interface PipelineContext {
  readonly runId: string;
  readonly input: PipelineInputPaths;
  readonly runtimeConfig: ProjectionConfig | null;
  readonly startedAt: string;
  readonly finishedAt: string | null;
  readonly diagnostics: PipelineDiagnostics;
  readonly metadata: PipelineExecutionMetadata;
}

/**
 * Builds initial immutable pipeline context.
 */
export const createPipelineContext = (
  input: PipelineInputPaths,
  startedAt: string
): PipelineContext => ({
  runId: `run:${startedAt}:${input.atsPath}:${input.resumePath}`,
  input,
  runtimeConfig: null,
  startedAt,
  finishedAt: null,
  diagnostics: {
    warnings: [],
    errors: [],
    stageHistory: []
  },
  metadata: {
    sourceAttempted: 0,
    sourceLoaded: 0,
    sourceFailed: 0,
    factsExtracted: 0,
    factsNormalized: 0
  }
});

/**
 * Returns context with runtime config attached.
 */
export const withRuntimeConfig = (
  context: PipelineContext,
  runtimeConfig: ProjectionConfig
): PipelineContext => ({
  ...context,
  runtimeConfig
});

/**
 * Appends stage diagnostic entry.
 */
export const withStageDiagnostic = (
  context: PipelineContext,
  diagnostic: PipelineStageDiagnostic
): PipelineContext => ({
  ...context,
  diagnostics: {
    ...context.diagnostics,
    stageHistory: [...context.diagnostics.stageHistory, diagnostic]
  }
});

/**
 * Appends warning message.
 */
export const withWarning = (context: PipelineContext, warning: string): PipelineContext => ({
  ...context,
  diagnostics: {
    ...context.diagnostics,
    warnings: [...context.diagnostics.warnings, warning]
  }
});

/**
 * Appends pipeline error.
 */
export const withError = (context: PipelineContext, error: PipelineError): PipelineContext => ({
  ...context,
  diagnostics: {
    ...context.diagnostics,
    errors: [...context.diagnostics.errors, error]
  }
});

/**
 * Merges metadata counters.
 */
export const withMetadata = (
  context: PipelineContext,
  metadata: Partial<PipelineExecutionMetadata>
): PipelineContext => ({
  ...context,
  metadata: {
    ...context.metadata,
    ...metadata
  }
});

/**
 * Returns finalized context with finish timestamp.
 */
export const finalizePipelineContext = (
  context: PipelineContext,
  finishedAt: string
): PipelineContext => ({
  ...context,
  finishedAt
});
