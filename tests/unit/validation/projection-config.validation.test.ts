import { describe, expect, it } from "vitest";
import { validateProjectionConfig } from "../../../src/validation/validate-projection-config.js";
import { validateProjectedOutput } from "../../../src/validation/validate-projected-output.js";
import type { ProjectionConfig } from "../../../src/types/projection-config.js";
import type { ValidationError } from "../../../src/types/errors.js";
import { loadFixtureJson } from "../../helpers/load-fixture.js";

describe("projection validation", () => {
  it("accepts valid fixture configs and nested projected output", async () => {
    const defaultConfig = await loadFixtureJson<ProjectionConfig>("config/default-config.json");
    const customConfig = await loadFixtureJson<ProjectionConfig>("config/custom-config.json");
    const projected = await loadFixtureJson<Record<string, unknown>>("expected/custom-output.json");

    const validatedDefault = validateProjectionConfig(defaultConfig);
    const validatedCustom = validateProjectionConfig(customConfig);
    const validatedOutput = validateProjectedOutput(projected, validatedCustom);

    expect(validatedDefault.fields.length).toBeGreaterThan(0);
    expect(validatedCustom.fields.length).toBeGreaterThan(0);
    expect(validatedOutput).toEqual(projected);
  });

  it("rejects wildcard output paths", async () => {
    const config = await loadFixtureJson<ProjectionConfig>("config/custom-config.json");
    const [firstField, ...remainingFields] = config.fields;
    if (!firstField) {
      throw new Error("Expected at least one projection field.");
    }

    const invalidConfig: ProjectionConfig = {
      ...config,
      fields: [
        {
          ...firstField,
          path: "candidate[].id"
        },
        ...remainingFields
      ]
    };

    expect(() => validateProjectionConfig(invalidConfig)).toThrow();

    try {
      validateProjectionConfig(invalidConfig);
    } catch (error) {
      const validationError = error as ValidationError;
      expect(validationError.kind).toBe("ValidationError");
      expect(validationError.code).toBe("VALIDATION_PROJECTION_CONFIG_INVALID");
    }
  });

  it("rejects projected output with type mismatches", async () => {
    const customConfig = await loadFixtureJson<ProjectionConfig>("config/custom-config.json");
    const projected = await loadFixtureJson<Record<string, unknown>>("expected/custom-output.json");

    const invalidOutput = {
      ...projected,
      contact: {
        ...(projected.contact as Record<string, unknown>),
        primaryPhone: 42
      }
    };

    expect(() => validateProjectedOutput(invalidOutput, customConfig)).toThrow();
  });
});
