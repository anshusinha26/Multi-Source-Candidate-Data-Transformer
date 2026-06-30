/**
 * Deterministic missing-value policy handlers for projection.
 */

import type { ProjectionError } from "../types/errors.js";
import type { OnMissingPolicy } from "../types/projection-config.js";
import type { JsonValue } from "../types/source-record.js";

/**
 * Deterministic timestamp constant used in pure error creation.
 */
export const DETERMINISTIC_ERROR_TIMESTAMP = "1970-01-01T00:00:00.000Z";

/**
 * Missing policy handling result.
 */
export type MissingPolicyResult =
  | {
      readonly kind: "set-null";
      readonly value: null;
    }
  | {
      readonly kind: "omit";
    }
  | {
      readonly kind: "error";
      readonly error: ProjectionError;
    };

/**
 * Creates deterministic ProjectionError payload.
 */
export const createProjectionError = (
  code: string,
  message: string,
  fieldPath: string,
  details: JsonValue | null
): ProjectionError => ({
  kind: "ProjectionError",
  stage: "projection",
  code,
  message,
  timestamp: DETERMINISTIC_ERROR_TIMESTAMP,
  sourceKind: null,
  sourceId: null,
  fieldPath,
  details,
  cause: null,
  retryable: false
});

/**
 * Applies deterministic missing policy to unresolved projected field values.
 */
export const handleMissingValue = (
  policy: OnMissingPolicy,
  fieldPath: string,
  required: boolean,
  sourcePath: string
): MissingPolicyResult => {
  if (required) {
    return {
      kind: "error",
      error: createProjectionError(
        "PROJECTION_REQUIRED_FIELD_MISSING",
        `Required field "${fieldPath}" is missing.`,
        fieldPath,
        {
          sourcePath,
          policy
        }
      )
    };
  }

  if (policy === "null") {
    return {
      kind: "set-null",
      value: null
    };
  }

  if (policy === "omit") {
    return {
      kind: "omit"
    };
  }

  return {
    kind: "error",
    error: createProjectionError(
      "PROJECTION_FIELD_MISSING",
      `Field "${fieldPath}" is missing under on_missing=error.`,
      fieldPath,
      {
        sourcePath,
        policy
      }
    )
  };
};
