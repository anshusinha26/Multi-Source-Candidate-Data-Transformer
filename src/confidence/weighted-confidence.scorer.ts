/**
 * Deterministic weighted confidence scorer.
 */

import type { ConfidenceScorer } from "./contracts/confidence-scorer.js";
import {
  AGREEMENT_FACTORS,
  DEFAULT_FIELD_IMPORTANCE_WEIGHT,
  EXTRACTION_QUALITY,
  FIELD_CONFIDENCE_WEIGHTS,
  IMPORTANT_FIELD_WEIGHTS,
  SOURCE_RELIABILITY
} from "./source-reliability.js";
import type { CanonicalProfile } from "../types/canonical-profile.js";
import type { ConfidenceScore, FieldConfidence, ProvenanceEntry } from "../types/provenance.js";

const clamp01 = (value: number): number => {
  if (value < 0) {
    return 0;
  }
  if (value > 1) {
    return 1;
  }
  return value;
};

const roundTo4 = (value: number): number => Math.round(value * 10_000) / 10_000;

const roundConfidenceScore = (score: ConfidenceScore): ConfidenceScore => ({
  ...score,
  value: roundTo4(score.value),
  sourceWeight: roundTo4(score.sourceWeight),
  methodWeight: roundTo4(score.methodWeight),
  agreementWeight: roundTo4(score.agreementWeight)
});

const normalizeMatchPath = (fieldPath: string): string =>
  fieldPath
    .replace(/\[\d+\]/g, "[]")
    .replace(/_/g, "")
    .toLowerCase()
    .trim();

const stableFieldConfidenceSort = (left: FieldConfidence, right: FieldConfidence): number =>
  left.fieldPath.localeCompare(right.fieldPath);

const collectScorableFieldPaths = (profile: CanonicalProfile): readonly string[] => {
  const fields: string[] = [];

  if (profile.fullName !== null) {
    fields.push("full_name");
  }
  if (profile.headline !== null) {
    fields.push("headline");
  }
  if (profile.yearsExperience !== null) {
    fields.push("years_experience");
  }
  if (profile.location.city !== null) {
    fields.push("location.city");
  }
  if (profile.location.region !== null) {
    fields.push("location.region");
  }
  if (profile.location.country !== null) {
    fields.push("location.country");
  }
  if (profile.links.linkedin !== null) {
    fields.push("links.linkedin");
  }
  if (profile.links.github !== null) {
    fields.push("links.github");
  }
  if (profile.links.portfolio !== null) {
    fields.push("links.portfolio");
  }

  profile.emails.forEach((_, index) => fields.push(`emails[${index}]`));
  profile.phones.forEach((_, index) => fields.push(`phones[${index}]`));
  profile.links.other.forEach((_, index) => fields.push(`links.other[${index}]`));
  profile.skills.forEach((_, index) => fields.push(`skills[${index}].name`));

  profile.experience.forEach((item, index) => {
    if (item.company !== null) {
      fields.push(`experience[${index}].company`);
    }
    if (item.title !== null) {
      fields.push(`experience[${index}].title`);
    }
    if (item.start !== null) {
      fields.push(`experience[${index}].start`);
    }
    if (item.end !== null) {
      fields.push(`experience[${index}].end`);
    }
    if (item.summary !== null) {
      fields.push(`experience[${index}].summary`);
    }
  });

  profile.education.forEach((item, index) => {
    if (item.institution !== null) {
      fields.push(`education[${index}].institution`);
    }
    if (item.degree !== null) {
      fields.push(`education[${index}].degree`);
    }
    if (item.field !== null) {
      fields.push(`education[${index}].field`);
    }
    if (item.endYear !== null) {
      fields.push(`education[${index}].endYear`);
    }
  });

  return fields;
};

const average = (values: readonly number[]): number =>
  values.length === 0 ? 0 : values.reduce((sum, value) => sum + value, 0) / values.length;

const computeAgreementFactor = (provenanceEntries: readonly ProvenanceEntry[]): number => {
  if (provenanceEntries.length <= 1) {
    return AGREEMENT_FACTORS.baseline;
  }

  const distinctSources = new Set(
    provenanceEntries.map((entry) => `${entry.sourceKind}:${entry.sourceId}`)
  ).size;
  const distinctMethods = new Set(provenanceEntries.map((entry) => entry.method)).size;

  if (distinctSources >= 2 && provenanceEntries.length === distinctSources && distinctMethods <= 2) {
    return AGREEMENT_FACTORS.multiSourceAgreement;
  }

  if (distinctSources === 1 && provenanceEntries.length > 1) {
    return AGREEMENT_FACTORS.singleSourceRepeated;
  }

  if (provenanceEntries.length > distinctSources || distinctMethods >= 3) {
    return AGREEMENT_FACTORS.likelyConflict;
  }

  return AGREEMENT_FACTORS.baseline;
};

const buildSeedScoreMap = (profile: CanonicalProfile): ReadonlyMap<string, ConfidenceScore> => {
  const map = new Map<string, ConfidenceScore>();
  const sorted = [...profile.fieldConfidence].sort(stableFieldConfidenceSort);
  for (const entry of sorted) {
    map.set(entry.fieldPath, entry.score);
  }
  return map;
};

const findSupportingProvenance = (
  profile: CanonicalProfile,
  fieldPath: string
): readonly ProvenanceEntry[] => {
  const normalizedTarget = normalizeMatchPath(fieldPath);
  return profile.provenance
    .filter((entry) => normalizeMatchPath(entry.fieldPath) === normalizedTarget)
    .sort((left, right) => {
      if (left.sourceOrder !== right.sourceOrder) {
        return left.sourceOrder - right.sourceOrder;
      }
      const sourceCompare = left.sourceId.localeCompare(right.sourceId);
      if (sourceCompare !== 0) {
        return sourceCompare;
      }
      return left.method.localeCompare(right.method);
    });
};

const computeFieldWeight = (fieldPath: string): number => {
  const normalizedPath = normalizeMatchPath(fieldPath);
  const direct = IMPORTANT_FIELD_WEIGHTS[normalizedPath];
  if (direct !== undefined) {
    return direct;
  }

  if (normalizedPath.startsWith("emails[]")) {
    return IMPORTANT_FIELD_WEIGHTS["emails[]"] ?? DEFAULT_FIELD_IMPORTANCE_WEIGHT;
  }
  if (normalizedPath.startsWith("phones[]")) {
    return IMPORTANT_FIELD_WEIGHTS["phones[]"] ?? DEFAULT_FIELD_IMPORTANCE_WEIGHT;
  }
  if (normalizedPath.startsWith("skills[].name")) {
    return IMPORTANT_FIELD_WEIGHTS["skills[].name"] ?? DEFAULT_FIELD_IMPORTANCE_WEIGHT;
  }
  if (normalizedPath.startsWith("experience[].company")) {
    return IMPORTANT_FIELD_WEIGHTS["experience[].company"] ?? DEFAULT_FIELD_IMPORTANCE_WEIGHT;
  }
  if (normalizedPath.startsWith("experience[].title")) {
    return IMPORTANT_FIELD_WEIGHTS["experience[].title"] ?? DEFAULT_FIELD_IMPORTANCE_WEIGHT;
  }
  if (normalizedPath.startsWith("education[].institution")) {
    return IMPORTANT_FIELD_WEIGHTS["education[].institution"] ?? DEFAULT_FIELD_IMPORTANCE_WEIGHT;
  }

  return DEFAULT_FIELD_IMPORTANCE_WEIGHT;
};

const computeFieldScore = (
  fieldPath: string,
  provenanceEntries: readonly ProvenanceEntry[],
  seedScore: ConfidenceScore | null
): ConfidenceScore => {
  const sourceReliability = provenanceEntries.length
    ? average(provenanceEntries.map((entry) => SOURCE_RELIABILITY[entry.sourceKind] ?? 0))
    : (seedScore?.sourceWeight ?? 0);

  const extractionQuality = provenanceEntries.length
    ? average(provenanceEntries.map((entry) => EXTRACTION_QUALITY[entry.method] ?? 0))
    : (seedScore?.methodWeight ?? 0);

  const agreementFactor = provenanceEntries.length
    ? computeAgreementFactor(provenanceEntries)
    : (seedScore?.agreementWeight ?? AGREEMENT_FACTORS.baseline);

  const value = clamp01(
    sourceReliability * FIELD_CONFIDENCE_WEIGHTS.sourceReliability +
      extractionQuality * FIELD_CONFIDENCE_WEIGHTS.extractionQuality +
      agreementFactor * FIELD_CONFIDENCE_WEIGHTS.agreement
  );

  return roundConfidenceScore({
    value,
    model: "fixed_weighted",
    sourceWeight: clamp01(sourceReliability),
    methodWeight: clamp01(extractionQuality),
    agreementWeight: clamp01(agreementFactor),
    rationale: `deterministic weighted confidence for ${fieldPath}`
  });
};

const computeOverallConfidence = (fieldConfidence: readonly FieldConfidence[]): ConfidenceScore => {
  if (fieldConfidence.length === 0) {
    return roundConfidenceScore({
      value: 0,
      model: "fixed_weighted",
      sourceWeight: 0,
      methodWeight: 0,
      agreementWeight: 0,
      rationale: "no scorable fields"
    });
  }

  const weightedEntries = fieldConfidence.map((entry) => {
    const weight = computeFieldWeight(entry.fieldPath);
    return {
      weight,
      score: entry.score
    };
  });

  const totalWeight = weightedEntries.reduce((sum, item) => sum + item.weight, 0);
  const safeWeight = totalWeight <= 0 ? 1 : totalWeight;

  const weightedValue = clamp01(
    weightedEntries.reduce((sum, item) => sum + item.score.value * item.weight, 0) / safeWeight
  );
  const weightedSource = clamp01(
    weightedEntries.reduce((sum, item) => sum + item.score.sourceWeight * item.weight, 0) / safeWeight
  );
  const weightedMethod = clamp01(
    weightedEntries.reduce((sum, item) => sum + item.score.methodWeight * item.weight, 0) / safeWeight
  );
  const weightedAgreement = clamp01(
    weightedEntries.reduce((sum, item) => sum + item.score.agreementWeight * item.weight, 0) / safeWeight
  );

  return roundConfidenceScore({
    value: weightedValue,
    model: "fixed_weighted",
    sourceWeight: weightedSource,
    methodWeight: weightedMethod,
    agreementWeight: weightedAgreement,
    rationale: "weighted aggregation across important canonical fields"
  });
};

/**
 * Deterministic weighted confidence scorer implementation.
 */
export const weightedConfidenceScorer: ConfidenceScorer = {
  id: "weighted-confidence-scorer",
  score(profile: CanonicalProfile): CanonicalProfile {
    const paths = collectScorableFieldPaths(profile);
    const seedScoreMap = buildSeedScoreMap(profile);

    const fieldConfidence: FieldConfidence[] = paths.map((fieldPath) => {
      const supportingProvenance = findSupportingProvenance(profile, fieldPath);
      const seed = seedScoreMap.get(fieldPath) ?? null;
      return {
        fieldPath,
        score: computeFieldScore(fieldPath, supportingProvenance, seed)
      };
    });

    const sortedFieldConfidence = [...fieldConfidence].sort(stableFieldConfidenceSort);
    const overallConfidence = computeOverallConfidence(sortedFieldConfidence);

    const skills = profile.skills.map((skill, index) => {
      const path = `skills[${index}].name`;
      const confidence =
        sortedFieldConfidence.find((entry) => entry.fieldPath === path)?.score ?? skill.confidence;
      return {
        ...skill,
        confidence: roundConfidenceScore(confidence)
      };
    });

    return {
      ...profile,
      skills,
      fieldConfidence: sortedFieldConfidence,
      overallConfidence
    };
  }
};
