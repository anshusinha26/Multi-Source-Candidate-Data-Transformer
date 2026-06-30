/**
 * CLI option models and deterministic validation helpers.
 */

import type { ValidationError } from "../types/errors.js";

/**
 * Raw Commander options for `transform`.
 */
export interface TransformCommandRawOptions {
  readonly ats?: string;
  readonly resume?: string;
  readonly config?: string;
  readonly output?: string;
}

/**
 * Normalized CLI options for pipeline execution.
 */
export interface TransformCommandOptions {
  readonly atsPath: string;
  readonly resumePath: string;
  readonly configPath: string;
  readonly outputPath: string | null;
}

/**
 * Result shape for option parsing.
 */
export type TransformOptionsResult =
  | {
      readonly ok: true;
      readonly value: TransformCommandOptions;
    }
  | {
      readonly ok: false;
      readonly error: ValidationError;
    };

const toOptionalTrimmed = (value: string | undefined): string | null => {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

const createOptionsValidationError = (
  code: string,
  message: string,
  fieldPath: string
): ValidationError => ({
  kind: "ValidationError",
  stage: "validation",
  code,
  message,
  timestamp: new Date().toISOString(),
  sourceKind: null,
  sourceId: null,
  fieldPath,
  details: null,
  cause: null,
  retryable: false
});

/**
 * Validates and normalizes `transform` command options.
 */
export const parseTransformOptions = (raw: TransformCommandRawOptions): TransformOptionsResult => {
  const atsPath = toOptionalTrimmed(raw.ats);
  if (!atsPath) {
    return {
      ok: false,
      error: createOptionsValidationError(
        "CLI_OPTION_ATS_MISSING",
        "Missing required --ats <file> argument.",
        "ats"
      )
    };
  }

  const resumePath = toOptionalTrimmed(raw.resume);
  if (!resumePath) {
    return {
      ok: false,
      error: createOptionsValidationError(
        "CLI_OPTION_RESUME_MISSING",
        "Missing required --resume <file> argument.",
        "resume"
      )
    };
  }

  const configPath = toOptionalTrimmed(raw.config);
  if (!configPath) {
    return {
      ok: false,
      error: createOptionsValidationError(
        "CLI_OPTION_CONFIG_MISSING",
        "Missing required --config <file> argument.",
        "config"
      )
    };
  }

  return {
    ok: true,
    value: {
      atsPath,
      resumePath,
      configPath,
      outputPath: toOptionalTrimmed(raw.output)
    }
  };
};
