/**
 * Domain types for raw source records entering pipeline.
 */

/**
 * JSON primitive value.
 */
export type JsonPrimitive = string | number | boolean | null;

/**
 * JSON value for typed raw payloads.
 */
export type JsonValue =
  | JsonPrimitive
  | readonly JsonValue[]
  | {
      readonly [key: string]: JsonValue;
    };

/**
 * Supported source kinds for this assignment scope.
 */
export type SourceRecordKind = "ats_json" | "resume_pdf";

/**
 * Source category for deterministic processing policy.
 */
export type SourceGroup = "structured" | "unstructured";

/**
 * Common metadata for every raw source record.
 */
export interface SourceRecordBase {
  /**
   * Stable source record id for traceability.
   */
  readonly sourceId: string;
  /**
   * Source kind discriminator.
   */
  readonly kind: SourceRecordKind;
  /**
   * Structured vs unstructured source category.
   */
  readonly group: SourceGroup;
  /**
   * Candidate reference from source, null when unavailable.
   */
  readonly candidateReference: string | null;
  /**
   * Ingestion timestamp in ISO-8601 format.
   */
  readonly ingestedAt: string;
  /**
   * Stable order index used for deterministic tie-breaks.
   */
  readonly sourceOrder: number;
}

/**
 * Raw ATS JSON source record.
 */
export interface AtsJsonSourceRecord extends SourceRecordBase {
  readonly kind: "ats_json";
  readonly group: "structured";
  /**
   * Raw ATS payload before extraction.
   */
  readonly payload: {
    readonly [key: string]: JsonValue;
  };
}

/**
 * Raw Resume PDF source record.
 */
export interface ResumePdfSourceRecord extends SourceRecordBase {
  readonly kind: "resume_pdf";
  readonly group: "unstructured";
  /**
   * Resume file metadata and bytes.
   */
  readonly payload: {
    readonly fileName: string;
    readonly mimeType: "application/pdf";
    readonly bytes: Uint8Array;
  };
}

/**
 * Discriminated union for all supported raw source records.
 */
export type SourceRecord = AtsJsonSourceRecord | ResumePdfSourceRecord;
