import { DEFAULT_CONFIG, INITIAL_CONDITIONS } from "./constants";
import {
  applyTerrainFault,
  emptyFaultFlags,
  toggleFault as toggleFaultFlag,
  updateTerrainUnderLander,
} from "./faults";
import { runGuidance, sensedAltitude } from "./guidance";
import { applyPhysics, effectiveMaxThrust, totalMass } from "./physics";
import { finiteOr, sanitizeDt } from "./safeMath";
import type { FaultId, SimConfig, SimState, Telemetry } from "./types";
import { validateConfig } from "./validateConfig";

export class LandingWorld {
  readonly config: SimConfig;
  state: SimState;

  constructor(config: SimConfig = DEFAULT_CONFIG) {
    this.config = validateConfig(config);
    this.state = this.createInitialState();
  }

  createInitialState(): SimState {
    const state: SimState = {
      running: false,
      paused: false,
      timeSec: 0,
      x: INITIAL_CONDITIONS.x,
      y: INITIAL_CONDITIONS.y,
      vx: INITIAL_CONDITIONS.vx,
      vy: INITIAL_CONDITIONS.vy,
      pitch: INITIAL_CONDITIONS.pitch,
      pitchRate: 0,
      fuelKg: INITIAL_CONDITIONS.fuelKg,
      throttle: 0.7,
      phase: "STANDBY",
      alarm: null,
      outcome: null,
      guidanceInhibitSec: 0,
      surfaceHeightM: 0,
      surfaceSlopeRad: 0.02,
      faults: emptyFaultFlags(),
    };
    applyTerrainFault(state);
    return state;
  }

  reset(preserveFaults = true): void {
    const faults = preserveFaults ? { ...this.state.faults } : emptyFaultFlags();
    this.state = this.createInitialState();
    this.state.faults = faults;
    applyTerrainFault(this.state);
  }

  engage(): void {
    // Any terminal or aborting flight must fully reset before re-engage.
    // Mid-run Engage is ignored so we don't teleport guidance into a live trajectory.
    if (this.state.running && this.state.phase !== "ABORT") {
      return;
    }
    if (
      this.state.phase === "LANDED" ||
      this.state.phase === "CRASHED" ||
      this.state.phase === "ABORT" ||
      this.state.timeSec > 0
    ) {
      this.reset(true);
    }
    this.state.running = true;
    this.state.paused = false;
    this.state.phase = "BRAKING";
    this.state.outcome = null;
    this.state.alarm = null;
    this.state.guidanceInhibitSec = 0;
  }

  togglePause(): void {
    if (!this.state.running) return;
    if (this.state.phase === "LANDED" || this.state.phase === "CRASHED" || this.state.phase === "ABORT") {
      return;
    }
    this.state.paused = !this.state.paused;
  }

  toggleFault(id: string): boolean {
    return toggleFaultFlag(this.state, id);
  }

  step(dt: number): void {
    if (!this.state.running || this.state.paused) return;

    const capped = sanitizeDt(dt);
    if (capped === null) return;

    // Freeze terminal outcomes — landing detection cannot be bypassed by later steps
    if (this.state.phase === "LANDED" || this.state.phase === "CRASHED") {
      this.state.running = false;
      return;
    }

    updateTerrainUnderLander(this.state);
    runGuidance(this.state, this.config, capped);
    applyPhysics(this.state, this.config, capped);
    this.state.timeSec = finiteOr(this.state.timeSec, 0) + capped;

    if (this.state.phase === "ABORT" && this.state.y > 12000) {
      this.state.running = false;
      this.state.outcome = "Abort · climbing away from site";
    }
    if (this.state.fuelKg <= 0 && this.state.y > this.state.surfaceHeightM + 2 && this.state.vy < 0) {
      this.state.throttle = 0;
    }
  }

  telemetry(): Telemetry {
    const s = this.state;
    const mass = totalMass(s, this.config);
    const thrust = s.fuelKg > 0 ? s.throttle * effectiveMaxThrust(s, this.config) : 0;
    const fuelCap = this.config.fuelMassKg;
    return {
      altitudeM: finiteOr(s.y - s.surfaceHeightM, 0),
      sensedAltitudeM: finiteOr(sensedAltitude(s, this.config), 0),
      rangeM: finiteOr(s.x, 0),
      vx: finiteOr(s.vx, 0),
      vy: finiteOr(s.vy, 0),
      fuelKg: Math.max(0, finiteOr(s.fuelKg, 0)),
      fuelFraction: clamp01(finiteOr(s.fuelKg, 0) / fuelCap),
      throttle: clamp01(finiteOr(s.throttle, 0)),
      thrustN: Math.max(0, finiteOr(thrust, 0)),
      pitchDeg: finiteOr((s.pitch * 180) / Math.PI, 0),
      massKg: mass,
      slopeDeg: finiteOr((s.surfaceSlopeRad * 180) / Math.PI, 0),
      phase: s.phase,
      timeSec: Math.max(0, finiteOr(s.timeSec, 0)),
      alarm: s.alarm,
      outcome: s.outcome,
    };
  }
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

// Re-export for callers that typed toggleFault against FaultId
export type { FaultId };
