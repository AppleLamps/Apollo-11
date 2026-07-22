export type FlightPhase =
  | "STANDBY"
  | "BRAKING"
  | "APPROACH"
  | "FINAL"
  | "LANDED"
  | "CRASHED"
  | "ABORT";

export type FaultId =
  | "engine_underthrust"
  | "radar_glitch"
  | "computer_overload"
  | "steep_slope"
  | "rcs_drift";

export interface Vec2 {
  x: number;
  y: number;
}

export interface SimConfig {
  /** Lunar gravity, m/s² */
  gravity: number;
  dryMassKg: number;
  fuelMassKg: number;
  maxThrustN: number;
  /** Specific impulse, seconds */
  ispSec: number;
  /** Radar noise amplitude when healthy, meters */
  radarNoiseM: number;
  /** Touchdown success |vy| limit, m/s */
  softLandingVy: number;
  /** Touchdown success |vx| limit, m/s */
  softLandingVx: number;
  /** Max ground slope angle from faults, radians */
  maxSlopeRad: number;
}

export interface FaultState {
  id: FaultId;
  label: string;
  description: string;
  active: boolean;
}

export interface Telemetry {
  altitudeM: number;
  /** True altitude; may differ from sensed when radar glitches */
  sensedAltitudeM: number;
  rangeM: number;
  vx: number;
  vy: number;
  fuelKg: number;
  fuelFraction: number;
  throttle: number;
  thrustN: number;
  pitchDeg: number;
  massKg: number;
  slopeDeg: number;
  phase: FlightPhase;
  timeSec: number;
  alarm: string | null;
  outcome: string | null;
}

export interface SimState {
  running: boolean;
  paused: boolean;
  timeSec: number;
  /** Horizontal position, meters (target at x=0) */
  x: number;
  /** Altitude above mean surface, meters */
  y: number;
  vx: number;
  vy: number;
  /** Pitch from vertical, radians (+ leans toward +x) */
  pitch: number;
  /** Pitch rate, rad/s */
  pitchRate: number;
  fuelKg: number;
  throttle: number;
  phase: FlightPhase;
  alarm: string | null;
  outcome: string | null;
  /** Guidance inhibit timer for computer overload, seconds */
  guidanceInhibitSec: number;
  /** Local surface height offset under lander, meters */
  surfaceHeightM: number;
  /** Local surface slope under lander, radians */
  surfaceSlopeRad: number;
  faults: Record<FaultId, boolean>;
}
