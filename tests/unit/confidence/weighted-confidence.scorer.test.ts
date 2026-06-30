import { describe, expect, it } from "vitest";
import { weightedConfidenceScorer } from "../../../src/confidence/weighted-confidence.scorer.js";
import type { CanonicalProfile } from "../../../src/types/canonical-profile.js";
import { loadFixtureJson } from "../../helpers/load-fixture.js";

describe("weightedConfidenceScorer", () => {
  it("produces deterministic confidence scores within [0,1]", async () => {
    const canonical = await loadFixtureJson<CanonicalProfile>("expected/canonical-output.json");

    const first = weightedConfidenceScorer.score(canonical);
    const second = weightedConfidenceScorer.score(canonical);

    expect(first).toEqual(second);

    expect(first.overallConfidence.value).toBeGreaterThanOrEqual(0);
    expect(first.overallConfidence.value).toBeLessThanOrEqual(1);

    for (const field of first.fieldConfidence) {
      expect(field.score.value).toBeGreaterThanOrEqual(0);
      expect(field.score.value).toBeLessThanOrEqual(1);
      expect(field.score.sourceWeight).toBeGreaterThanOrEqual(0);
      expect(field.score.sourceWeight).toBeLessThanOrEqual(1);
      expect(field.score.methodWeight).toBeGreaterThanOrEqual(0);
      expect(field.score.methodWeight).toBeLessThanOrEqual(1);
      expect(field.score.agreementWeight).toBeGreaterThanOrEqual(0);
      expect(field.score.agreementWeight).toBeLessThanOrEqual(1);
    }
  });
});
