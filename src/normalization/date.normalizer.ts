/**
 * Pure employment-date normalization helpers.
 */

import { format, isValid, parse } from "date-fns";

const EMPLOYMENT_DATE_FORMATS = [
  "yyyy-MM",
  "yyyy/M",
  "yyyy/MM",
  "MM-yyyy",
  "M-yyyy",
  "MM/yyyy",
  "M/yyyy",
  "MM.yyyy",
  "M.yyyy",
  "MMM yyyy",
  "MMMM yyyy",
  "MMM, yyyy",
  "MMMM, yyyy",
  "yyyy MMM",
  "yyyy MMMM",
  "yyyy-MM-dd",
  "yyyy/MM/dd",
  "MM/dd/yyyy",
  "M/d/yyyy",
  "dd/MM/yyyy",
  "d/M/yyyy"
] as const;

const NON_DETERMINISTIC_DATE_TOKENS = new Set([
  "present",
  "current",
  "ongoing",
  "now",
  "till date",
  "to date",
  "n/a",
  "na"
]);

const normalizeInput = (value: string): string => value.trim().replace(/\s+/g, " ");

const hasMonthPrecision = (value: string): boolean => {
  if (/^\d{4}$/.test(value)) {
    return false;
  }

  return (
    /\b(0?[1-9]|1[0-2])\b/.test(value) ||
    /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)\b/i.test(value)
  );
};

const parseByKnownFormats = (value: string): Date | null => {
  const referenceDate = new Date(0);
  for (const formatToken of EMPLOYMENT_DATE_FORMATS) {
    const parsed = parse(value, formatToken, referenceDate);
    if (!isValid(parsed)) {
      continue;
    }
    return parsed;
  }
  return null;
};

/**
 * Normalizes employment date-like values to `YYYY-MM`.
 * Returns `null` when month is unknown or value is invalid.
 */
export const normalizeEmploymentDate = (value: unknown): string | null => {
  if (typeof value !== "string") {
    return null;
  }

  const cleaned = normalizeInput(value);
  if (cleaned.length === 0) {
    return null;
  }

  if (NON_DETERMINISTIC_DATE_TOKENS.has(cleaned.toLowerCase())) {
    return null;
  }

  if (!hasMonthPrecision(cleaned)) {
    return null;
  }

  const parsed = parseByKnownFormats(cleaned);
  if (!parsed) {
    return null;
  }

  return format(parsed, "yyyy-MM");
};
