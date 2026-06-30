/**
 * Runtime validation schemas for canonical profile domain models.
 */

import { z } from "zod";
import type { CanonicalProfile } from "../../types/canonical-profile.js";

/**
 * Canonical path syntax: `field`, `field.subfield`, `items[0]`, `items[].name`.
 */
export const CANONICAL_FIELD_PATH_PATTERN =
  /^[A-Za-z_][A-Za-z0-9_]*(?:\[(?:\d+|\*)?\])?(?:\.[A-Za-z_][A-Za-z0-9_]*(?:\[(?:\d+|\*)?\])?)*$/;

/**
 * Validation schema for canonical field paths.
 */
export const CanonicalFieldPathSchema = z
  .string()
  .min(1)
  .regex(CANONICAL_FIELD_PATH_PATTERN, "Invalid canonical field path syntax.");

/**
 * Validation schema for supported source kinds.
 */
export const SourceRecordKindSchema = z.enum(["ats_json", "resume_pdf"]);

/**
 * Validation schema for extraction methods.
 */
export const ExtractionMethodSchema = z.enum([
  "structured_field_map",
  "pdf_text_span",
  "regex_match",
  "heuristic_rule"
]);

/**
 * Validation schema for confidence scores.
 */
export const ConfidenceScoreSchema = z
  .object({
    value: z.number().finite().min(0).max(1),
    model: z.literal("fixed_weighted"),
    sourceWeight: z.number().finite().min(0).max(1),
    methodWeight: z.number().finite().min(0).max(1),
    agreementWeight: z.number().finite().min(0).max(1),
    rationale: z.string().min(1)
  })
  .strict();

/**
 * Validation schema for provenance entries.
 */
export const ProvenanceEntrySchema = z
  .object({
    fieldPath: CanonicalFieldPathSchema,
    sourceKind: SourceRecordKindSchema,
    sourceId: z.string().min(1),
    method: ExtractionMethodSchema,
    sourceOrder: z.number().int().nonnegative(),
    recordedAt: z.string().datetime({ offset: true }),
    evidence: z.string().min(1).nullable()
  })
  .strict();

/**
 * Validation schema for field-level confidence records.
 */
export const FieldConfidenceSchema = z
  .object({
    fieldPath: CanonicalFieldPathSchema,
    score: ConfidenceScoreSchema
  })
  .strict();

/**
 * Validation schema for canonical location.
 */
export const CanonicalLocationSchema = z
  .object({
    city: z.string().min(1).nullable(),
    region: z.string().min(1).nullable(),
    country: z
      .string()
      .regex(/^[A-Z]{2}$/, "country must be ISO-3166 alpha-2.")
      .nullable()
  })
  .strict();

/**
 * Validation schema for canonical links.
 */
export const CanonicalLinksSchema = z
  .object({
    linkedin: z.string().url().nullable(),
    github: z.string().url().nullable(),
    portfolio: z.string().url().nullable(),
    other: z.array(z.string().url())
  })
  .strict();

/**
 * Validation schema for canonical skills.
 */
export const CanonicalSkillSchema = z
  .object({
    name: z.string().min(1),
    confidence: ConfidenceScoreSchema,
    sources: z.array(ProvenanceEntrySchema)
  })
  .strict();

/**
 * YYYY-MM date format validation.
 */
export const YearMonthSchema = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Expected YYYY-MM.");

/**
 * Validation schema for canonical experience entries.
 */
export const CanonicalExperienceSchema = z
  .object({
    company: z.string().min(1).nullable(),
    title: z.string().min(1).nullable(),
    start: YearMonthSchema.nullable(),
    end: YearMonthSchema.nullable(),
    summary: z.string().min(1).nullable()
  })
  .strict();

/**
 * Validation schema for canonical education entries.
 */
export const CanonicalEducationSchema = z
  .object({
    institution: z.string().min(1).nullable(),
    degree: z.string().min(1).nullable(),
    field: z.string().min(1).nullable(),
    endYear: z.number().int().min(1900).max(2100).nullable()
  })
  .strict();

/**
 * E.164 phone number format validation.
 */
export const E164PhoneSchema = z.string().regex(/^\+[1-9]\d{1,14}$/, "Expected E.164 phone number.");

/**
 * Canonical profile runtime validation schema.
 */
export const CanonicalProfileSchema = z
  .object({
    candidateId: z.string().min(1),
    fullName: z.string().min(1).nullable(),
    emails: z.array(z.string().email()),
    phones: z.array(E164PhoneSchema),
    location: CanonicalLocationSchema,
    links: CanonicalLinksSchema,
    headline: z.string().min(1).nullable(),
    yearsExperience: z.number().finite().nonnegative().nullable(),
    skills: z.array(CanonicalSkillSchema),
    experience: z.array(CanonicalExperienceSchema),
    education: z.array(CanonicalEducationSchema),
    provenance: z.array(ProvenanceEntrySchema),
    fieldConfidence: z.array(FieldConfidenceSchema),
    overallConfidence: ConfidenceScoreSchema
  })
  .strict();

/**
 * Inferred output type from canonical profile schema.
 */
export type CanonicalProfileSchemaOutput = z.output<typeof CanonicalProfileSchema>;

/**
 * Inferred input type for canonical profile schema.
 */
export type CanonicalProfileSchemaInput = z.input<typeof CanonicalProfileSchema>;

const _canonicalProfileSchemaTypeCheck: z.ZodType<CanonicalProfile> = CanonicalProfileSchema;
void _canonicalProfileSchemaTypeCheck;
