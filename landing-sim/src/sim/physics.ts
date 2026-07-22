import { G0 } from "./constants";
import type { SimConfig, SimState } from "./types";

export function totalMass(state: SimState, config: SimConfig): number {
  return config.dryMassKg + Math.max(0, state.fuelKg);
}

export function effectiveMaxThrust(state: SimState, config: SimConfig): number {
  const factor = state.faults.engine_underthrust ? 0.62 : 1;
  return config.maxThrustN * factor;
}

export function applyPhysics(state: SimState, config: SimConfig, dt: number): void {
  if (dt <= 0) return;

  const mass = totalMass(state, config);
  const maxThrust = effectiveMaxThrust(state, config);
  const throttle = clamp(state.throttle, 0, 1);
  const thrust = state.fuelKg > 0 ? throttle * maxThrust : 0;

  const axThrust = (thrust / mass) * Math.sin(state.pitch);
  const ayThrust = (thrust / mass) * Math.cos(state.pitch);

  let pitchAccel = 0;
  if (state.faults.rcs_drift) {
    pitchAccel += 0.035 * Math.sin(state.timeSec * 1.7);
  }

  state.pitchRate += pitchAccel * dt;
  state.pitchRate *= Math.pow(0.2, dt); // light damping
  state.pitch += state.pitchRate * dt;
  state.pitch = clamp(state.pitch, -1.2, 1.2);

  state.vx += axThrust * dt;
  state.vy += (ayThrust - config.gravity) * dt;
  state.x += state.vx * dt;
  state.y += state.vy * dt;

  if (thrust > 0 && state.fuelKg > 0) {
    const burn = (thrust / (config.ispSec * G0)) * dt;
    state.fuelKg = Math.max(0, state.fuelKg - burn);
  }

  // Contact with local surface
  const deck = state.surfaceHeightM;
  if (state.y <= deck) {
    state.y = deck;
    resolveTouchdown(state, config);
  }
}

function resolveTouchdown(state: SimState, config: SimConfig): void {
  const contactVy = state.vy;
  const contactVx = state.vx;
  const slopeOk = Math.abs(state.surfaceSlopeRad) <= config.maxSlopeRad * 0.85;
  const soft =
    Math.abs(contactVy) <= config.softLandingVy &&
    Math.abs(contactVx) <= config.softLandingVx &&
    Math.abs(state.pitch) < 0.35 &&
    slopeOk;

  state.vx = 0;
  state.vy = 0;
  state.pitchRate = 0;
  state.throttle = 0;
  state.running = false;

  if (soft) {
    state.phase = "LANDED";
    state.outcome = "Soft landing";
    state.alarm = null;
  } else {
    state.phase = "CRASHED";
    if (!slopeOk) {
      state.outcome = "Tip-over on steep slope";
    } else if (Math.abs(contactVx) > config.softLandingVx) {
      state.outcome = `Hard contact · |vx|=${Math.abs(contactVx).toFixed(1)} m/s`;
    } else if (Math.abs(state.pitch) >= 0.35) {
      state.outcome = `Hard contact · pitch=${((Math.abs(state.pitch) * 180) / Math.PI).toFixed(0)}°`;
    } else {
      state.outcome = `Hard contact · |vy|=${Math.abs(contactVy).toFixed(1)} m/s`;
    }
    state.alarm = "1201";
  }
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}
