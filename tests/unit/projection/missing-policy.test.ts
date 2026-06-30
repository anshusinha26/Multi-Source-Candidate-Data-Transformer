import { describe, expect, it } from "vitest";
import {
  DETERMINISTIC_ERROR_TIMESTAMP,
  createProjectionError,
  handleMissingValue
} from "../../../src/projection/missing-policy.js";

describe("missing policy", () => {
  it("returns set-null for non-required null policy", () => {
    expect(handleMissingValue("null", "contact.phone", false, "phones[0]")).toEqual({
      kind: "set-null",
      value: null
    });
  });

  it("returns omit for omit policy", () => {
    expect(handleMissingValue("omit", "contact.phone", false, "phones[0]")).toEqual({
      kind: "omit"
    });
  });

  it("returns projection error for error policy", () => {
    const decision = handleMissingValue("error", "contact.phone", false, "phones[0]");
    expect(decision.kind).toBe("error");
    if (decision.kind !== "error") {
      return;
    }

    expect(decision.error.code).toBe("PROJECTION_FIELD_MISSING");
    expect(decision.error.timestamp).toBe(DETERMINISTIC_ERROR_TIMESTAMP);
  });

  it("enforces required fields regardless of policy", () => {
    const decision = handleMissingValue("null", "contact.phone", true, "phones[0]");
    expect(decision.kind).toBe("error");
    if (decision.kind !== "error") {
      return;
    }

    expect(decision.error.code).toBe("PROJECTION_REQUIRED_FIELD_MISSING");
  });

  it("creates deterministic projection errors", () => {
    const error = createProjectionError("X", "test", "a.b", { sourcePath: "a.b" });
    expect(error.timestamp).toBe(DETERMINISTIC_ERROR_TIMESTAMP);
    expect(error.stage).toBe("projection");
  });
});
