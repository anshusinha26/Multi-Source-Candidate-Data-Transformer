import { describe, expect, it } from "vitest";
import { projectCanonicalProfile } from "../../../src/projection/project-profile.js";
import type { CanonicalProfile } from "../../../src/types/canonical-profile.js";
import type { ProjectionConfig } from "../../../src/types/projection-config.js";
import { loadFixtureJson } from "../../helpers/load-fixture.js";

describe("projectCanonicalProfile", () => {
  it("projects remapped nested output and preserves canonical input", async () => {
    const canonical = await loadFixtureJson<CanonicalProfile>("expected/canonical-output.json");
    const config = await loadFixtureJson<ProjectionConfig>("config/custom-config.json");

    const canonicalBefore = JSON.parse(JSON.stringify(canonical)) as CanonicalProfile;
    const projected = projectCanonicalProfile(canonical, config) as Record<string, unknown>;

    expect(projected).toMatchObject({
      candidate: {
        id: canonical.candidateId,
        name: canonical.fullName
      },
      contact: {
        primaryEmail: canonical.emails[0],
        primaryPhone: canonical.phones[0]
      }
    });

    const profile = projected.profile as Record<string, unknown>;
    expect(Array.isArray(profile.skills)).toBe(true);
    expect(profile.latestExperienceSummary).toBe(canonical.experience[0]?.summary);

    expect(projected.overallConfidence).toBe(canonical.overallConfidence.value);
    expect(canonical).toEqual(canonicalBefore);
  });
});
