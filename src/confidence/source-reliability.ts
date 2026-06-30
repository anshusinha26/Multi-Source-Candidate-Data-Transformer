/**
 * Fixed deterministic reliability and weighting constants for confidence scoring.
 */

import type { ExtractionMethod } from "../types/provenance.js";
import type { SourceRecordKind } from "../types/source-record.js";

/**
 * Source reliability map.
 */
export const SOURCE_RELIABILITY: Readonly<Record<SourceRecordKind, number>> = {
  ats_json: 0.85,
  resume_pdf: 0.7
};

/**
 * Extraction-method quality map.
 */
export const EXTRACTION_QUALITY: Readonly<Record<ExtractionMethod, number>> = {
  structured_field_map: 0.9,
  regex_match: 0.75,
  pdf_text_span: 0.6,
  heuristic_rule: 0.45
};

/**
 * Deterministic agreement factors.
 */
export const AGREEMENT_FACTORS = {
  baseline: 0.65,
  multiSourceAgreement: 0.9,
  singleSourceRepeated: 0.5,
  likelyConflict: 0.35
} as const;

/**
 * Weighted coefficients for field-level confidence.
 */
export const FIELD_CONFIDENCE_WEIGHTS = {
  sourceReliability: 0.45,
  extractionQuality: 0.35,
  agreement: 0.2
} as const;

/**
 * Relative importance weights for overall confidence aggregation.
 * Keys use normalized field-path expressions.
 */
export const IMPORTANT_FIELD_WEIGHTS: Readonly<Record<string, number>> = {
  fullname: 0.22,
  "emails[]": 0.2,
  "phones[]": 0.16,
  "skills[].name": 0.14,
  yearsexperience: 0.1,
  "experience[].company": 0.08,
  "experience[].title": 0.05,
  "education[].institution": 0.05
};

/**
 * Fallback weight for non-critical fields.
 */
export const DEFAULT_FIELD_IMPORTANCE_WEIGHT = 0.03;
