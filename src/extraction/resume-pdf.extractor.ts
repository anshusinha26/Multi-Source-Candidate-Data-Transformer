/**
 * Resume PDF extractor using deterministic regex/pattern rules only.
 */

import { z } from "zod";
import type { Result } from "../adapters/contracts/source-adapter.js";
import type {
  CandidateFact,
  PrimitiveCandidateFact
} from "../types/candidate-fact.js";
import type { ExtractionError } from "../types/errors.js";
import type { JsonValue, ResumePdfSourceRecord, SourceRecord } from "../types/source-record.js";
import type { ConfidenceScore } from "../types/provenance.js";
import type { Extractor } from "./contracts/extractor.js";

const ResumePayloadSchema = z
  .object({
    fileName: z.string().min(1),
    mimeType: z.literal("application/pdf"),
    bytes: z.instanceof(Uint8Array)
  })
  .strict();

const BASE_CONFIDENCE: ConfidenceScore = {
  value: 0.45,
  model: "fixed_weighted",
  sourceWeight: 0.45,
  methodWeight: 0.45,
  agreementWeight: 0.45,
  rationale: "resume regex/pattern extraction"
};

const EMAIL_PATTERN = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const PHONE_PATTERN = /(?:\+?\d[\d().\s-]{7,}\d)/g;
const YEAR_OR_MONTH_PATTERN =
  /\b((19|20)\d{2}|jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)\b/i;
const NAME_PATTERN = /^[A-Za-z][A-Za-z.'-]*(?:\s+[A-Za-z][A-Za-z.'-]*){1,3}$/;

const SECTION_STOP_PATTERNS = [
  /^experience$/i,
  /^work experience$/i,
  /^professional experience$/i,
  /^education$/i,
  /^academic background$/i,
  /^skills$/i,
  /^technical skills$/i,
  /^core skills$/i,
  /^projects?$/i,
  /^certifications?$/i,
  /^summary$/i
];

const EXPERIENCE_SECTION_PATTERNS = [
  /^experience$/i,
  /^work experience$/i,
  /^professional experience$/i
];

const EDUCATION_SECTION_PATTERNS = [/^education$/i, /^academic background$/i];

const SKILLS_SECTION_PATTERNS = [/^skills$/i, /^technical skills$/i, /^core skills$/i];

const NAME_EXCLUDE_TOKENS = new Set([
  "resume",
  "curriculum vitae",
  "contact",
  "experience",
  "education",
  "skills",
  "summary"
]);

const createExtractionError = (
  source: ResumePdfSourceRecord,
  message: string,
  details: JsonValue | null
): ExtractionError => ({
  kind: "ExtractionError",
  stage: "extraction",
  code: "RESUME_EXTRACTION_FAILED",
  message,
  timestamp: source.ingestedAt,
  sourceKind: source.kind,
  sourceId: source.sourceId,
  fieldPath: null,
  details,
  cause: null,
  retryable: false
});

const createFact = (
  source: ResumePdfSourceRecord,
  fieldPath: string,
  value: string,
  extractionOrder: number,
  evidence: string
): PrimitiveCandidateFact => ({
  factId: `${source.sourceId}:${fieldPath}:${String(extractionOrder).padStart(4, "0")}`,
  fieldPath,
  sourceKind: source.kind,
  sourceId: source.sourceId,
  extractionMethod: "regex_match",
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
    method: "regex_match",
    sourceOrder: source.sourceOrder,
    recordedAt: source.ingestedAt,
    evidence
  }
});

const decodeResumeText = (bytes: Uint8Array): string =>
  new TextDecoder().decode(bytes).replace(/\r\n/g, "\n").replace(/\u0000/g, "").trim();

const toNonEmptyLines = (text: string): readonly string[] =>
  text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

const dedupePreserveOrder = (values: readonly string[]): readonly string[] => {
  const seen = new Set<string>();
  const deduped: string[] = [];
  for (const value of values) {
    const key = value.toLowerCase();
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    deduped.push(value);
  }
  return deduped;
};

const extractByRegex = (text: string, pattern: RegExp): readonly string[] => {
  const matches = text.match(pattern) ?? [];
  return dedupePreserveOrder(
    matches
      .map((value) => value.trim())
      .filter((value) => value.length > 0)
  );
};

const extractName = (lines: readonly string[]): string | null => {
  for (const line of lines.slice(0, 12)) {
    const lower = line.toLowerCase();
    if (NAME_EXCLUDE_TOKENS.has(lower)) {
      continue;
    }
    if (line.length > 80) {
      continue;
    }
    if (!NAME_PATTERN.test(line)) {
      continue;
    }
    return line;
  }
  return null;
};

const findSectionRange = (
  lines: readonly string[],
  sectionStartPatterns: readonly RegExp[]
): readonly string[] => {
  const startIndex = lines.findIndex((line) =>
    sectionStartPatterns.some((pattern) => pattern.test(line))
  );
  if (startIndex === -1) {
    return [];
  }

  let endIndex = lines.length;
  for (let index = startIndex + 1; index < lines.length; index += 1) {
    const line = lines[index];
    if (!line) {
      continue;
    }
    if (SECTION_STOP_PATTERNS.some((pattern) => pattern.test(line))) {
      endIndex = index;
      break;
    }
  }

  return lines.slice(startIndex + 1, endIndex).filter((line) => line.length > 0);
};

const splitBlocks = (lines: readonly string[]): readonly string[] => {
  if (lines.length === 0) {
    return [];
  }

  return lines
    .join("\n")
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter((block) => block.length > 0);
};

const extractExperienceBlocks = (lines: readonly string[]): readonly string[] =>
  splitBlocks(findSectionRange(lines, EXPERIENCE_SECTION_PATTERNS)).filter((block) =>
    YEAR_OR_MONTH_PATTERN.test(block)
  );

const EDUCATION_LINE_PATTERN = /\b(university|college|school|institute|academy|polytechnic)\b/i;

const extractEducationInstitutions = (lines: readonly string[]): readonly string[] => {
  const blocks = splitBlocks(findSectionRange(lines, EDUCATION_SECTION_PATTERNS));
  const institutions: string[] = [];

  for (const block of blocks) {
    const candidateLine = block
      .split("\n")
      .map((line) => line.trim())
      .find((line) => EDUCATION_LINE_PATTERN.test(line));
    if (!candidateLine) {
      continue;
    }
    institutions.push(candidateLine);
  }

  return dedupePreserveOrder(institutions);
};

const normalizeSkillToken = (token: string): string =>
  token
    .replace(/^[•\-*]+/, "")
    .replace(/\s+/g, " ")
    .trim();

const extractSkills = (lines: readonly string[]): readonly string[] => {
  const skillSectionLines = findSectionRange(lines, SKILLS_SECTION_PATTERNS);
  if (skillSectionLines.length === 0) {
    return [];
  }

  const rawTokens = skillSectionLines
    .join("\n")
    .split(/[,;|•\n]/g)
    .map((token) => normalizeSkillToken(token))
    .filter((token) => token.length >= 2 && token.length <= 48)
    .filter((token) => /[A-Za-z]/.test(token));

  return dedupePreserveOrder(rawTokens);
};

const extractPhones = (text: string): readonly string[] =>
  extractByRegex(text, PHONE_PATTERN).filter((candidate) => {
    const digitCount = candidate.replace(/\D/g, "").length;
    return digitCount >= 10 && digitCount <= 15;
  });

/**
 * Deterministic resume extractor implementation.
 */
export const resumePdfExtractor: Extractor = {
  id: "resume-pdf-extractor",
  kind: "resume_pdf",
  extract(source: SourceRecord): Result<readonly CandidateFact[], ExtractionError> {
    if (source.kind !== "resume_pdf") {
      return {
        ok: false,
        error: {
          kind: "ExtractionError",
          stage: "extraction",
          code: "RESUME_EXTRACTION_FAILED",
          message: "Unsupported source kind for resume extractor.",
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

    const resumeSource: ResumePdfSourceRecord = source;

    const parsedPayload = ResumePayloadSchema.safeParse(resumeSource.payload);
    if (!parsedPayload.success) {
      return {
        ok: false,
        error: createExtractionError(
          resumeSource,
          "Resume payload validation failed during extraction.",
          {
            issues: parsedPayload.error.issues.map(
              (issue) => `${issue.path.join(".")}: ${issue.message}`
            )
          }
        )
      };
    }

    const text = decodeResumeText(parsedPayload.data.bytes);
    if (text.length === 0) {
      return {
        ok: true,
        value: []
      };
    }

    const lines = toNonEmptyLines(text);
    const facts: CandidateFact[] = [];
    let extractionOrder = 1;

    const fullName = extractName(lines);
    if (fullName) {
      facts.push(createFact(resumeSource, "full_name", fullName, extractionOrder, "regex full-name line"));
      extractionOrder += 1;
    }

    for (const email of extractByRegex(text, EMAIL_PATTERN)) {
      facts.push(createFact(resumeSource, "emails[]", email, extractionOrder, "regex email"));
      extractionOrder += 1;
    }

    for (const phone of extractPhones(text)) {
      facts.push(createFact(resumeSource, "phones[]", phone, extractionOrder, "regex phone"));
      extractionOrder += 1;
    }

    const experienceBlocks = extractExperienceBlocks(lines);
    experienceBlocks.forEach((block, index) => {
      facts.push(
        createFact(
          resumeSource,
          `experience[${index}].summary`,
          block,
          extractionOrder,
          "explicit experience block"
        )
      );
      extractionOrder += 1;
    });

    const educationInstitutions = extractEducationInstitutions(lines);
    educationInstitutions.forEach((institution, index) => {
      facts.push(
        createFact(
          resumeSource,
          `education[${index}].institution`,
          institution,
          extractionOrder,
          "explicit education institution line"
        )
      );
      extractionOrder += 1;
    });

    const skills = extractSkills(lines);
    skills.forEach((skill, index) => {
      facts.push(
        createFact(
          resumeSource,
          `skills[${index}].name`,
          skill,
          extractionOrder,
          "explicit skills section"
        )
      );
      extractionOrder += 1;
    });

    return {
      ok: true,
      value: facts
    };
  }
};
