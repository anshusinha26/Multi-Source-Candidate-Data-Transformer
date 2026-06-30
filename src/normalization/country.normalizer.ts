/**
 * Pure country normalization helpers.
 */

/**
 * Common country-name aliases mapped to ISO-3166 alpha-2 codes.
 * Extend this map to support additional aliases.
 */
export const COUNTRY_NAME_TO_ALPHA2: Readonly<Record<string, string>> = {
  us: "US",
  usa: "US",
  "u s": "US",
  "u s a": "US",
  "united states": "US",
  "united states of america": "US",
  uk: "GB",
  "u k": "GB",
  "united kingdom": "GB",
  "great britain": "GB",
  britain: "GB",
  england: "GB",
  india: "IN",
  canada: "CA",
  australia: "AU",
  germany: "DE",
  france: "FR",
  spain: "ES",
  italy: "IT",
  netherlands: "NL",
  switzerland: "CH",
  singapore: "SG",
  japan: "JP",
  china: "CN",
  brazil: "BR",
  mexico: "MX",
  uae: "AE",
  "u a e": "AE",
  "united arab emirates": "AE",
  "south korea": "KR",
  "republic of korea": "KR",
  "korea south": "KR"
};

const SUPPORTED_ALPHA2_CODES = new Set<string>(Object.values(COUNTRY_NAME_TO_ALPHA2));

const normalizeCountryKey = (value: string): string =>
  value
    .trim()
    .toLowerCase()
    .replace(/[.,()]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

/**
 * Normalizes common country values to ISO-3166 alpha-2.
 * Trims whitespace, ignores case, returns `null` for unknown values.
 */
export const normalizeCountry = (value: unknown): string | null => {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = normalizeCountryKey(value);
  if (normalized.length === 0) {
    return null;
  }

  const directMatch = COUNTRY_NAME_TO_ALPHA2[normalized];
  if (directMatch) {
    return directMatch;
  }

  const compactMatch = COUNTRY_NAME_TO_ALPHA2[normalized.replace(/\s+/g, "")];
  if (compactMatch) {
    return compactMatch;
  }

  const maybeAlpha2 = normalized.toUpperCase();
  if (/^[A-Z]{2}$/.test(maybeAlpha2) && SUPPORTED_ALPHA2_CODES.has(maybeAlpha2)) {
    return maybeAlpha2;
  }

  return null;
};
