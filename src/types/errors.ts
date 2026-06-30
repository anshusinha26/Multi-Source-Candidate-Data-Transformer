/**
 * Typed error models for pipeline stages.
 */

import type { CanonicalFieldPath } from "./provenance.js";
import type { JsonValue, SourceRecordKind } from "./source-record.js";

/**
 * Pipeline stage names for error categorization.
 */
export type ErrorStage =
  | "parse"
  | "extraction"
  | "normalization"
  | "merge"
  | "projection"
  | "validation";

/**
 * Shared fields for every typed pipeline error.
 */
export interface PipelineErrorBase {
  /**
   * Discriminator for exhaustive handling.
   */
  readonly kind:
    | "ParseError"
    | "ExtractionError"
    | "NormalizationError"
    | "MergeError"
    | "ProjectionError"
    | "ValidationError";
  /**
   * Pipeline stage where error occurred.
   */
  readonly stage: ErrorStage;
  /**
   * Stable machine-readable code.
   */
  readonly code: string;
  /**
   * Human-readable error message.
   */
  readonly message: string;
  /**
   * ISO-8601 timestamp when error emitted.
   */
  readonly timestamp: string;
  /**
   * Optional source kind related to failure.
   */
  readonly sourceKind: SourceRecordKind | null;
  /**
   * Optional source id related to failure.
   */
  readonly sourceId: string | null;
  /**
   * Optional canonical field path related to failure.
   */
  readonly fieldPath: CanonicalFieldPath | null;
  /**
   * Structured error details for diagnostics.
   */
  readonly details: JsonValue | null;
  /**
   * Optional upstream cause text.
   */
  readonly cause: string | null;
  /**
   * Whether retry may succeed without code change.
   */
  readonly retryable: boolean;
}

/**
 * Error emitted while parsing raw source input.
 */
export interface ParseError extends PipelineErrorBase {
  readonly kind: "ParseError";
  readonly stage: "parse";
  readonly sourceKind: SourceRecordKind;
  readonly sourceId: string;
}

/**
 * Error emitted while extracting candidate facts.
 */
export interface ExtractionError extends PipelineErrorBase {
  readonly kind: "ExtractionError";
  readonly stage: "extraction";
  readonly sourceKind: SourceRecordKind;
  readonly sourceId: string;
}

/**
 * Error emitted while normalizing extracted values.
 */
export interface NormalizationError extends PipelineErrorBase {
  readonly kind: "NormalizationError";
  readonly stage: "normalization";
  readonly fieldPath: CanonicalFieldPath;
}

/**
 * Error emitted while merging facts into canonical profile.
 */
export interface MergeError extends PipelineErrorBase {
  readonly kind: "MergeError";
  readonly stage: "merge";
}

/**
 * Error emitted while projecting canonical profile to output shape.
 */
export interface ProjectionError extends PipelineErrorBase {
  readonly kind: "ProjectionError";
  readonly stage: "projection";
  readonly fieldPath: CanonicalFieldPath;
}

/**
 * Error emitted while validating config or output payload.
 */
export interface ValidationError extends PipelineErrorBase {
  readonly kind: "ValidationError";
  readonly stage: "validation";
}

/**
 * Discriminated union for all typed pipeline errors.
 */
export type PipelineError =
  | ParseError
  | ExtractionError
  | NormalizationError
  | MergeError
  | ProjectionError
  | ValidationError;
