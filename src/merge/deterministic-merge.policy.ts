/**
 * Deterministic merge policy implementation.
 */

import type { CandidateFact, NormalizedFactValue } from "../types/candidate-fact.js";
import type {
  CanonicalEducation,
  CanonicalExperience,
  CanonicalProfile,
  CanonicalSkill
} from "../types/canonical-profile.js";
import type { ConfidenceScore, FieldConfidence, ProvenanceEntry } from "../types/provenance.js";
import { deduplicateEmails, deduplicateLinks, deduplicatePhones, deduplicateSkills } from "./deduplicate.js";
import type { ExtractionQualityMap, MergeOptions, MergePolicy, SourcePrecedenceMap } from "./contracts/merge-policy.js";

const DEFAULT_SOURCE_PRECEDENCE: SourcePrecedenceMap = {
  ats_json: 100,
  resume_pdf: 50
};

const DEFAULT_EXTRACTION_QUALITY: ExtractionQualityMap = {
  structured_field_map: 100,
  regex_match: 80,
  pdf_text_span: 60,
  heuristic_rule: 40
};

const DEFAULT_OVERALL_CONFIDENCE_PLACEHOLDER: ConfidenceScore = {
  value: 0,
  model: "fixed_weighted",
  sourceWeight: 0,
  methodWeight: 0,
  agreementWeight: 0,
  rationale: "placeholder; final confidence aggregation not implemented"
};

const stableSerialize = (value: NormalizedFactValue): string => {
  if (value === null) {
    return "null";
  }
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableSerialize(item)).join(",")}]`;
  }

  const entries = Object.entries(value).sort(([leftKey], [rightKey]) => leftKey.localeCompare(rightKey));
  return `{${entries.map(([key, item]) => `${key}:${stableSerialize(item)}`).join(",")}}`;
};

const stableFactSort = (left: CandidateFact, right: CandidateFact): number => {
  if (left.sourceOrder !== right.sourceOrder) {
    return left.sourceOrder - right.sourceOrder;
  }
  if (left.extractionOrder !== right.extractionOrder) {
    return left.extractionOrder - right.extractionOrder;
  }
  const sourceCompare = left.sourceId.localeCompare(right.sourceId);
  if (sourceCompare !== 0) {
    return sourceCompare;
  }
  return left.factId.localeCompare(right.factId);
};

const normalizePath = (fieldPath: string): string =>
  fieldPath
    .replace(/\[\d+\]/g, "[]")
    .trim()
    .toLowerCase();

const groupByFieldPath = (facts: readonly CandidateFact[]): ReadonlyMap<string, readonly CandidateFact[]> => {
  const buckets = new Map<string, CandidateFact[]>();
  for (const fact of [...facts].sort(stableFactSort)) {
    const key = fact.fieldPath;
    const existing = buckets.get(key);
    if (!existing) {
      buckets.set(key, [fact]);
      continue;
    }
    buckets.set(key, [...existing, fact]);
  }
  return buckets;
};

const toNonEmptyString = (value: NormalizedFactValue): string | null => {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

const toNullableNumber = (value: NormalizedFactValue): number | null => {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string") {
    const parsed = Number(value.trim());
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};

const uniqueProvenance = (facts: readonly CandidateFact[]): readonly ProvenanceEntry[] => {
  const seen = new Set<string>();
  const ordered = [...facts].sort(stableFactSort);
  const result: ProvenanceEntry[] = [];

  for (const fact of ordered) {
    const entry = fact.provenance;
    const key = [
      entry.fieldPath,
      entry.sourceKind,
      entry.sourceId,
      entry.method,
      String(entry.sourceOrder),
      entry.recordedAt,
      entry.evidence ?? ""
    ].join("|");
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    result.push({ ...entry });
  }

  return result;
};

const createWinnerSelector = (
  options: MergeOptions
): ((facts: readonly CandidateFact[]) => CandidateFact | null) => {
  const comparator = (left: CandidateFact, right: CandidateFact): number => {
    const leftSourceScore = options.sourcePrecedence[left.sourceKind] ?? 0;
    const rightSourceScore = options.sourcePrecedence[right.sourceKind] ?? 0;
    if (leftSourceScore !== rightSourceScore) {
      return rightSourceScore - leftSourceScore;
    }

    const leftConfidence = left.confidence.value;
    const rightConfidence = right.confidence.value;
    if (leftConfidence !== rightConfidence) {
      return rightConfidence - leftConfidence;
    }

    const leftExtractionScore = options.extractionQuality[left.extractionMethod] ?? 0;
    const rightExtractionScore = options.extractionQuality[right.extractionMethod] ?? 0;
    if (leftExtractionScore !== rightExtractionScore) {
      return rightExtractionScore - leftExtractionScore;
    }

    const leftLexical = stableSerialize(left.normalizedValue);
    const rightLexical = stableSerialize(right.normalizedValue);
    const lexicalCompare = leftLexical.localeCompare(rightLexical);
    if (lexicalCompare !== 0) {
      return lexicalCompare;
    }

    return stableFactSort(left, right);
  };

  return (facts: readonly CandidateFact[]): CandidateFact | null => {
    if (facts.length === 0) {
      return null;
    }
    return [...facts].sort(comparator)[0] ?? null;
  };
};

const collectByPattern = (
  facts: readonly CandidateFact[],
  test: (normalizedPath: string) => boolean
): readonly CandidateFact[] =>
  facts.filter((fact) => test(normalizePath(fact.fieldPath)));

const pickScalarFact = (
  grouped: ReadonlyMap<string, readonly CandidateFact[]>,
  candidates: readonly string[],
  chooseWinner: (facts: readonly CandidateFact[]) => CandidateFact | null
): CandidateFact | null => {
  const collected: CandidateFact[] = [];
  const normalizedCandidates = new Set(candidates.map((path) => normalizePath(path)));

  for (const [fieldPath, facts] of grouped.entries()) {
    if (!normalizedCandidates.has(normalizePath(fieldPath))) {
      continue;
    }
    collected.push(...facts);
  }

  return chooseWinner(collected);
};

const createFieldConfidence = (fieldPath: string, fact: CandidateFact | null): FieldConfidence[] =>
  fact
    ? [
        {
          fieldPath,
          score: fact.confidence
        }
      ]
    : [];

const parseExperienceField = (fieldPath: string): { index: number; field: keyof CanonicalExperience } | null => {
  const match = /^experience\[(\d+)\]\.(company|title|start|end|summary)$/i.exec(fieldPath);
  if (!match) {
    return null;
  }
  const indexPart = match[1];
  const fieldPart = match[2];
  if (!indexPart || !fieldPart) {
    return null;
  }

  return {
    index: Number(indexPart),
    field: fieldPart.toLowerCase() as keyof CanonicalExperience
  };
};

const parseEducationField = (fieldPath: string): { index: number; field: keyof CanonicalEducation } | null => {
  const match = /^education\[(\d+)\]\.(institution|degree|field|end_year|endyear)$/i.exec(fieldPath);
  if (!match) {
    return null;
  }
  const indexPart = match[1];
  const rawFieldPart = match[2];
  if (!indexPart || !rawFieldPart) {
    return null;
  }

  const rawField = rawFieldPart.toLowerCase();
  const field = rawField === "end_year" || rawField === "endyear" ? "endYear" : rawField;
  return {
    index: Number(indexPart),
    field: field as keyof CanonicalEducation
  };
};

const buildExperience = (
  grouped: ReadonlyMap<string, readonly CandidateFact[]>,
  chooseWinner: (facts: readonly CandidateFact[]) => CandidateFact | null
): {
  readonly experience: readonly CanonicalExperience[];
  readonly fieldConfidence: readonly FieldConfidence[];
} => {
  const byIndex = new Map<number, Partial<Record<keyof CanonicalExperience, CandidateFact[]>>>();

  for (const [fieldPath, facts] of grouped.entries()) {
    const parsed = parseExperienceField(fieldPath);
    if (!parsed) {
      continue;
    }
    const existing = byIndex.get(parsed.index) ?? {};
    const currentFacts = existing[parsed.field] ?? [];
    byIndex.set(parsed.index, {
      ...existing,
      [parsed.field]: [...currentFacts, ...facts]
    });
  }

  const fieldConfidence: FieldConfidence[] = [];
  const experience = [...byIndex.entries()]
    .sort(([left], [right]) => left - right)
    .map(([index, fields]) => {
      const companyFact = chooseWinner(fields.company ?? []);
      const titleFact = chooseWinner(fields.title ?? []);
      const startFact = chooseWinner(fields.start ?? []);
      const endFact = chooseWinner(fields.end ?? []);
      const summaryFact = chooseWinner(fields.summary ?? []);

      fieldConfidence.push(...createFieldConfidence(`experience[${index}].company`, companyFact));
      fieldConfidence.push(...createFieldConfidence(`experience[${index}].title`, titleFact));
      fieldConfidence.push(...createFieldConfidence(`experience[${index}].start`, startFact));
      fieldConfidence.push(...createFieldConfidence(`experience[${index}].end`, endFact));
      fieldConfidence.push(...createFieldConfidence(`experience[${index}].summary`, summaryFact));

      return {
        company: companyFact ? toNonEmptyString(companyFact.normalizedValue) : null,
        title: titleFact ? toNonEmptyString(titleFact.normalizedValue) : null,
        start: startFact ? toNonEmptyString(startFact.normalizedValue) : null,
        end: endFact ? toNonEmptyString(endFact.normalizedValue) : null,
        summary: summaryFact ? toNonEmptyString(summaryFact.normalizedValue) : null
      };
    });

  return {
    experience,
    fieldConfidence
  };
};

const buildEducation = (
  grouped: ReadonlyMap<string, readonly CandidateFact[]>,
  chooseWinner: (facts: readonly CandidateFact[]) => CandidateFact | null
): {
  readonly education: readonly CanonicalEducation[];
  readonly fieldConfidence: readonly FieldConfidence[];
} => {
  const byIndex = new Map<number, Partial<Record<keyof CanonicalEducation, CandidateFact[]>>>();

  for (const [fieldPath, facts] of grouped.entries()) {
    const parsed = parseEducationField(fieldPath);
    if (!parsed) {
      continue;
    }
    const existing = byIndex.get(parsed.index) ?? {};
    const currentFacts = existing[parsed.field] ?? [];
    byIndex.set(parsed.index, {
      ...existing,
      [parsed.field]: [...currentFacts, ...facts]
    });
  }

  const fieldConfidence: FieldConfidence[] = [];
  const education = [...byIndex.entries()]
    .sort(([left], [right]) => left - right)
    .map(([index, fields]) => {
      const institutionFact = chooseWinner(fields.institution ?? []);
      const degreeFact = chooseWinner(fields.degree ?? []);
      const fieldFact = chooseWinner(fields.field ?? []);
      const endYearFact = chooseWinner(fields.endYear ?? []);

      fieldConfidence.push(...createFieldConfidence(`education[${index}].institution`, institutionFact));
      fieldConfidence.push(...createFieldConfidence(`education[${index}].degree`, degreeFact));
      fieldConfidence.push(...createFieldConfidence(`education[${index}].field`, fieldFact));
      fieldConfidence.push(...createFieldConfidence(`education[${index}].endYear`, endYearFact));

      return {
        institution: institutionFact ? toNonEmptyString(institutionFact.normalizedValue) : null,
        degree: degreeFact ? toNonEmptyString(degreeFact.normalizedValue) : null,
        field: fieldFact ? toNonEmptyString(fieldFact.normalizedValue) : null,
        endYear: endYearFact ? toNullableNumber(endYearFact.normalizedValue) : null
      };
    });

  return {
    education,
    fieldConfidence
  };
};

const toCanonicalSkills = (
  facts: readonly CandidateFact[],
  chooseWinner: (facts: readonly CandidateFact[]) => CandidateFact | null
): {
  readonly skills: readonly CanonicalSkill[];
  readonly fieldConfidence: readonly FieldConfidence[];
} => {
  const skillBuckets = deduplicateSkills(facts);
  const fieldConfidence: FieldConfidence[] = [];
  const skills: CanonicalSkill[] = [];

  skillBuckets.forEach((bucket, index) => {
    const winner = chooseWinner(bucket.facts);
    if (!winner) {
      return;
    }

    skills.push({
      name: bucket.value,
      confidence: winner.confidence,
      sources: uniqueProvenance(bucket.facts)
    });
    fieldConfidence.push({
      fieldPath: `skills[${index}].name`,
      score: winner.confidence
    });
  });

  return {
    skills,
    fieldConfidence
  };
};

const createCandidateId = (facts: readonly CandidateFact[]): string => {
  const idFact = [...facts]
    .filter((fact) => {
      const path = normalizePath(fact.fieldPath);
      return path === "candidate_id" || path === "candidate.id" || path === "id";
    })
    .sort(stableFactSort)[0];

  const fromFact = idFact ? toNonEmptyString(idFact.normalizedValue) : null;
  if (fromFact) {
    return fromFact;
  }

  const fromSource = [...facts].sort(stableFactSort)[0]?.sourceId ?? null;
  return fromSource ?? "unknown_candidate";
};

const createDefaultOptions = (): MergeOptions => ({
  sourcePrecedence: DEFAULT_SOURCE_PRECEDENCE,
  extractionQuality: DEFAULT_EXTRACTION_QUALITY
});

/**
 * Creates deterministic merge policy instance.
 */
export const createDeterministicMergePolicy = (options?: Partial<MergeOptions>): MergePolicy => {
  const resolvedOptions: MergeOptions = {
    sourcePrecedence: options?.sourcePrecedence ?? DEFAULT_SOURCE_PRECEDENCE,
    extractionQuality: options?.extractionQuality ?? DEFAULT_EXTRACTION_QUALITY
  };

  const chooseWinner = createWinnerSelector(resolvedOptions);

  return {
    id: "deterministic-merge-policy",
    merge(facts: readonly CandidateFact[]): CanonicalProfile {
      const orderedFacts = [...facts].sort(stableFactSort);
      const grouped = groupByFieldPath(orderedFacts);
      const provenance = uniqueProvenance(orderedFacts);

      const fullNameFact = pickScalarFact(grouped, ["full_name", "fullName"], chooseWinner);
      const headlineFact = pickScalarFact(grouped, ["headline"], chooseWinner);
      const yearsFact = pickScalarFact(grouped, ["years_experience", "yearsExperience"], chooseWinner);
      const cityFact = pickScalarFact(grouped, ["location.city"], chooseWinner);
      const regionFact = pickScalarFact(grouped, ["location.region"], chooseWinner);
      const countryFact = pickScalarFact(grouped, ["location.country"], chooseWinner);

      const linkedInFact = pickScalarFact(grouped, ["links.linkedin", "linkedin"], chooseWinner);
      const githubFact = pickScalarFact(grouped, ["links.github", "github"], chooseWinner);
      const portfolioFact = pickScalarFact(grouped, ["links.portfolio", "portfolio"], chooseWinner);

      const emailFacts = collectByPattern(orderedFacts, (path) => /^emails(?:\[\])?$/.test(path));
      const phoneFacts = collectByPattern(orderedFacts, (path) => /^phones(?:\[\])?$/.test(path));
      const linkOtherFacts = collectByPattern(orderedFacts, (path) =>
        /^links\.other(?:\[\])?$/.test(path)
      );
      const skillFacts = collectByPattern(orderedFacts, (path) =>
        /^skills(?:\[\])?(?:\.name)?$/.test(path)
      );

      const dedupedEmails = deduplicateEmails(emailFacts);
      const dedupedPhones = deduplicatePhones(phoneFacts);
      const dedupedLinks = deduplicateLinks(linkOtherFacts);
      const skillPayload = toCanonicalSkills(skillFacts, chooseWinner);

      const experiencePayload = buildExperience(grouped, chooseWinner);
      const educationPayload = buildEducation(grouped, chooseWinner);

      const fieldConfidence: FieldConfidence[] = [
        ...createFieldConfidence("full_name", fullNameFact),
        ...createFieldConfidence("headline", headlineFact),
        ...createFieldConfidence("years_experience", yearsFact),
        ...createFieldConfidence("location.city", cityFact),
        ...createFieldConfidence("location.region", regionFact),
        ...createFieldConfidence("location.country", countryFact),
        ...createFieldConfidence("links.linkedin", linkedInFact),
        ...createFieldConfidence("links.github", githubFact),
        ...createFieldConfidence("links.portfolio", portfolioFact),
        ...dedupedEmails.flatMap((bucket, index) => {
          const winner = chooseWinner(bucket.facts);
          return winner
            ? [
                {
                  fieldPath: `emails[${index}]`,
                  score: winner.confidence
                }
              ]
            : [];
        }),
        ...dedupedPhones.flatMap((bucket, index) => {
          const winner = chooseWinner(bucket.facts);
          return winner
            ? [
                {
                  fieldPath: `phones[${index}]`,
                  score: winner.confidence
                }
              ]
            : [];
        }),
        ...dedupedLinks.flatMap((bucket, index) => {
          const winner = chooseWinner(bucket.facts);
          return winner
            ? [
                {
                  fieldPath: `links.other[${index}]`,
                  score: winner.confidence
                }
              ]
            : [];
        }),
        ...skillPayload.fieldConfidence,
        ...experiencePayload.fieldConfidence,
        ...educationPayload.fieldConfidence
      ];

      return {
        candidateId: createCandidateId(orderedFacts),
        fullName: fullNameFact ? toNonEmptyString(fullNameFact.normalizedValue) : null,
        emails: dedupedEmails.map((bucket) => bucket.value),
        phones: dedupedPhones.map((bucket) => bucket.value),
        location: {
          city: cityFact ? toNonEmptyString(cityFact.normalizedValue) : null,
          region: regionFact ? toNonEmptyString(regionFact.normalizedValue) : null,
          country: countryFact ? toNonEmptyString(countryFact.normalizedValue) : null
        },
        links: {
          linkedin: linkedInFact ? toNonEmptyString(linkedInFact.normalizedValue) : null,
          github: githubFact ? toNonEmptyString(githubFact.normalizedValue) : null,
          portfolio: portfolioFact ? toNonEmptyString(portfolioFact.normalizedValue) : null,
          other: dedupedLinks.map((bucket) => bucket.value)
        },
        headline: headlineFact ? toNonEmptyString(headlineFact.normalizedValue) : null,
        yearsExperience: yearsFact ? toNullableNumber(yearsFact.normalizedValue) : null,
        skills: skillPayload.skills,
        experience: experiencePayload.experience,
        education: educationPayload.education,
        provenance,
        fieldConfidence,
        overallConfidence: DEFAULT_OVERALL_CONFIDENCE_PLACEHOLDER
      };
    }
  };
};

/**
 * Default deterministic merge policy instance.
 */
export const deterministicMergePolicy = createDeterministicMergePolicy(createDefaultOptions());
