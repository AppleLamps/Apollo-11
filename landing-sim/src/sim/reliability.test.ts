import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIG } from "./constants";
import { applyPhysics, effectiveMaxThrust } from "./physics";
import { emptyFaultFlags, isFaultId, toggleFault, updateTerrainUnderLander } from "./faults";
import { runGuidance } from "./guidance";
import { LandingWorld } from "./world";
import { validateConfig } from "./validateConfig";
import type { SimState } from "./types";

function baseState(overrides: Partial<SimState> = {}): SimState {
  return {
    running: true,
    paused: false,
    timeSec: 1,
    x: 100,
    y: 500,
    vx: -10,
    vy: -20,
    pitch: 0.1,
    pitchRate: 0,
    fuelKg: 4000,
    throttle: 0.5,
    phase: "APPROACH",
    alarm: null,
    outcome: null,
    guidanceInhibitSec: 0,
    surfaceHeightM: 0,
    surfaceSlopeRad: 0.02,
    faults: emptyFaultFlags(),
    ...overrides,
  };
}

describe("config validation", () => {
  it("rejects zero / negative mass and thrust", () => {
    expect(() => validateConfig({ ...DEFAULT_CONFIG, dryMassKg: 0 })).toThrow(/dryMassKg/);
    expect(() => validateConfig({ ...DEFAULT_CONFIG, maxThrustN: -1 })).toThrow(/maxThrustN/);
    expect(() => validateConfig({ ...DEFAULT_CONFIG, ispSec: NaN })).toThrow(/ispSec/);
  });

  it("accepts default config", () => {
    expect(validateConfig(DEFAULT_CONFIG).gravity).toBe(DEFAULT_CONFIG.gravity);
  });
});

describe("fault injection integrity", () => {
  it("ignores unknown fault ids without corrupting state", () => {
    const world = new LandingWorld();
    const before = { ...world.state.faults };
    expect(world.toggleFault("not_a_real_fault")).toBe(false);
    expect(world.state.faults).toEqual(before);
    expect(isFaultId("engine_underthrust")).toBe(true);
    expect(isFaultId("prototype.pollution")).toBe(false);
  });

  it("engine underthrust never yields non-finite thrust or acceleration", () => {
    const state = baseState({
      faults: { ...emptyFaultFlags(), engine_underthrust: true },
      fuelKg: 0.01,
      throttle: 1,
    });
    applyPhysics(state, DEFAULT_CONFIG, 0.05);
    expect(Number.isFinite(state.vx)).toBe(true);
    expect(Number.isFinite(state.vy)).toBe(true);
    expect(effectiveMaxThrust(state, DEFAULT_CONFIG)).toBeGreaterThan(0);
  });

  it("1202 overload isolates guidance phase changes while physics continues", () => {
    const state = baseState({
      faults: { ...emptyFaultFlags(), computer_overload: true },
      guidanceInhibitSec: 1,
      phase: "FINAL",
      y: 80,
      throttle: 0.4,
    });
    const yBefore = state.y;
    runGuidance(state, DEFAULT_CONFIG, 0.05);
    expect(state.alarm).toBe("1202");
    expect(state.phase).toBe("FINAL"); // guidance must not retarget phases while inhibited
    applyPhysics(state, DEFAULT_CONFIG, 0.05);
    expect(state.y).not.toBe(yBefore);
  });
});

describe("timestep and state hygiene", () => {
  it("ignores NaN and negative dt without rewinding mission time", () => {
    const world = new LandingWorld();
    world.engage();
    world.step(0.05);
    const t = world.state.timeSec;
    world.step(NaN);
    world.step(-1);
    world.step(Infinity);
    expect(world.state.timeSec).toBe(t);
    expect(Number.isFinite(world.state.x)).toBe(true);
  });

  it("recovers kinetic NaNs instead of locking the sim", () => {
    const state = baseState({ vx: NaN, vy: Infinity, pitch: NaN, y: 100 });
    applyPhysics(state, DEFAULT_CONFIG, 0.05);
    expect(Number.isFinite(state.vx)).toBe(true);
    expect(Number.isFinite(state.vy)).toBe(true);
    expect(Number.isFinite(state.pitch)).toBe(true);
  });

  it("touchdown freezes further physics resolves", () => {
    const state = baseState({ y: 0.01, vy: -1, vx: 0, pitch: 0, phase: "FINAL" });
    applyPhysics(state, DEFAULT_CONFIG, 0.05);
    expect(state.phase).toBe("LANDED");
    const outcome = state.outcome;
    applyPhysics(state, DEFAULT_CONFIG, 0.05);
    expect(state.phase).toBe("LANDED");
    expect(state.outcome).toBe(outcome);
  });
});

describe("engage / reset lifecycle", () => {
  it("resets cleanly after abort before a new engage", () => {
    const world = new LandingWorld();
    world.engage();
    world.state.phase = "ABORT";
    world.state.running = true;
    world.state.y = 15000;
    world.state.timeSec = 40;
    world.state.outcome = "Abort · climbing away from site";
    world.state.running = false;

    world.engage();
    expect(world.state.phase).toBe("BRAKING");
    expect(world.state.timeSec).toBe(0);
    expect(world.state.y).toBeGreaterThan(1000);
    expect(world.state.running).toBe(true);
  });

  it("does not teleport mid-flight when Engage is pressed again", () => {
    const world = new LandingWorld();
    world.engage();
    for (let i = 0; i < 40; i++) world.step(0.05);
    const x = world.state.x;
    const y = world.state.y;
    const t = world.state.timeSec;
    world.engage();
    expect(world.state.x).toBe(x);
    expect(world.state.y).toBe(y);
    expect(world.state.timeSec).toBe(t);
  });

  it("pause stops integration and resume continues", () => {
    const world = new LandingWorld();
    world.engage();
    world.step(0.05);
    world.togglePause();
    const t = world.state.timeSec;
    const y = world.state.y;
    world.step(0.05);
    expect(world.state.timeSec).toBe(t);
    expect(world.state.y).toBe(y);
    world.togglePause();
    world.step(0.05);
    expect(world.state.timeSec).toBeGreaterThan(t);
  });

  it("allows pausing during abort", () => {
    const world = new LandingWorld();
    world.engage();
    world.state.phase = "ABORT";
    world.state.running = true;
    world.togglePause();
    expect(world.state.paused).toBe(true);
    const y = world.state.y;
    world.step(0.05);
    expect(world.state.y).toBe(y);
  });
});

describe("landing detection", () => {
  it("cannot remain RUNNING after LANDED", () => {
    const world = new LandingWorld();
    world.engage();
    world.state.phase = "LANDED";
    world.state.running = true;
    world.step(0.05);
    expect(world.state.running).toBe(false);
    expect(world.state.phase).toBe("LANDED");
  });

  it("rate-limits steep_slope terrain morph near the surface", () => {
    const state = baseState({ y: 20, surfaceHeightM: 0, surfaceSlopeRad: 0.02 });
    expect(toggleFault(state, "steep_slope")).toBe(true);
    expect(state.faults.steep_slope).toBe(true);
    // One short step must not snap to the full steep target (~0.34 rad / ~6 m)
    updateTerrainUnderLander(state, 0.05);
    expect(state.surfaceSlopeRad).toBeLessThan(0.2);
    expect(state.surfaceHeightM).toBeLessThan(3);
    // Over time it approaches the steep target
    for (let i = 0; i < 400; i++) updateTerrainUnderLander(state, 0.05);
    expect(state.surfaceSlopeRad).toBeGreaterThan(0.3);
  });
});
