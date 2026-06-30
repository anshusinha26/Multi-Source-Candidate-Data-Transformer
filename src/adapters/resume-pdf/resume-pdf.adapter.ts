/**
 * Resume PDF source adapter.
 */

import pdfParse from "pdf-parse";
import { z } from "zod";
import type { ParseError } from "../../types/errors.js";
import type { JsonValue, ResumePdfSourceRecord } from "../../types/source-record.js";
import type { Result, SourceAdapter, SourceAdapterContext } from "../contracts/source-adapter.js";

/**
 * Supported resume PDF adapter input.
 */
export interface ResumePdfAdapterInput {
  /**
   * Raw PDF bytes.
   */
  readonly bytes: Uint8Array;
  /**
   * Source file name.
   */
  readonly fileName: string;
  /**
   * Optional candidate reference.
   */
  readonly candidateReference?: string | null;
}

const ResumePdfInputSchema = z
  .object({
    bytes: z.instanceof(Uint8Array),
    fileName: z.string().min(1),
    candidateReference: z.string().nullable().optional()
  })
  .strict();

const ErrorDetailsSchema = z.object({
  reason: z.string(),
  issues: z.array(z.string())
});

const createParseError = (
  sourceId: string,
  details: z.infer<typeof ErrorDetailsSchema>
): ParseError => ({
  kind: "ParseError",
  stage: "parse",
  code: "RESUME_PDF_PARSE_FAILED",
  message: "Failed to parse resume PDF input.",
  timestamp: new Date().toISOString(),
  sourceKind: "resume_pdf",
  sourceId,
  fieldPath: null,
  details: details as JsonValue,
  cause: null,
  retryable: false
});

const normalizePdfText = (text: string): string =>
  text
    .replace(/\r\n/g, "\n")
    .replace(/\u0000/g, "")
    .split("\n")
    .map((line) => line.trimEnd())
    .join("\n")
    .trim();

/**
 * Deterministic resume PDF adapter implementation.
 * Extracts plain text only using `pdf-parse`.
 */
export const resumePdfSourceAdapter: SourceAdapter<ResumePdfAdapterInput, ResumePdfSourceRecord> = {
  kind: "resume_pdf",
  async read(
    input: ResumePdfAdapterInput,
    context: SourceAdapterContext
  ): Promise<Result<ResumePdfSourceRecord, ParseError>> {
    const parsedInput = ResumePdfInputSchema.safeParse(input);
    if (!parsedInput.success) {
      return {
        ok: false,
        error: createParseError(context.sourceId, {
          reason: "Resume PDF input schema validation failed.",
          issues: parsedInput.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`)
        })
      };
    }

    if (parsedInput.data.bytes.byteLength === 0) {
      return {
        ok: false,
        error: createParseError(context.sourceId, {
          reason: "Resume PDF input is empty.",
          issues: []
        })
      };
    }

    try {
      const parsedPdf = await pdfParse(Buffer.from(parsedInput.data.bytes));
      const text = normalizePdfText(parsedPdf.text ?? "");
      const textBytes = new TextEncoder().encode(text);

      const record: ResumePdfSourceRecord = {
        sourceId: context.sourceId,
        kind: "resume_pdf",
        group: "unstructured",
        candidateReference: parsedInput.data.candidateReference ?? context.candidateReference,
        ingestedAt: context.ingestedAt,
        sourceOrder: context.sourceOrder,
        payload: {
          fileName: parsedInput.data.fileName,
          mimeType: "application/pdf",
          bytes: textBytes
        }
      };

      return {
        ok: true,
        value: record
      };
    } catch (error) {
      return {
        ok: false,
        error: createParseError(context.sourceId, {
          reason: "pdf-parse failed to extract text.",
          issues: [error instanceof Error ? error.message : "Unknown pdf-parse failure."]
        })
      };
    }
  }
};
