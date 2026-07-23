import { describe, expect, it } from "vitest";
import { LandingWorld } from "./world";

describe("LandingWorld renderSnapshot", () => {
  it("returns presentation data without exposing mutable simulation state", () => {
    const world = new LandingWorld();
    const telemetry = world.telemetry();
    const snapshot = world.renderSnapshot(telemetry);

    expect(snapshot).toEqual({
      x: world.state.x,
      y: world.state.y,
      pitch: world.state.pitch,
      fuelRemaining: true,
      surfaceHeightM: world.state.surfaceHeightM,
      surfaceSlopeRad: world.state.surfaceSlopeRad,
      phase: "STANDBY",
      telemetry,
    });
    expect(snapshot).not.toBe(world.state);
  });

  it("sanitizes non-finite render coordinates", () => {
    const world = new LandingWorld();
    world.state.x = Number.NaN;
    world.state.y = Number.POSITIVE_INFINITY;
    world.state.pitch = Number.NEGATIVE_INFINITY;

    const snapshot = world.renderSnapshot();

    expect(snapshot.x).toBe(0);
    expect(snapshot.y).toBe(0);
    expect(snapshot.pitch).toBe(0);
  });
});
