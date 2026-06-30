/**
 * Projected output validation entrypoint.
 */

import { z } from "zod";
import type { ProjectedOutput } from "../projection/contracts/projector.js";
import type { ValidationError } from "../types/errors.js";
import type { ProjectionConfig, ProjectionFieldType } from "../types/projection-config.js";
import { resolvePathValue } from "../projection/path-resolver.js";
import { ProjectionConfigSchema } from "./schemas/projection-config.schema.js";
import { ProvenanceEntrySchema } from "./schemas/canonical-profile.schema.js";
import { ProjectedOutputSchema, ProjectedValueSchema } from "./schemas/projected-output.schema.js";

const projectedFieldTypeSchemaMap: Readonly<Record<ProjectionFieldType, z.ZodType<unknown>>> = {
  string: z.string(),
  number: z.number().finite(),
  boolean: z.boolean(),
  object: z.record(z.string(), ProjectedValueSchema),
  "string[]": z.array(z.string()),
  "number[]": z.array(z.number().finite()),
  "boolean[]": z.array(z.boolean()),
  "object[]": z.array(z.record(z.string(), ProjectedValueSchema))
};

interface ValidationDiagnostic {
  readonly [key: string]: string;
  readonly path: string;
  readonly code: string;
  readonly message: string;
}

const createValidationError = (
  code: string,
  message: string,
  diagnostics: readonly ValidationDiagnostic[],
  target: string
): ValidationError => ({
  kind: "ValidationError",
  stage: "validation",
  code,
  message,
  timestamp: new Date().toISOString(),
  sourceKind: null,
  sourceId: null,
  fieldPath: diagnostics[0]?.path ?? null,
  details: {
    target,
    issues: diagnostics
  },
  cause: null,
  retryable: false
});

const validateFieldAtPath = (
  payload: z.output<typeof ProjectedOutputSchema>,
  path: string,
  schema: z.ZodType<unknown>,
  required: boolean
): readonly ValidationDiagnostic[] => {
  const resolved = resolvePathValue(payload, path);
  if (!resolved.ok) {
    return [
      {
        path,
        code: resolved.error.code,
        message: resolved.error.message
      }
    ];
  }

  if (!resolved.value.found) {
    if (!required) {
      return [];
    }
    return [
      {
        path,
        code: "missing_required_field",
        message: `Required projected field "${path}" is missing.`
      }
    ];
  }

  const typed = schema.safeParse(resolved.value.value);
  if (typed.success) {
    return [];
  }

  return typed.error.issues.map((issue) => ({
    path,
    code: issue.code,
    message: issue.message
  }));
};

const toProjectedOutput = (value: z.output<typeof ProjectedOutputSchema>): ProjectedOutput =>
  value as ProjectedOutput;

/**
 * Validates projected output payload.
 * If config is provided, applies strict key/type validation against config fields.
 */
export const validateProjectedOutput = (
  input: unknown,
  config?: ProjectionConfig
): ProjectedOutput => {
  let normalizedConfig: ProjectionConfig | undefined = undefined;
  if (config !== undefined) {
    const configParsed = ProjectionConfigSchema.safeParse(config);
    if (!configParsed.success) {
      const diagnostics = configParsed.error.issues.map((issue) => ({
        path: issue.path.join("."),
        code: issue.code,
        message: issue.message
      }));

      throw createValidationError(
        "VALIDATION_PROJECTED_OUTPUT_CONFIG_INVALID",
        "Projection config validation failed for projected output validation.",
        diagnostics,
        "projection_config"
      );
    }
    normalizedConfig = configParsed.data;
  }

  const parsed = ProjectedOutputSchema.safeParse(input);

  if (parsed.success) {
    if (!normalizedConfig) {
      return toProjectedOutput(parsed.data);
    }

    const diagnostics: ValidationDiagnostic[] = [];

    for (const field of normalizedConfig.fields) {
      const fieldSchema = projectedFieldTypeSchemaMap[field.type];
      diagnostics.push(
        ...validateFieldAtPath(parsed.data, field.path, fieldSchema, field.required)
      );
    }

    diagnostics.push(
      ...validateFieldAtPath(
        parsed.data,
        "overallConfidence",
        z.number().finite().min(0).max(1),
        normalizedConfig.includeConfidence
      )
    );
    diagnostics.push(
      ...validateFieldAtPath(
        parsed.data,
        "provenance",
        z.array(ProvenanceEntrySchema),
        normalizedConfig.includeProvenance
      )
    );

    if (diagnostics.length === 0) {
      return toProjectedOutput(parsed.data);
    }

    throw createValidationError(
      "VALIDATION_PROJECTED_OUTPUT_INVALID",
      "Projected output validation failed.",
      diagnostics,
      "projected_output"
    );
  }

  const diagnostics = parsed.error.issues.map((issue) => ({
    path: issue.path.join("."),
    code: issue.code,
    message: issue.message
  }));

  throw createValidationError(
    "VALIDATION_PROJECTED_OUTPUT_INVALID",
    "Projected output validation failed.",
    diagnostics,
    "projected_output"
  );
};
