/**
 * Canonical profile validation entrypoint.
 */

import type { ValidationError } from "../types/errors.js";
import type { CanonicalProfile } from "../types/canonical-profile.js";
import { CanonicalProfileSchema } from "./schemas/canonical-profile.schema.js";

/**
 * Validates canonical profile payload.
 * Returns parsed value or throws typed ValidationError with diagnostics.
 */
export const validateCanonical = (input: unknown): CanonicalProfile => {
  const parsed = CanonicalProfileSchema.safeParse(input);

  if (parsed.success) {
    return parsed.data;
  }

  const diagnostics = parsed.error.issues.map((issue) => ({
    path: issue.path.join("."),
    code: issue.code,
    message: issue.message
  }));

  const error: ValidationError = {
    kind: "ValidationError",
    stage: "validation",
    code: "VALIDATION_CANONICAL_INVALID",
    message: "Canonical profile validation failed.",
    timestamp: new Date().toISOString(),
    sourceKind: null,
    sourceId: null,
    fieldPath: diagnostics[0]?.path || null,
    details: {
      target: "canonical_profile",
      issues: diagnostics
    },
    cause: null,
    retryable: false
  };

  throw error;
};
