/**
 * ATS JSON source adapter.
 */

import { z } from "zod";
import type { ParseError } from "../../types/errors.js";
import type { AtsJsonSourceRecord, JsonValue } from "../../types/source-record.js";
import type { Result, SourceAdapter, SourceAdapterContext } from "../contracts/source-adapter.js";

/**
 * Supported ATS adapter input.
 */
export type AtsJsonAdapterInput = string | Readonly<Record<string, unknown>>;

const AtsPayloadSchema = z
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

const ErrorDetailsSchema = z.object({
  reason: z.string(),
  inputType: z.string(),
  issues: z.array(z.string())
});

const createParseError = (
  sourceId: string,
  details: z.infer<typeof ErrorDetailsSchema>
): ParseError => ({
  kind: "ParseError",
  stage: "parse",
  code: "ATS_JSON_PARSE_FAILED",
  message: "Failed to parse ATS JSON input.",
  timestamp: new Date().toISOString(),
  sourceKind: "ats_json",
  sourceId,
  fieldPath: null,
  details: details as JsonValue,
  cause: null,
  retryable: false
});

const toCandidateReference = (
  payload: z.infer<typeof AtsPayloadSchema>,
  fallback: string | null
): string | null => {
  if (payload.candidate_id !== undefined) {
    return String(payload.candidate_id);
  }
  if (payload.id !== undefined) {
    return String(payload.id);
  }
  return fallback;
};

const toAtsPayload = (
  payload: z.infer<typeof AtsPayloadSchema>
): AtsJsonSourceRecord["payload"] => {
  const nextPayload: Record<string, JsonValue> = {};
  const knownKeys = [
    "id",
    "candidate_id",
    "name",
    "full_name",
    "email",
    "phone",
    "current_company",
    "title"
  ] as const;

  for (const key of knownKeys) {
    const value = payload[key];
    if (value === undefined) {
      continue;
    }
    nextPayload[key] = value;
  }

  return nextPayload;
};

const parseInput = (
  input: AtsJsonAdapterInput
): Result<z.infer<typeof AtsPayloadSchema>, z.infer<typeof ErrorDetailsSchema>> => {
  if (typeof input === "string") {
    const trimmed = input.trim();
    if (trimmed.length === 0) {
      return {
        ok: false,
        error: {
          reason: "ATS input string is empty.",
          inputType: "string",
          issues: []
        }
      };
    }

    try {
      const decoded = JSON.parse(trimmed) as unknown;
      const parsed = AtsPayloadSchema.safeParse(decoded);
      if (parsed.success) {
        return { ok: true, value: parsed.data };
      }
      return {
        ok: false,
        error: {
          reason: "ATS JSON schema validation failed.",
          inputType: "string",
          issues: parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`)
        }
      };
    } catch (error) {
      return {
        ok: false,
        error: {
          reason: "ATS input is not valid JSON.",
          inputType: "string",
          issues: [error instanceof Error ? error.message : "Unknown JSON parse failure."]
        }
      };
    }
  }

  const parsed = AtsPayloadSchema.safeParse(input);
  if (parsed.success) {
    return { ok: true, value: parsed.data };
  }

  return {
    ok: false,
    error: {
      reason: "ATS object schema validation failed.",
      inputType: "object",
      issues: parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`)
    }
  };
};

/**
 * Deterministic ATS source adapter implementation.
 */
export const atsJsonSourceAdapter: SourceAdapter<AtsJsonAdapterInput, AtsJsonSourceRecord> = {
  kind: "ats_json",
  read(input: AtsJsonAdapterInput, context: SourceAdapterContext): Result<AtsJsonSourceRecord, ParseError> {
    const parsedInput = parseInput(input);
    if (!parsedInput.ok) {
      return {
        ok: false,
        error: createParseError(context.sourceId, parsedInput.error)
      };
    }

    const payload = parsedInput.value;
    const record: AtsJsonSourceRecord = {
      sourceId: context.sourceId,
      kind: "ats_json",
      group: "structured",
      candidateReference: toCandidateReference(payload, context.candidateReference),
      ingestedAt: context.ingestedAt,
      sourceOrder: context.sourceOrder,
      payload: toAtsPayload(payload)
    };

    return {
      ok: true,
      value: record
    };
  }
};
