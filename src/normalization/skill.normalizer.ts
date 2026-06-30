/**
 * Pure skill canonicalization helpers.
 */

/**
 * Canonical skill synonym map.
 * Extend this map to support additional synonyms.
 */
export const DEFAULT_SKILL_SYNONYMS: Readonly<Record<string, string>> = {
  js: "JavaScript",
  javascript: "JavaScript",
  ecmascript: "JavaScript",
  ts: "TypeScript",
  typescript: "TypeScript",
  node: "Node.js",
  "node js": "Node.js",
  nodejs: "Node.js",
  postgres: "PostgreSQL",
  postgresql: "PostgreSQL"
};

const normalizeSkillKey = (value: string): string =>
  value
    .trim()
    .toLowerCase()
    .replace(/[._-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

/**
 * Normalizes skill names using a deterministic synonym map.
 * Unknown values are returned as trimmed input.
 */
export const normalizeSkill = (
  value: unknown,
  synonymMap: Readonly<Record<string, string>> = DEFAULT_SKILL_SYNONYMS
): string | null => {
  if (typeof value !== "string") {
    return null;
  }

  const cleaned = value.trim().replace(/\s+/g, " ");
  if (cleaned.length === 0) {
    return null;
  }

  const key = normalizeSkillKey(cleaned);
  const canonical = synonymMap[key];
  if (canonical) {
    return canonical;
  }

  return cleaned;
};
