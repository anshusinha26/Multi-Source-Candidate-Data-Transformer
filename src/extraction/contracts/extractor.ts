/**
 * Extractor contracts for converting source records to candidate facts.
 */

import type { Result } from "../../adapters/contracts/source-adapter.js";
import type { CandidateFact } from "../../types/candidate-fact.js";
import type { ExtractionError } from "../../types/errors.js";
import type { SourceRecord } from "../../types/source-record.js";

/**
 * Deterministic extractor contract.
 */
export interface Extractor {
  /**
   * Stable extractor id used for deterministic ordering.
   */
  readonly id: string;
  /**
   * Source kind handled by extractor.
   */
  readonly kind: SourceRecord["kind"];
  /**
   * Extracts candidate facts from source record without throwing.
   */
  extract(source: SourceRecord): Result<readonly CandidateFact[], ExtractionError>;
}
