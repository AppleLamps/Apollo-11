import type { SimConfig } from "./types";

export const G0 = 9.80665;

export const DEFAULT_CONFIG: SimConfig = {
  gravity: 1.62,
  dryMassKg: 7000,
  fuelMassKg: 8200,
  maxThrustN: 45000,
  ispSec: 311,
  radarNoiseM: 0.4,
  softLandingVy: 3.2,
  softLandingVx: 2.2,
  maxSlopeRad: (18 * Math.PI) / 180,
};

/** Initial powered-descent conditions inspired by late P63. */
export const INITIAL_CONDITIONS = {
  x: 4200,
  y: 7800,
  vx: -95,
  vy: -42,
  pitch: 0.55,
  fuelKg: DEFAULT_CONFIG.fuelMassKg,
};
