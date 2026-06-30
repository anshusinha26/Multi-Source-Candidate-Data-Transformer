/**
 * Merge policy contracts for deterministic canonical profile construction.
 */

import type { CandidateFact } from "../../types/candidate-fact.js";
import type { CanonicalProfile } from "../../types/canonical-profile.js";
import type { ExtractionMethod } from "../../types/provenance.js";
import type { SourceRecordKind } from "../../types/source-record.js";

/**
 * Source precedence map used by merge conflict resolution.
 */
export type SourcePrecedenceMap = Readonly<Record<SourceRecordKind, number>>;

/**
 * Extraction quality map used as tie-break dimension.
 */
export type ExtractionQualityMap = Readonly<Record<ExtractionMethod, number>>;

/**
 * Deterministic merge options.
 */
export interface MergeOptions {
  /**
   * Source-precedence ranking; larger value means higher precedence.
   */
  readonly sourcePrecedence: SourcePrecedenceMap;
  /**
   * Extraction quality ranking; larger value means higher quality.
   */
  readonly extractionQuality: ExtractionQualityMap;
}

/**
 * Merge policy contract.
 */
export interface MergePolicy {
  /**
   * Stable policy identifier.
   */
  readonly id: string;
  /**
   * Merges normalized candidate facts into canonical internal profile.
   */
  merge(facts: readonly CandidateFact[]): CanonicalProfile;
}
