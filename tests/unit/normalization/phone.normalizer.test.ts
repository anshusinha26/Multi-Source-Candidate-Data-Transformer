import { describe, expect, it } from "vitest";
import { normalizePhone } from "../../../src/normalization/phone.normalizer.js";

describe("normalizePhone", () => {
  it("normalizes valid phone numbers to E.164", () => {
    expect(normalizePhone("+1 (415) 555-2671")).toBe("+14155552671");
    expect(normalizePhone("415-555-2671", { defaultCountry: "US" })).toBe("+14155552671");
  });

  it("returns null for invalid values", () => {
    expect(normalizePhone("not-a-phone")).toBeNull();
    expect(normalizePhone("")).toBeNull();
    expect(normalizePhone(4155552671)).toBeNull();
  });

  it("is deterministic for repeated input", () => {
    const first = normalizePhone("+1 (415) 555-2671");
    const second = normalizePhone("+1 (415) 555-2671");
    expect(first).toBe(second);
  });
});
