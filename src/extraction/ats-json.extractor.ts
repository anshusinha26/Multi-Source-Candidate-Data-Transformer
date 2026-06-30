/**
 * ATS JSON extractor.
 */

import { z } from "zod";
import type { Result } from "../adapters/contracts/source-adapter.js";
import type {
  CandidateFact,
  PrimitiveCandidateFact
} from "../types/candidate-fact.js";
import type { ExtractionError } from "../types/errors.js";
import type { AtsJsonSourceRecord, JsonValue, SourceRecord } from "../types/source-record.js";
import type { ConfidenceScore } from "../types/provenance.js";
import type { Extractor } from "./contracts/extractor.js";

const AtsExtractionPayloadSchema = z
  .object({
    id: z.union([z.string(), z.number()]).optional(),
    candidate_id: z.union([z.string(), z.number()]).optional(),
    name: z.string().nullable().optional(),
    full_name: z.string().nullable().optional(),
    email: z.string().nullable().optional(),
    phone: z.string().nullable().optional(),
    current_company: z.string().nullable().optional(),
    title: z.string().nullable().optional()
  })
  .passthrough();

const BASE_CONFIDENCE: ConfidenceScore = {
  value: 0.6,
  model: "fixed_weighted",
  sourceWeight: 0.6,
  methodWeight: 0.6,
  agreementWeight: 0.6,
  rationale: "structured source direct field lookup"
};

const createExtractionError = (
  source: AtsJsonSourceRecord,
  message: string,
  details: JsonValue | null
): ExtractionError => ({
  kind: "ExtractionError",
  stage: "extraction",
  code: "ATS_EXTRACTION_FAILED",
  message,
  timestamp: source.ingestedAt,
  sourceKind: source.kind,
  sourceId: source.sourceId,
  fieldPath: null,
  details,
  cause: null,
  retryable: false
});

const toNonEmptyString = (value: unknown): string | null => {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }
  return null;
};

const makePrimitiveFact = (
  source: AtsJsonSourceRecord,
  fieldPath: string,
  sourceField: string,
  value: string,
  extractionOrder: number
): PrimitiveCandidateFact => ({
  factId: `${source.sourceId}:${fieldPath}:${String(extractionOrder).padStart(4, "0")}`,
  fieldPath,
  sourceKind: source.kind,
  sourceId: source.sourceId,
  extractionMethod: "structured_field_map",
  originalValue: value,
  normalizedValue: value,
  valueKind: "primitive",
  confidence: BASE_CONFIDENCE,
  sourceOrder: source.sourceOrder,
  extractionOrder,
  extractedAt: source.ingestedAt,
  provenance: {
    fieldPath,
    sourceKind: source.kind,
    sourceId: source.sourceId,
    method: "structured_field_map",
    sourceOrder: source.sourceOrder,
    recordedAt: source.ingestedAt,
    evidence: `ats field ${sourceField}`
  }
});

type FieldMapping = {
  readonly fieldPath: string;
  readonly sourceFields: readonly (keyof z.infer<typeof AtsExtractionPayloadSchema>)[];
};

const FIELD_MAPPINGS: readonly FieldMapping[] = [
  { fieldPath: "full_name", sourceFields: ["full_name", "name"] },
  { fieldPath: "emails[0]", sourceFields: ["email"] },
  { fieldPath: "phones[0]", sourceFields: ["phone"] },
  { fieldPath: "experience[0].company", sourceFields: ["current_company"] },
  { fieldPath: "experience[0].title", sourceFields: ["title"] }
];

/**
 * Deterministic ATS extractor implementation.
 */
export const atsJsonExtractor: Extractor = {
  id: "ats-json-extractor",
  kind: "ats_json",
  extract(source: SourceRecord): Result<readonly CandidateFact[], ExtractionError> {
    if (source.kind !== "ats_json") {
      return {
        ok: false,
        error: {
          kind: "ExtractionError",
          stage: "extraction",
          code: "ATS_EXTRACTION_FAILED",
          message: "Unsupported source kind for ATS extractor.",
          timestamp: source.ingestedAt,
          sourceKind: source.kind,
          sourceId: source.sourceId,
          fieldPath: null,
          details: {
            receivedKind: source.kind
          },
          cause: null,
          retryable: false
        }
      };
    }

    const atsSource: AtsJsonSourceRecord = source;

    const parsedPayload = AtsExtractionPayloadSchema.safeParse(atsSource.payload);
    if (!parsedPayload.success) {
      return {
        ok: false,
        error: createExtractionError(atsSource, "ATS payload validation failed during extraction.", {
          issues: parsedPayload.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`)
        })
      };
    }

    let order = 1;
    const facts: CandidateFact[] = [];

    for (const mapping of FIELD_MAPPINGS) {
      for (const sourceField of mapping.sourceFields) {
        const raw = parsedPayload.data[sourceField];
        const value = toNonEmptyString(raw);
        if (!value) {
          continue;
        }

        facts.push(makePrimitiveFact(atsSource, mapping.fieldPath, sourceField, value, order));
        order += 1;
        break;
      }
    }

    return {
      ok: true,
      value: facts
    };
  }
};
