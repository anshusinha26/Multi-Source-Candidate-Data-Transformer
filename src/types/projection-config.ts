/**
 * Domain types for runtime projection configuration.
 */

import type { CanonicalFieldPath } from "./provenance.js";

/**
 * Supported output type hints for projected fields.
 */
export type ProjectionFieldType =
  | "string"
  | "number"
  | "boolean"
  | "object"
  | "string[]"
  | "number[]"
  | "boolean[]"
  | "object[]";

/**
 * Supported normalization directives for projection stage.
 */
export type ProjectionNormalization =
  | "E164"
  | "YYYY-MM"
  | "ISO-3166-alpha-2"
  | "canonical";

/**
 * Policy for handling missing values during projection.
 */
export type OnMissingPolicy = "null" | "omit" | "error";

/**
 * Shared properties for every projection field selection entry.
 */
export interface ProjectionFieldBase {
  /**
   * Output path in projected result.
   */
  readonly path: string;
  /**
   * Expected projected field type.
   */
  readonly type: ProjectionFieldType;
  /**
   * Whether field must be present after projection.
   */
  readonly required: boolean;
  /**
   * Optional normalization directives to apply.
   */
  readonly normalize: readonly ProjectionNormalization[];
}

/**
 * Projection field using direct canonical path mapping.
 */
export interface ProjectionFieldDirect extends ProjectionFieldBase {
  readonly mapping: "direct";
  readonly from: null;
}

/**
 * Projection field using explicit canonical source path remap.
 */
export interface ProjectionFieldMapped extends ProjectionFieldBase {
  readonly mapping: "mapped";
  readonly from: CanonicalFieldPath;
}

/**
 * Discriminated union for projection field entries.
 */
export type ProjectionField = ProjectionFieldDirect | ProjectionFieldMapped;

/**
 * Runtime config controlling canonical-to-output projection.
 */
export interface ProjectionConfig {
  /**
   * Fields to include in projected output.
   */
  readonly fields: readonly ProjectionField[];
  /**
   * Include confidence payload in projected output.
   */
  readonly includeConfidence: boolean;
  /**
   * Include provenance payload in projected output.
   */
  readonly includeProvenance: boolean;
  /**
   * Missing value behavior.
   */
  readonly onMissing: OnMissingPolicy;
}
