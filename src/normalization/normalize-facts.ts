/**
 * Pure orchestration for candidate-fact normalization.
 */

import type {
  ArrayCandidateFact,
  CandidateFact,
  NormalizedFactValue,
  ObjectCandidateFact,
  PrimitiveCandidateFact
} from "../types/candidate-fact.js";
import { normalizeCountry } from "./country.normalizer.js";
import { normalizeEmploymentDate } from "./date.normalizer.js";
import { normalizePhone } from "./phone.normalizer.js";
import { normalizeSkill } from "./skill.normalizer.js";

/**
 * Supported normalization targets resolved from canonical field paths.
 */
export type NormalizationTarget = "phone" | "date" | "country" | "skill" | null;

const DATE_TERMINAL_SEGMENTS = new Set(["start", "end", "from", "to", "date"]);
const PHONE_TERMINAL_SEGMENTS = new Set(["phone", "phones"]);
const SKILL_TERMINAL_SEGMENTS = new Set(["skill", "skills", "name"]);

const stripIndexMarkers = (fieldPath: string): string =>
  fieldPath.replace(/\[\d+\]/g, "[]").toLowerCase();

const splitPathSegments = (fieldPath: string): readonly string[] =>
  stripIndexMarkers(fieldPath)
    .split(".")
    .map((segment) => segment.replace(/\[\]/g, ""))
    .filter((segment) => segment.length > 0);

/**
 * Resolves which normalizer to apply for a canonical field path.
 */
export const resolveNormalizationTarget = (fieldPath: string): NormalizationTarget => {
  const segments = splitPathSegments(fieldPath);
  const last = segments[segments.length - 1] ?? "";

  if (PHONE_TERMINAL_SEGMENTS.has(last)) {
    return "phone";
  }
  if (last === "country") {
    return "country";
  }
  if (DATE_TERMINAL_SEGMENTS.has(last)) {
    return "date";
  }
  if (SKILL_TERMINAL_SEGMENTS.has(last) && segments.some((segment) => segment === "skills")) {
    return "skill";
  }
  if (last === "skills") {
    return "skill";
  }

  return null;
};

const isRecord = (
  value: NormalizedFactValue
): value is {
  readonly [key: string]: NormalizedFactValue;
} => typeof value === "object" && value !== null && !Array.isArray(value);

const isNormalizedPrimitive = (
  value: NormalizedFactValue
): value is string | number | boolean | null =>
  value === null || typeof value === "string" || typeof value === "number" || typeof value === "boolean";

const normalizePrimitiveValue = (
  value: string | number | boolean | null,
  target: Exclude<NormalizationTarget, null>
): string | null => {
  if (target === "phone") {
    return normalizePhone(value);
  }
  if (target === "date") {
    return normalizeEmploymentDate(value);
  }
  if (target === "country") {
    return normalizeCountry(value);
  }
  return normalizeSkill(value);
};

const normalizeObjectValue = (
  value: {
    readonly [key: string]: NormalizedFactValue;
  },
  target: Exclude<NormalizationTarget, null>
): {
  readonly [key: string]: NormalizedFactValue;
} => {
  if (target === "skill") {
    const nextName = "name" in value ? normalizeValue(value.name, target) : undefined;
    return {
      ...value,
      ...(nextName === undefined ? {} : { name: nextName })
    };
  }

  if (target === "country") {
    const nextCountry = "country" in value ? normalizeValue(value.country, target) : undefined;
    return {
      ...value,
      ...(nextCountry === undefined ? {} : { country: nextCountry })
    };
  }

  if (target === "phone") {
    const nextPhone = "phone" in value ? normalizeValue(value.phone, target) : undefined;
    const nextPhones = "phones" in value ? normalizeValue(value.phones, target) : undefined;
    return {
      ...value,
      ...(nextPhone === undefined ? {} : { phone: nextPhone }),
      ...(nextPhones === undefined ? {} : { phones: nextPhones })
    };
  }

  const nextStart = "start" in value ? normalizeValue(value.start, target) : undefined;
  const nextEnd = "end" in value ? normalizeValue(value.end, target) : undefined;
  const nextFrom = "from" in value ? normalizeValue(value.from, target) : undefined;
  const nextTo = "to" in value ? normalizeValue(value.to, target) : undefined;
  const nextDate = "date" in value ? normalizeValue(value.date, target) : undefined;

  return {
    ...value,
    ...(nextStart === undefined ? {} : { start: nextStart }),
    ...(nextEnd === undefined ? {} : { end: nextEnd }),
    ...(nextFrom === undefined ? {} : { from: nextFrom }),
    ...(nextTo === undefined ? {} : { to: nextTo }),
    ...(nextDate === undefined ? {} : { date: nextDate })
  };
};

const normalizeValue = (
  value: NormalizedFactValue,
  target: Exclude<NormalizationTarget, null>
): NormalizedFactValue => {
  if (Array.isArray(value)) {
    return value.map((item) => normalizeValue(item, target));
  }

  if (isRecord(value)) {
    return normalizeObjectValue(value, target);
  }

  if (isNormalizedPrimitive(value)) {
    return normalizePrimitiveValue(value, target);
  }

  return value;
};

const normalizeFact = (fact: CandidateFact): CandidateFact => {
  const target = resolveNormalizationTarget(fact.fieldPath);
  if (!target) {
    return { ...fact };
  }

  const normalizedValue = normalizeValue(fact.normalizedValue, target);

  if (fact.valueKind === "primitive") {
    const nextFact: PrimitiveCandidateFact = {
      ...fact,
      normalizedValue: normalizedValue as PrimitiveCandidateFact["normalizedValue"]
    };
    return nextFact;
  }

  if (fact.valueKind === "array") {
    const nextFact: ArrayCandidateFact = {
      ...fact,
      normalizedValue: normalizedValue as ArrayCandidateFact["normalizedValue"]
    };
    return nextFact;
  }

  const nextFact: ObjectCandidateFact = {
    ...fact,
    normalizedValue: normalizedValue as ObjectCandidateFact["normalizedValue"]
  };
  return nextFact;
};

/**
 * Normalizes candidate facts without mutating input objects.
 * Preserves metadata, provenance, original values, and confidence payloads.
 */
export const normalizeCandidateFacts = (facts: readonly CandidateFact[]): readonly CandidateFact[] =>
  facts.map((fact) => normalizeFact(fact));
