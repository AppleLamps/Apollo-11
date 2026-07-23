import { describe, expect, it } from "vitest";
import { isCameraMode, saneCameraScalar } from "./cameraRig";

describe("cameraRig", () => {
  it("accepts only known camera modes", () => {
    expect(isCameraMode("chase")).toBe(true);
    expect(isCameraMode("orbit")).toBe(true);
    expect(isCameraMode("free")).toBe(false);
    expect(isCameraMode("")).toBe(false);
    expect(isCameraMode("__proto__")).toBe(false);
  });

  it("sanitizes non-finite camera scalars", () => {
    expect(saneCameraScalar(NaN, 12)).toBe(12);
    expect(saneCameraScalar(Infinity, 12)).toBe(12);
    expect(saneCameraScalar(3.5, 12)).toBe(3.5);
  });
});
