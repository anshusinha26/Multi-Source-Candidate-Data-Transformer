/**
 * Source adapter contracts and shared deterministic result model.
 */

import type { ParseError } from "../../types/errors.js";
import type { SourceRecord } from "../../types/source-record.js";

/**
 * Typed result container used by adapters and extractors.
 */
export type Result<TValue, TError> =
  | {
      readonly ok: true;
      readonly value: TValue;
    }
  | {
      readonly ok: false;
      readonly error: TError;
    };

/**
 * Shared context passed to source adapters.
 */
export interface SourceAdapterContext {
  /**
   * Stable source identifier used for provenance and deterministic ordering.
   */
  readonly sourceId: string;
  /**
   * Stable source ordering index for deterministic processing.
   */
  readonly sourceOrder: number;
  /**
   * Ingestion timestamp in ISO-8601 format.
   */
  readonly ingestedAt: string;
  /**
   * Optional candidate reference if available before parsing.
   */
  readonly candidateReference: string | null;
}

/**
 * Deterministic source adapter contract.
 */
export interface SourceAdapter<TInput, TSourceRecord extends SourceRecord> {
  /**
   * Source kind handled by adapter.
   */
  readonly kind: TSourceRecord["kind"];
  /**
   * Reads raw input and converts it into typed source record without throwing.
   */
  read(
    input: TInput,
    context: SourceAdapterContext
  ): Promise<Result<TSourceRecord, ParseError>> | Result<TSourceRecord, ParseError>;
}
