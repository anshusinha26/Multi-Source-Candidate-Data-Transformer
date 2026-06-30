/**
 * Projection configuration validation entrypoint.
 */

import type { ValidationError } from "../types/errors.js";
import type { ProjectionConfig } from "../types/projection-config.js";
import { ProjectionConfigSchema } from "./schemas/projection-config.schema.js";

/**
 * Validates projection configuration payload.
 * Returns parsed value or throws typed ValidationError with diagnostics.
 */
export const validateProjectionConfig = (input: unknown): ProjectionConfig => {
  const parsed = ProjectionConfigSchema.safeParse(input);

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
    code: "VALIDATION_PROJECTION_CONFIG_INVALID",
    message: "Projection config validation failed.",
    timestamp: new Date().toISOString(),
    sourceKind: null,
    sourceId: null,
    fieldPath: diagnostics[0]?.path || null,
    details: {
      target: "projection_config",
      issues: diagnostics
    },
    cause: null,
    retryable: false
  };

  throw error;
};
