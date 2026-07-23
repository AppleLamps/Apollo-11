import { G0 } from "./constants";
import { clamp, finiteOr, sanitizeDt } from "./safeMath";
import type { SimConfig, SimState } from "./types";

export { clamp } from "./safeMath";

export function totalMass(state: SimState, config: SimConfig): number {
  // dryMass is validated > 0; still guard fuel and sum for runtime safety
  const fuel = Math.max(0, finiteOr(state.fuelKg, 0));
  const mass = config.dryMassKg + fuel;
  return Math.max(mass, config.dryMassKg);
}

export function effectiveMaxThrust(state: SimState, config: SimConfig): number {
  const factor = state.faults.engine_underthrust ? 0.62 : 1;
  return Math.max(1, config.maxThrustN * factor);
}

export function applyPhysics(state: SimState, config: SimConfig, dt: number): void {
  const step = sanitizeDt(dt);
  if (step === null) return;

  // Terminal states are frozen — prevents re-entry / double-resolve
  if (state.phase === "LANDED" || state.phase === "CRASHED") return;

  sanitizeKineticState(state);

  const mass = totalMass(state, config);
  const maxThrust = effectiveMaxThrust(state, config);
  const throttle = clamp(state.throttle, 0, 1);
  const fuel = Math.max(0, state.fuelKg);
  const thrust = fuel > 0 ? throttle * maxThrust : 0;

  const axThrust = (thrust / mass) * Math.sin(state.pitch);
  const ayThrust = (thrust / mass) * Math.cos(state.pitch);

  let pitchAccel = 0;
  if (state.faults.rcs_drift) {
    pitchAccel += 0.035 * Math.sin(state.timeSec * 1.7);
  }

  state.pitchRate += pitchAccel * step;
  state.pitchRate *= Math.pow(0.2, step); // light damping
  state.pitch += state.pitchRate * step;
  state.pitch = clamp(state.pitch, -1.2, 1.2);

  state.vx += axThrust * step;
  state.vy += (ayThrust - config.gravity) * step;
  state.x += state.vx * step;
  state.y += state.vy * step;

  if (thrust > 0 && fuel > 0) {
    const isp = Math.max(1e-6, config.ispSec);
    const burn = (thrust / (isp * G0)) * step;
    state.fuelKg = Math.max(0, fuel - burn);
  } else {
    state.fuelKg = fuel;
  }

  sanitizeKineticState(state);

  // Contact with local surface
  const deck = finiteOr(state.surfaceHeightM, 0);
  if (state.y <= deck) {
    state.y = deck;
    resolveTouchdown(state, config);
  }
}

function sanitizeKineticState(state: SimState): void {
  state.x = finiteOr(state.x, 0);
  state.y = finiteOr(state.y, 0);
  state.vx = finiteOr(state.vx, 0);
  state.vy = finiteOr(state.vy, 0);
  state.pitch = clamp(finiteOr(state.pitch, 0), -1.2, 1.2);
  state.pitchRate = finiteOr(state.pitchRate, 0);
  state.fuelKg = Math.max(0, finiteOr(state.fuelKg, 0));
  state.throttle = clamp(finiteOr(state.throttle, 0), 0, 1);
}

function resolveTouchdown(state: SimState, config: SimConfig): void {
  if (state.phase === "LANDED" || state.phase === "CRASHED") return;

  const contactVy = finiteOr(state.vy, 0);
  const contactVx = finiteOr(state.vx, 0);
  const contactPitch = finiteOr(state.pitch, 0);
  const slopeOk = Math.abs(finiteOr(state.surfaceSlopeRad, 0)) <= config.maxSlopeRad * 0.85;
  const soft =
    Math.abs(contactVy) <= config.softLandingVy &&
    Math.abs(contactVx) <= config.softLandingVx &&
    Math.abs(contactPitch) < 0.35 &&
    slopeOk;

  state.vx = 0;
  state.vy = 0;
  state.pitchRate = 0;
  state.throttle = 0;
  state.running = false;
  state.guidanceInhibitSec = 0;

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
    } else if (Math.abs(contactPitch) >= 0.35) {
      state.outcome = `Hard contact · pitch=${((Math.abs(contactPitch) * 180) / Math.PI).toFixed(0)}°`;
    } else {
      state.outcome = `Hard contact · |vy|=${Math.abs(contactVy).toFixed(1)} m/s`;
    }
    state.alarm = "1201";
  }
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}
