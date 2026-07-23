import { describe, expect, it } from "vitest";
import { clamp, finiteOr, sanitizeDt } from "./safeMath";

describe("safeMath", () => {
  it("sanitizeDt rejects non-finite and non-positive values", () => {
    expect(sanitizeDt(NaN)).toBeNull();
    expect(sanitizeDt(Infinity)).toBeNull();
    expect(sanitizeDt(-0.01)).toBeNull();
    expect(sanitizeDt(0)).toBeNull();
    expect(sanitizeDt(0.02)).toBe(0.02);
    expect(sanitizeDt(1)).toBe(0.05);
  });

  it("clamp replaces non-finite input with min", () => {
    expect(clamp(NaN, 0, 1)).toBe(0);
    expect(clamp(2, 0, 1)).toBe(1);
    expect(clamp(-1, 0, 1)).toBe(0);
  });

  it("finiteOr falls back", () => {
    expect(finiteOr(NaN, 3)).toBe(3);
    expect(finiteOr(1.5, 3)).toBe(1.5);
  });
});
