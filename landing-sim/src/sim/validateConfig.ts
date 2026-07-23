import type { SimConfig } from "./types";
import { assertPositiveFinite } from "./safeMath";

function assertNonNegativeFinite(value: number, label: string): number {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`Invalid ${label}: expected non-negative finite number, got ${String(value)}`);
  }
  return value;
}

/** Validate and return a defensive copy of sim configuration. */
export function validateConfig(config: SimConfig): SimConfig {
  return {
    gravity: assertPositiveFinite(config.gravity, "gravity"),
    dryMassKg: assertPositiveFinite(config.dryMassKg, "dryMassKg"),
    fuelMassKg: assertPositiveFinite(config.fuelMassKg, "fuelMassKg"),
    maxThrustN: assertPositiveFinite(config.maxThrustN, "maxThrustN"),
    ispSec: assertPositiveFinite(config.ispSec, "ispSec"),
    radarNoiseM: assertNonNegativeFinite(config.radarNoiseM, "radarNoiseM"),
    softLandingVy: assertPositiveFinite(config.softLandingVy, "softLandingVy"),
    softLandingVx: assertPositiveFinite(config.softLandingVx, "softLandingVx"),
    maxSlopeRad: assertPositiveFinite(config.maxSlopeRad, "maxSlopeRad"),
  };
}
