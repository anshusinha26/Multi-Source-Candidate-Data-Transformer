/**
 * Pure phone normalization helpers.
 */

import { parsePhoneNumberFromString, type CountryCode } from "libphonenumber-js";

/**
 * Options for phone normalization.
 */
export interface PhoneNormalizationOptions {
  /**
   * Default country used only when input has no international prefix.
   */
  readonly defaultCountry?: CountryCode;
}

/**
 * Normalizes unknown phone input to E.164 format.
 * Returns `null` for invalid or unsupported values and never throws.
 */
export const normalizePhone = (
  value: unknown,
  options: PhoneNormalizationOptions = {}
): string | null => {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return null;
  }

  try {
    const parsed = parsePhoneNumberFromString(trimmed, options.defaultCountry);
    if (!parsed || !parsed.isValid()) {
      return null;
    }

    return parsed.number;
  } catch {
    return null;
  }
};
