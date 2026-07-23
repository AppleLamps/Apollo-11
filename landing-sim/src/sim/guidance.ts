import { effectiveMaxThrust, totalMass } from "./physics";
import { clamp, finiteOr, sanitizeDt } from "./safeMath";
import type { SimConfig, SimState } from "./types";

/**
 * Simplified P63→P64→P65 style descent autopilot.
 * Uses sensed altitude (fault-aware) and commanded pitch/throttle.
 *
 * Computer-overload (1202) isolates *guidance* only: physics keeps integrating
 * with the last commanded throttle, matching AGC executive-overflow behavior.
 */
export function runGuidance(state: SimState, config: SimConfig, dt: number): void {
  if (!state.running || state.paused) return;
  if (state.phase === "LANDED" || state.phase === "CRASHED" || state.phase === "ABORT") {
    return;
  }

  const step = sanitizeDt(dt);
  if (step === null) return;

  if (state.guidanceInhibitSec > 0) {
    state.guidanceInhibitSec = Math.max(0, state.guidanceInhibitSec - step);
    state.alarm = "1202";
    // Hold last throttle; add bounded jitter while "computer" is overloaded.
    // Do not rewrite phase, pitch targets, or abort logic during inhibit.
    state.throttle = clamp(
      finiteOr(state.throttle, 0.5) + Math.sin(state.timeSec * 40) * 0.03,
      0.1,
      1,
    );
    return;
  }

  if (state.faults.computer_overload) {
    // Periodic executive overflow windows (~every 8–12s)
    const cycle = state.timeSec % 10.5;
    if (cycle < 0.05 && state.guidanceInhibitSec <= 0) {
      state.guidanceInhibitSec = 1.3;
      state.alarm = "1202";
      return;
    }
  }

  const alt = sensedAltitude(state, config);
  const speed = Math.hypot(finiteOr(state.vx, 0), finiteOr(state.vy, 0));

  // Phase machine
  if (alt > 2500) {
    state.phase = "BRAKING";
  } else if (alt > 150) {
    state.phase = "APPROACH";
  } else {
    state.phase = "FINAL";
  }

  // Abort if hopeless
  if (state.fuelKg < 80 && alt > 200 && state.vy < -20) {
    commandAbort(state);
    return;
  }
  if (alt < 40 && speed > 28) {
    commandAbort(state);
    return;
  }

  const targetVy = desiredDescentRate(alt, state.phase);
  const targetVx = desiredHorizontalRate(state.x, alt, state.phase);
  const targetPitch = desiredPitch(state, targetVx, targetVy, config);

  // Attitude command via RCS-like rate — stiffer near the surface
  const pitchError = targetPitch - state.pitch;
  const attitudeGain = state.phase === "FINAL" ? 5.5 : 2.8;
  state.pitchRate += clamp(
    pitchError * attitudeGain - state.pitchRate * 2.2,
    -1.2,
    1.2,
  ) * step;

  // Throttle to track vertical acceleration need
  const mass = totalMass(state, config);
  const maxThrust = effectiveMaxThrust(state, config);
  const vyError = targetVy - state.vy;
  const gain = state.phase === "FINAL" ? 1.1 : 0.55;
  const desiredAy = config.gravity + vyError * gain;
  const cosPitch = Math.max(0.35, Math.abs(Math.cos(state.pitch)));
  const thrustForAy = (desiredAy * mass) / cosPitch;
  let throttle = thrustForAy / maxThrust;

  // Horizontal assist: add a little thrust when pitched over
  if (Math.abs(state.vx - targetVx) > 8 && alt > 120) {
    throttle += 0.08;
  }

  if (state.phase === "FINAL") {
    // Null residual horizontal with brief pitch, then upright for touchdown
    if (alt < 60 && Math.abs(state.vx) > 0.8) {
      const nullPitch = clamp(-state.vx * 0.045, -0.22, 0.22);
      state.pitchRate += (nullPitch - state.pitch) * 4 * step;
    }
    if (alt < 25) {
      // Force upright for landing gear contact
      state.pitchRate += (0 - state.pitch) * 6 * step;
    }
    throttle = clamp(throttle, 0.18, 0.98);
    if (alt < 12) {
      const hover = config.gravity * mass;
      const sink = -state.vy;
      const touchThrottle =
        hover / maxThrust + (sink - 0.8) * 0.08 + Math.abs(state.vx) * 0.01;
      throttle = clamp(touchThrottle, 0.25, 0.92);
    }
  } else {
    throttle = clamp(throttle, 0.2, 1);
  }

  state.throttle = throttle;

  if (state.alarm === "1202") {
    state.alarm = null;
  }
}

export function sensedAltitude(state: SimState, config: SimConfig): number {
  const trueAlt = state.y - state.surfaceHeightM;
  const jitter = Math.sin(state.timeSec * 17.3) * 0.5;
  if (!state.faults.radar_glitch) {
    return trueAlt + jitter * config.radarNoiseM;
  }
  // Dropouts and bias — deterministic from mission time so the UI stays readable
  const dropout = Math.sin(state.timeSec * 3.1) > 0.55;
  if (dropout) {
    return trueAlt + 120 + (Math.sin(state.timeSec * 5.7) * 0.5 + 0.5) * 80;
  }
  return Math.max(0, trueAlt * 0.55 + jitter * 25);
}

function desiredDescentRate(alt: number, phase: SimState["phase"]): number {
  if (phase === "BRAKING") return -28 - Math.min(20, alt / 400);
  if (phase === "APPROACH") return -12 - Math.min(10, alt / 180);
  // FINAL
  if (alt > 60) return -4.5;
  if (alt > 20) return -2.2;
  return -0.9;
}

function desiredHorizontalRate(x: number, alt: number, phase: SimState["phase"]): number {
  const capture = clamp(-x / Math.max(40, alt * 0.45), -40, 40);
  if (phase === "FINAL") {
    if (alt < 40) return clamp(-x * 0.04, -1.2, 1.2);
    return clamp(-x * 0.1, -3, 3);
  }
  return capture;
}

function desiredPitch(
  state: SimState,
  targetVx: number,
  targetVy: number,
  config: SimConfig,
): number {
  const mass = totalMass(state, config);
  const maxThrust = effectiveMaxThrust(state, config);
  const vxError = targetVx - state.vx;
  const desiredAx = clamp(vxError * 0.35, -6, 6);
  // Choose pitch so thrust horizontal component tracks desiredAx
  const thrustDenom = Math.max(1, finiteOr(state.throttle, 0) * maxThrust || maxThrust * 0.7);
  const sinPitch = clamp((desiredAx * mass) / thrustDenom, -0.85, 0.85);
  let pitch = Math.asin(sinPitch);

  // Near surface, upright
  const alt = state.y - state.surfaceHeightM;
  if (alt < 150) {
    pitch *= clamp(alt / 150, 0, 1);
  }
  if (alt < 30) {
    pitch = 0;
  }

  // Nudge toward target site when high and far
  if (Math.abs(state.x) > 200 && state.y > 800) {
    pitch += clamp(-state.x / 8000, -0.2, 0.2);
  }

  void targetVy;
  return clamp(pitch, -0.95, 0.95);
}

function commandAbort(state: SimState): void {
  state.phase = "ABORT";
  state.outcome = "Abort · insufficient margins";
  state.alarm = "1406";
  state.throttle = 1;
  state.pitch = 0;
  // Kick upward; sim will keep integrating until fuel gone / out of frame
  state.vy = Math.max(state.vy, 18);
  state.running = true;
}
