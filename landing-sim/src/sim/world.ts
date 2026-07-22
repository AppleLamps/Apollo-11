import { DEFAULT_CONFIG, INITIAL_CONDITIONS } from "./constants";
import {
  applyTerrainFault,
  emptyFaultFlags,
  toggleFault as toggleFaultFlag,
  updateTerrainUnderLander,
} from "./faults";
import { runGuidance, sensedAltitude } from "./guidance";
import { applyPhysics, effectiveMaxThrust, totalMass } from "./physics";
import type { FaultId, SimConfig, SimState, Telemetry } from "./types";

export class LandingWorld {
  readonly config: SimConfig;
  state: SimState;

  constructor(config: SimConfig = DEFAULT_CONFIG) {
    this.config = config;
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
    if (this.state.phase === "LANDED" || this.state.phase === "CRASHED") {
      this.reset(true);
    }
    this.state.running = true;
    this.state.paused = false;
    this.state.phase = "BRAKING";
    this.state.outcome = null;
    this.state.alarm = null;
  }

  togglePause(): void {
    if (!this.state.running) return;
    if (this.state.phase === "LANDED" || this.state.phase === "CRASHED" || this.state.phase === "ABORT") {
      return;
    }
    this.state.paused = !this.state.paused;
  }

  toggleFault(id: FaultId): void {
    toggleFaultFlag(this.state, id);
  }

  step(dt: number): void {
    if (!this.state.running || this.state.paused) return;

    const capped = Math.min(dt, 0.05);
    updateTerrainUnderLander(this.state);
    runGuidance(this.state, this.config, capped);
    applyPhysics(this.state, this.config, capped);
    this.state.timeSec += capped;

    if (this.state.phase === "ABORT" && this.state.y > 12000) {
      this.state.running = false;
      this.state.outcome = "Abort · climbing away from site";
    }
    if (this.state.fuelKg <= 0 && this.state.y > this.state.surfaceHeightM + 2 && this.state.vy < 0) {
      // Fall to contact; physics will resolve
      this.state.throttle = 0;
    }
  }

  telemetry(): Telemetry {
    const s = this.state;
    const mass = totalMass(s, this.config);
    const thrust = s.fuelKg > 0 ? s.throttle * effectiveMaxThrust(s, this.config) : 0;
    return {
      altitudeM: s.y - s.surfaceHeightM,
      sensedAltitudeM: sensedAltitude(s, this.config),
      rangeM: s.x,
      vx: s.vx,
      vy: s.vy,
      fuelKg: s.fuelKg,
      fuelFraction: s.fuelKg / this.config.fuelMassKg,
      throttle: s.throttle,
      thrustN: thrust,
      pitchDeg: (s.pitch * 180) / Math.PI,
      massKg: mass,
      slopeDeg: (s.surfaceSlopeRad * 180) / Math.PI,
      phase: s.phase,
      timeSec: s.timeSec,
      alarm: s.alarm,
      outcome: s.outcome,
    };
  }
}
