import { describe, expect, it } from "vitest";
import {
  GRAPHICS_PROFILES,
  isGraphicsQuality,
} from "./GraphicsQuality";

describe("graphics quality profiles", () => {
  it("accepts only supported quality names", () => {
    expect(isGraphicsQuality("low")).toBe(true);
    expect(isGraphicsQuality("high")).toBe(true);
    expect(isGraphicsQuality("cinematic")).toBe(true);
    expect(isGraphicsQuality("ultra")).toBe(false);
    expect(isGraphicsQuality(null)).toBe(false);
  });

  it("increases expensive settings monotonically", () => {
    expect(GRAPHICS_PROFILES.low.pixelRatioCap).toBeLessThan(GRAPHICS_PROFILES.high.pixelRatioCap);
    expect(GRAPHICS_PROFILES.high.pixelRatioCap).toBeLessThanOrEqual(
      GRAPHICS_PROFILES.cinematic.pixelRatioCap,
    );
    expect(GRAPHICS_PROFILES.low.shadowMapSize).toBeLessThan(
      GRAPHICS_PROFILES.high.shadowMapSize,
    );
    expect(GRAPHICS_PROFILES.high.shadowMapSize).toBeLessThan(
      GRAPHICS_PROFILES.cinematic.shadowMapSize,
    );
    expect(GRAPHICS_PROFILES.low.dustCount).toBeLessThan(GRAPHICS_PROFILES.high.dustCount);
    expect(GRAPHICS_PROFILES.high.dustCount).toBeLessThan(
      GRAPHICS_PROFILES.cinematic.dustCount,
    );
    expect(GRAPHICS_PROFILES.cinematic.bloom).toBe(true);
  });
});
