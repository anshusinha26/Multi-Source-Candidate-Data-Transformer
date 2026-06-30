/**
 * Domain types for extracted candidate facts before merge.
 */

import type { JsonValue, SourceRecordKind } from "./source-record.js";
import type {
  CanonicalFieldPath,
  ConfidenceScore,
  ExtractionMethod,
  ProvenanceEntry
} from "./provenance.js";

/**
 * Primitive value allowed in normalized fact payloads.
 */
export type NormalizedPrimitive = string | number | boolean | null;

/**
 * Recursive normalized value model for extracted facts.
 */
export type NormalizedFactValue =
  | NormalizedPrimitive
  | readonly NormalizedFactValue[]
  | {
      readonly [key: string]: NormalizedFactValue;
    };

/**
 * Top-level shape discriminator for normalized fact value.
 */
export type CandidateFactValueKind = "primitive" | "array" | "object";

/**
 * Common fact metadata used by all candidate facts.
 */
export interface CandidateFactBase {
  /**
   * Stable fact id for deduplication and tracing.
   */
  readonly factId: string;
  /**
   * Canonical field path targeted by this fact.
   */
  readonly fieldPath: CanonicalFieldPath;
  /**
   * Source kind where this fact originated.
   */
  readonly sourceKind: SourceRecordKind;
  /**
   * Stable source id for deterministic merge ordering.
   */
  readonly sourceId: string;
  /**
   * Deterministic extraction method identifier.
   */
  readonly extractionMethod: ExtractionMethod;
  /**
   * Raw value before normalization.
   */
  readonly originalValue: JsonValue;
  /**
   * Confidence payload for this extracted fact.
   */
  readonly confidence: ConfidenceScore;
  /**
   * Source order inherited from ingestion.
   */
  readonly sourceOrder: number;
  /**
   * Stable extraction order within source.
   */
  readonly extractionOrder: number;
  /**
   * ISO-8601 timestamp when fact extracted.
   */
  readonly extractedAt: string;
  /**
   * Provenance record attached to this fact.
   */
  readonly provenance: ProvenanceEntry;
}

/**
 * Candidate fact with primitive normalized value.
 */
export interface PrimitiveCandidateFact extends CandidateFactBase {
  readonly valueKind: "primitive";
  readonly normalizedValue: NormalizedPrimitive;
}

/**
 * Candidate fact with array normalized value.
 */
export interface ArrayCandidateFact extends CandidateFactBase {
  readonly valueKind: "array";
  readonly normalizedValue: readonly NormalizedFactValue[];
}

/**
 * Candidate fact with object normalized value.
 */
export interface ObjectCandidateFact extends CandidateFactBase {
  readonly valueKind: "object";
  readonly normalizedValue: {
    readonly [key: string]: NormalizedFactValue;
  };
}

/**
 * Discriminated union for all extracted candidate facts.
 */
export type CandidateFact =
  | PrimitiveCandidateFact
  | ArrayCandidateFact
  | ObjectCandidateFact;
