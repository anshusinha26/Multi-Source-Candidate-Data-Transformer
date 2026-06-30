import { describe, expect, it } from "vitest";
import { assignPathValue, parsePath, resolvePathValue } from "../../../src/projection/path-resolver.js";

describe("path resolver", () => {
  it("parses valid paths and detects wildcard", () => {
    const parsed = parsePath("skills[].name");
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) {
      return;
    }

    expect(parsed.value.hasWildcard).toBe(true);
    expect(parsed.value.tokens.map((token) => token.kind)).toEqual(["property", "wildcard", "property"]);
  });

  it("rejects unsupported index syntax", () => {
    const parsed = parsePath("skills[*].name");
    expect(parsed.ok).toBe(false);
    if (parsed.ok) {
      return;
    }

    expect(parsed.error.code).toBe("PATH_INVALID_INDEX");
  });

  it("resolves nested values deterministically", () => {
    const source = {
      profile: {
        skills: [{ name: "TypeScript" }, { name: "Node.js" }]
      }
    };

    const resolved = resolvePathValue(source, "profile.skills[1].name");
    expect(resolved.ok).toBe(true);
    if (!resolved.ok) {
      return;
    }

    expect(resolved.value.found).toBe(true);
    expect(resolved.value.value).toBe("Node.js");
  });

  it("rejects wildcard output assignment", () => {
    const assigned = assignPathValue({}, "skills[].name", "TypeScript");
    expect(assigned.ok).toBe(false);
    if (assigned.ok) {
      return;
    }

    expect(assigned.error.code).toBe("PATH_WILDCARD_NOT_ALLOWED");
  });

  it("assigns nested object paths immutably", () => {
    const assigned = assignPathValue({}, "candidate.contact.email", "jane.doe@acme.com");
    expect(assigned.ok).toBe(true);
    if (!assigned.ok) {
      return;
    }

    expect(assigned.value).toEqual({
      candidate: {
        contact: {
          email: "jane.doe@acme.com"
        }
      }
    });
  });
});
