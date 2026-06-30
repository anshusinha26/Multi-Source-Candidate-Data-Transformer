/**
 * Deterministic canonical-profile projector.
 */

import type { CanonicalProfile } from "../types/canonical-profile.js";
import type {
  ProjectionConfig,
  ProjectionField,
  ProjectionFieldType,
  ProjectionNormalization
} from "../types/projection-config.js";
import { normalizeCountry } from "../normalization/country.normalizer.js";
import { normalizeEmploymentDate } from "../normalization/date.normalizer.js";
import { normalizePhone } from "../normalization/phone.normalizer.js";
import { normalizeSkill } from "../normalization/skill.normalizer.js";
import type { ProjectedOutput, ProjectedOutputValue, Projector } from "./contracts/projector.js";
import { createProjectionError, handleMissingValue } from "./missing-policy.js";
import { assignPathValue, resolvePathValue } from "./path-resolver.js";

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

const isObjectValue = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);

const normalizeWithDirective = (
  value: unknown,
  directive: ProjectionNormalization
): unknown => {
  if (Array.isArray(value)) {
    return value.map((item) => normalizeWithDirective(item, directive));
  }

  if (directive === "E164") {
    return normalizePhone(value);
  }
  if (directive === "YYYY-MM") {
    return normalizeEmploymentDate(value);
  }
  if (directive === "ISO-3166-alpha-2") {
    return normalizeCountry(value);
  }
  return normalizeSkill(value);
};

const applyNormalizationDirectives = (
  value: unknown,
  directives: readonly ProjectionNormalization[]
): unknown =>
  directives.reduce((current, directive) => normalizeWithDirective(current, directive), value);

const matchesProjectionType = (value: unknown, type: ProjectionFieldType): boolean => {
  if (type === "string") {
    return typeof value === "string";
  }
  if (type === "number") {
    return isFiniteNumber(value);
  }
  if (type === "boolean") {
    return typeof value === "boolean";
  }
  if (type === "object") {
    return isObjectValue(value);
  }
  if (type === "string[]") {
    return Array.isArray(value) && value.every((item) => typeof item === "string");
  }
  if (type === "number[]") {
    return Array.isArray(value) && value.every((item) => isFiniteNumber(item));
  }
  if (type === "boolean[]") {
    return Array.isArray(value) && value.every((item) => typeof item === "boolean");
  }
  return Array.isArray(value) && value.every((item) => isObjectValue(item));
};

const toProjectedValue = (value: unknown): ProjectedOutputValue => {
  if (value === null || typeof value === "string" || typeof value === "boolean") {
    return value;
  }
  if (isFiniteNumber(value)) {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((item) => toProjectedValue(item));
  }
  if (isObjectValue(value)) {
    return Object.entries(value).reduce<Record<string, ProjectedOutputValue>>((acc, [key, item]) => {
      acc[key] = toProjectedValue(item);
      return acc;
    }, {});
  }
  return null;
};

const resolveSourcePath = (field: ProjectionField): string =>
  field.mapping === "mapped" ? field.from : field.path;

const assignOutputValue = (
  output: Readonly<Record<string, unknown>>,
  path: string,
  value: ProjectedOutputValue
): Readonly<Record<string, unknown>> => {
  const assigned = assignPathValue(output, path, value);
  if (!assigned.ok) {
    throw createProjectionError(
      "PROJECTION_OUTPUT_PATH_INVALID",
      assigned.error.message,
      path,
      {
        code: assigned.error.code,
        position: assigned.error.position
      }
    );
  }
  return assigned.value;
};

const projectField = (
  profile: CanonicalProfile,
  field: ProjectionField,
  output: Readonly<Record<string, unknown>>,
  onMissing: ProjectionConfig["onMissing"]
): Readonly<Record<string, unknown>> => {
  const sourcePath = resolveSourcePath(field);
  const resolved = resolvePathValue(profile, sourcePath);

  if (!resolved.ok) {
    throw createProjectionError(
      "PROJECTION_SOURCE_PATH_INVALID",
      resolved.error.message,
      field.path,
      {
        sourcePath,
        code: resolved.error.code,
        position: resolved.error.position
      }
    );
  }

  if (!resolved.value.found) {
    const decision = handleMissingValue(onMissing, field.path, field.required, sourcePath);
    if (decision.kind === "omit") {
      return output;
    }
    if (decision.kind === "set-null") {
      return assignOutputValue(output, field.path, decision.value);
    }
    throw decision.error;
  }

  const normalizedValue = applyNormalizationDirectives(resolved.value.value, field.normalize);
  if (normalizedValue === undefined || normalizedValue === null) {
    const decision = handleMissingValue(onMissing, field.path, field.required, sourcePath);
    if (decision.kind === "omit") {
      return output;
    }
    if (decision.kind === "set-null") {
      return assignOutputValue(output, field.path, decision.value);
    }
    throw decision.error;
  }

  if (!matchesProjectionType(normalizedValue, field.type)) {
    if (field.required) {
      throw createProjectionError(
        "PROJECTION_TYPE_MISMATCH",
        `Projected value for "${field.path}" does not match declared type "${field.type}".`,
        field.path,
        {
          sourcePath,
          declaredType: field.type
        }
      );
    }

    const decision = handleMissingValue(onMissing, field.path, false, sourcePath);
    if (decision.kind === "omit") {
      return output;
    }
    if (decision.kind === "set-null") {
      return assignOutputValue(output, field.path, decision.value);
    }
    throw decision.error;
  }

  return assignOutputValue(output, field.path, toProjectedValue(normalizedValue));
};

/**
 * Projects canonical profile using runtime projection config.
 * Does not mutate input profile.
 */
export const projectCanonicalProfile = (
  profile: CanonicalProfile,
  config: ProjectionConfig
): ProjectedOutput => {
  let output: Readonly<Record<string, unknown>> = {};

  for (const field of config.fields) {
    output = projectField(profile, field, output, config.onMissing);
  }

  if (config.includeConfidence) {
    output = assignOutputValue(output, "overallConfidence", profile.overallConfidence.value);
  }

  if (config.includeProvenance) {
    output = assignOutputValue(
      output,
      "provenance",
      profile.provenance.map((entry) => ({ ...entry }))
    );
  }

  return output as ProjectedOutput;
};

/**
 * Default projector implementation.
 */
export const profileProjector: Projector = {
  id: "canonical-profile-projector",
  project(profile: CanonicalProfile, config: ProjectionConfig): ProjectedOutput {
    return projectCanonicalProfile(profile, config);
  }
};
