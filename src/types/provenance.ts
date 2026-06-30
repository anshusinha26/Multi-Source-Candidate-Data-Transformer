/**
 * Domain types for provenance and confidence metadata.
 */

import type { SourceRecordKind } from "./source-record.js";

/**
 * Canonical dot-path pointing to internal profile field.
 */
export type CanonicalFieldPath = string;

/**
 * Extraction method discriminator for explainability.
 */
export type ExtractionMethod =
  | "structured_field_map"
  | "pdf_text_span"
  | "regex_match"
  | "heuristic_rule";

/**
 * Field-level provenance entry.
 */
export interface ProvenanceEntry {
  /**
   * Canonical field path receiving value.
   */
  readonly fieldPath: CanonicalFieldPath;
  /**
   * Source kind where value originated.
   */
  readonly sourceKind: SourceRecordKind;
  /**
   * Stable source id for traceability.
   */
  readonly sourceId: string;
  /**
   * Deterministic extraction method used.
   */
  readonly method: ExtractionMethod;
  /**
   * Stable source order index from ingestion.
   */
  readonly sourceOrder: number;
  /**
   * ISO-8601 timestamp when provenance recorded.
   */
  readonly recordedAt: string;
  /**
   * Optional short evidence note.
   */
  readonly evidence: string | null;
}

/**
 * Explicit confidence payload.
 */
export interface ConfidenceScore {
  /**
   * Confidence score in range [0, 1].
   */
  readonly value: number;
  /**
   * Confidence strategy identifier.
   */
  readonly model: "fixed_weighted";
  /**
   * Source reliability weight used.
   */
  readonly sourceWeight: number;
  /**
   * Extraction method reliability weight used.
   */
  readonly methodWeight: number;
  /**
   * Cross-source agreement weight used.
   */
  readonly agreementWeight: number;
  /**
   * Short deterministic explanation.
   */
  readonly rationale: string;
}

/**
 * Confidence attached to specific canonical field.
 */
export interface FieldConfidence {
  /**
   * Canonical field path for this score.
   */
  readonly fieldPath: CanonicalFieldPath;
  /**
   * Explicit confidence payload for field value.
   */
  readonly score: ConfidenceScore;
}
