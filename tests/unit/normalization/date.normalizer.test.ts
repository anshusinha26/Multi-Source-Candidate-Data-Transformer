import { describe, expect, it } from "vitest";
import { normalizeEmploymentDate } from "../../../src/normalization/date.normalizer.js";

describe("normalizeEmploymentDate", () => {
  it("normalizes supported formats to YYYY-MM", () => {
    expect(normalizeEmploymentDate("Mar 2021")).toBe("2021-03");
    expect(normalizeEmploymentDate("2021/07/15")).toBe("2021-07");
    expect(normalizeEmploymentDate("09-2020")).toBe("2020-09");
  });

  it("returns null for unknown month or invalid date", () => {
    expect(normalizeEmploymentDate("2021")).toBeNull();
    expect(normalizeEmploymentDate("present")).toBeNull();
    expect(normalizeEmploymentDate("not-a-date")).toBeNull();
  });

  it("is deterministic for repeated input", () => {
    const first = normalizeEmploymentDate("Mar 2021");
    const second = normalizeEmploymentDate("Mar 2021");
    expect(first).toBe(second);
  });
});
