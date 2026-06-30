/**
 * Reusable deterministic deduplication helpers for merge layer.
 */

import type { CandidateFact, NormalizedFactValue } from "../types/candidate-fact.js";

/**
 * Deduplicated value bucket that keeps all contributing facts.
 */
export interface DedupedValueBucket<TValue> {
  /**
   * Canonical deduplicated value.
   */
  readonly value: TValue;
  /**
   * All facts that contributed to this deduplicated value.
   */
  readonly facts: readonly CandidateFact[];
}

const stableFactSort = (left: CandidateFact, right: CandidateFact): number => {
  if (left.sourceOrder !== right.sourceOrder) {
    return left.sourceOrder - right.sourceOrder;
  }
  if (left.extractionOrder !== right.extractionOrder) {
    return left.extractionOrder - right.extractionOrder;
  }
  const sourceIdCompare = left.sourceId.localeCompare(right.sourceId);
  if (sourceIdCompare !== 0) {
    return sourceIdCompare;
  }
  return left.factId.localeCompare(right.factId);
};

const toNonEmptyString = (value: NormalizedFactValue): string | null => {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

const dedupeFactsByCanonicalKey = (
  facts: readonly CandidateFact[],
  toKey: (value: string) => string
): readonly DedupedValueBucket<string>[] => {
  const buckets = new Map<string, DedupedValueBucket<string>>();
  const orderedFacts = [...facts].sort(stableFactSort);

  for (const fact of orderedFacts) {
    const value = toNonEmptyString(fact.normalizedValue);
    if (!value) {
      continue;
    }

    const key = toKey(value);
    const existing = buckets.get(key);
    if (!existing) {
      buckets.set(key, {
        value,
        facts: [fact]
      });
      continue;
    }

    buckets.set(key, {
      value: existing.value,
      facts: [...existing.facts, fact]
    });
  }

  return [...buckets.values()];
};

const normalizeEmailKey = (value: string): string => value.trim().toLowerCase();
const normalizePhoneKey = (value: string): string => value.trim().toLowerCase();
const normalizeLinkKey = (value: string): string =>
  value
    .trim()
    .toLowerCase()
    .replace(/\/+$/g, "");
const normalizeSkillKey = (value: string): string => value.trim().toLowerCase();

/**
 * Deduplicates email facts by canonical email value.
 */
export const deduplicateEmails = (
  facts: readonly CandidateFact[]
): readonly DedupedValueBucket<string>[] => dedupeFactsByCanonicalKey(facts, normalizeEmailKey);

/**
 * Deduplicates phone facts by canonical phone value.
 */
export const deduplicatePhones = (
  facts: readonly CandidateFact[]
): readonly DedupedValueBucket<string>[] => dedupeFactsByCanonicalKey(facts, normalizePhoneKey);

/**
 * Deduplicates link facts by canonical link value.
 */
export const deduplicateLinks = (
  facts: readonly CandidateFact[]
): readonly DedupedValueBucket<string>[] => dedupeFactsByCanonicalKey(facts, normalizeLinkKey);

/**
 * Deduplicates skill facts by canonical skill value.
 */
export const deduplicateSkills = (
  facts: readonly CandidateFact[]
): readonly DedupedValueBucket<string>[] => dedupeFactsByCanonicalKey(facts, normalizeSkillKey);
