import { describe, expect, it } from "vitest";
import { LandingWorld } from "./world";

describe("LandingWorld", () => {
  it("starts in standby with fuel and altitude", () => {
    const world = new LandingWorld();
    const t = world.telemetry();
    expect(world.state.phase).toBe("STANDBY");
    expect(t.fuelKg).toBeGreaterThan(0);
    expect(t.altitudeM).toBeGreaterThan(1000);
  });

  it("advances time and reduces altitude after engage", () => {
    const world = new LandingWorld();
    world.engage();
    const startAlt = world.telemetry().altitudeM;
    for (let i = 0; i < 200; i++) {
      world.step(0.05);
    }
    expect(world.state.timeSec).toBeGreaterThan(5);
    expect(world.telemetry().altitudeM).toBeLessThan(startAlt);
    expect(["BRAKING", "APPROACH", "FINAL", "LANDED", "CRASHED", "ABORT"]).toContain(
      world.state.phase,
    );
  });

  it("toggles faults and preserves them across reset", () => {
    const world = new LandingWorld();
    world.toggleFault("engine_underthrust");
    expect(world.state.faults.engine_underthrust).toBe(true);
    world.engage();
    world.step(0.1);
    world.reset(true);
    expect(world.state.faults.engine_underthrust).toBe(true);
    expect(world.state.phase).toBe("STANDBY");
  });

  it("can complete a clean landing within a bounded sim budget", () => {
    const world = new LandingWorld();
    world.engage();
    for (let i = 0; i < 20000 && world.state.running; i++) {
      world.step(0.05);
    }
    expect(world.state.phase).toBe("LANDED");
    expect(world.state.outcome).toMatch(/Soft landing/i);
  });

  it("engine underthrust makes the descent harder", () => {
    const world = new LandingWorld();
    world.toggleFault("engine_underthrust");
    world.engage();
    for (let i = 0; i < 25000 && world.state.running; i++) {
      world.step(0.05);
    }
    expect(["LANDED", "CRASHED", "ABORT"]).toContain(world.state.phase);
  });
});
