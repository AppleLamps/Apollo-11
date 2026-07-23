import { clamp } from "./safeMath";
import type { FaultId, FaultState, SimState } from "./types";

export const FAULT_CATALOG: Omit<FaultState, "active">[] = [
  {
    id: "engine_underthrust",
    label: "Engine underthrust",
    description: "DPS stuck at ~62% rated thrust",
  },
  {
    id: "radar_glitch",
    label: "Radar glitch",
    description: "Landing radar dropouts and bias",
  },
  {
    id: "computer_overload",
    label: "Computer overload",
    description: "Executive overflow · 1201/1202 stutter",
  },
  {
    id: "steep_slope",
    label: "Steep slope",
    description: "Landing site tilts past safe limit",
  },
  {
    id: "rcs_drift",
    label: "RCS drift",
    description: "Attitude thruster leak / bias",
  },
];

const FAULT_IDS = new Set<string>(FAULT_CATALOG.map((f) => f.id));

export function isFaultId(id: string): id is FaultId {
  return FAULT_IDS.has(id);
}

export function emptyFaultFlags(): Record<FaultId, boolean> {
  return {
    engine_underthrust: false,
    radar_glitch: false,
    computer_overload: false,
    steep_slope: false,
    rcs_drift: false,
  };
}

export function toggleFault(state: SimState, id: string): boolean {
  if (!isFaultId(id)) return false;
  state.faults[id] = !state.faults[id];
  // Terrain morphs toward the new target over time (no instant pop into the lander).
  return true;
}

/** Instant terrain snap — only for cold start / reset at high altitude. */
export function applyTerrainFault(state: SimState): void {
  const target = targetTerrain(state);
  state.surfaceHeightM = target.height;
  state.surfaceSlopeRad = target.slope;
}

export function targetTerrain(state: SimState): { height: number; slope: number } {
  if (state.faults.steep_slope) {
    return {
      height: 6 + Math.sin(state.x * 0.02) * 3,
      slope: 0.34 + 0.06 * Math.sin(state.x * 0.01),
    };
  }
  return {
    height: Math.sin(state.x * 0.004) * 1.5 + Math.sin(state.x * 0.011) * 0.4,
    slope: 0.02 * Math.cos(state.x * 0.004),
  };
}

/**
 * Rate-limited terrain morph. Near the surface, changes slow further so toggling
 * steep-slope cannot instantly raise the ground into the lander.
 */
export function updateTerrainUnderLander(state: SimState, dt: number): void {
  const step = Number.isFinite(dt) && dt > 0 ? dt : 1 / 60;
  const target = targetTerrain(state);
  const alt = state.y - state.surfaceHeightM;
  const nearFactor = alt < 80 ? 0.22 : 1;
  const maxHeightRate = 2.8 * nearFactor; // m/s
  const maxSlopeRate = 0.14 * nearFactor; // rad/s

  const maxDh = maxHeightRate * step;
  const maxDs = maxSlopeRate * step;
  state.surfaceHeightM += clamp(target.height - state.surfaceHeightM, -maxDh, maxDh);
  state.surfaceSlopeRad += clamp(target.slope - state.surfaceSlopeRad, -maxDs, maxDs);
}

export function activeFaultLabels(state: SimState): string[] {
  return FAULT_CATALOG.filter((f) => state.faults[f.id]).map((f) => f.label);
}
