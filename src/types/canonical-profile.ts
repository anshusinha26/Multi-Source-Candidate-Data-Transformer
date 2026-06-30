/**
 * Domain types for canonical internal candidate profile.
 */

import type {
  CanonicalFieldPath,
  ConfidenceScore,
  FieldConfidence,
  ProvenanceEntry
} from "./provenance.js";
import type { NormalizedFactValue } from "./candidate-fact.js";

/**
 * Canonical location model.
 */
export interface CanonicalLocation {
  readonly city: string | null;
  readonly region: string | null;
  /**
   * ISO-3166 alpha-2 country code.
   */
  readonly country: string | null;
}

/**
 * Canonical links model.
 */
export interface CanonicalLinks {
  readonly linkedin: string | null;
  readonly github: string | null;
  readonly portfolio: string | null;
  readonly other: readonly string[];
}

/**
 * Canonical skill model with explicit confidence and source trace.
 */
export interface CanonicalSkill {
  readonly name: string;
  readonly confidence: ConfidenceScore;
  readonly sources: readonly ProvenanceEntry[];
}

/**
 * Canonical experience entry.
 */
export interface CanonicalExperience {
  readonly company: string | null;
  readonly title: string | null;
  /**
   * Start date in YYYY-MM format.
   */
  readonly start: string | null;
  /**
   * End date in YYYY-MM format.
   */
  readonly end: string | null;
  readonly summary: string | null;
}

/**
 * Canonical education entry.
 */
export interface CanonicalEducation {
  readonly institution: string | null;
  readonly degree: string | null;
  readonly field: string | null;
  readonly endYear: number | null;
}

/**
 * Internal source-of-truth candidate profile.
 * This model is pre-projection and should not include output remapping concerns.
 */
export interface CanonicalProfile {
  readonly candidateId: string;
  readonly fullName: string | null;
  readonly emails: readonly string[];
  readonly phones: readonly string[];
  readonly location: CanonicalLocation;
  readonly links: CanonicalLinks;
  readonly headline: string | null;
  readonly yearsExperience: number | null;
  readonly skills: readonly CanonicalSkill[];
  readonly experience: readonly CanonicalExperience[];
  readonly education: readonly CanonicalEducation[];
  readonly provenance: readonly ProvenanceEntry[];
  readonly fieldConfidence: readonly FieldConfidence[];
  readonly overallConfidence: ConfidenceScore;
}

/**
 * Canonical profile map keyed by canonical field path.
 */
export type CanonicalFieldMap = Readonly<Record<CanonicalFieldPath, NormalizedFactValue>>;
