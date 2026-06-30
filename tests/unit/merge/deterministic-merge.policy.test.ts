import { describe, expect, it } from "vitest";
import { deterministicMergePolicy } from "../../../src/merge/deterministic-merge.policy.js";
import type { PrimitiveCandidateFact } from "../../../src/types/candidate-fact.js";

const baseConfidence = {
  value: 0.6,
  model: "fixed_weighted" as const,
  sourceWeight: 0.6,
  methodWeight: 0.6,
  agreementWeight: 0.6,
  rationale: "test"
};

const makeFact = (
  overrides: Partial<PrimitiveCandidateFact> &
    Pick<PrimitiveCandidateFact, "factId" | "fieldPath" | "sourceKind" | "sourceId" | "normalizedValue">
): PrimitiveCandidateFact => ({
  factId: overrides.factId,
  fieldPath: overrides.fieldPath,
  sourceKind: overrides.sourceKind,
  sourceId: overrides.sourceId,
  extractionMethod: overrides.extractionMethod ?? "regex_match",
  originalValue: overrides.originalValue ?? (overrides.normalizedValue as string),
  normalizedValue: overrides.normalizedValue,
  valueKind: "primitive",
  confidence: overrides.confidence ?? baseConfidence,
  sourceOrder: overrides.sourceOrder ?? 1,
  extractionOrder: overrides.extractionOrder ?? 1,
  extractedAt: overrides.extractedAt ?? "2026-06-30T10:00:00.000Z",
  provenance: overrides.provenance ?? {
    fieldPath: overrides.fieldPath,
    sourceKind: overrides.sourceKind,
    sourceId: overrides.sourceId,
    method: overrides.extractionMethod ?? "regex_match",
    sourceOrder: overrides.sourceOrder ?? 1,
    recordedAt: overrides.extractedAt ?? "2026-06-30T10:00:00.000Z",
    evidence: "test"
  }
});

describe("deterministicMergePolicy", () => {
  it("applies source precedence for scalar conflicts and preserves provenance", () => {
    const atsName = makeFact({
      factId: "f1",
      fieldPath: "full_name",
      sourceKind: "ats_json",
      sourceId: "ats-1",
      normalizedValue: "Jane Doe",
      extractionMethod: "structured_field_map",
      confidence: { ...baseConfidence, value: 0.2 },
      sourceOrder: 1
    });

    const resumeName = makeFact({
      factId: "f2",
      fieldPath: "full_name",
      sourceKind: "resume_pdf",
      sourceId: "resume-1",
      normalizedValue: "Jane A. Doe",
      confidence: { ...baseConfidence, value: 0.95 },
      sourceOrder: 2
    });

    const merged = deterministicMergePolicy.merge([atsName, resumeName]);

    expect(merged.fullName).toBe("Jane Doe");
    expect(merged.provenance.map((entry) => entry.sourceId)).toEqual(["ats-1", "resume-1"]);
    expect(
      merged.fieldConfidence.find((entry) => entry.fieldPath === "full_name")?.score.value
    ).toBe(0.2);
  });

  it("deduplicates skills while preserving contributing provenance", () => {
    const skillA = makeFact({
      factId: "s1",
      fieldPath: "skills[0].name",
      sourceKind: "ats_json",
      sourceId: "ats-1",
      normalizedValue: "TypeScript",
      extractionMethod: "structured_field_map",
      sourceOrder: 1
    });

    const skillB = makeFact({
      factId: "s2",
      fieldPath: "skills[1].name",
      sourceKind: "resume_pdf",
      sourceId: "resume-1",
      normalizedValue: "typescript",
      extractionMethod: "regex_match",
      sourceOrder: 2
    });

    const merged = deterministicMergePolicy.merge([skillA, skillB]);

    expect(merged.skills).toHaveLength(1);
    expect(merged.skills[0]?.name).toBe("TypeScript");
    expect(merged.skills[0]?.sources.map((entry) => entry.sourceId).sort()).toEqual([
      "ats-1",
      "resume-1"
    ]);
  });
});
