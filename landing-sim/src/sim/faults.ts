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
  if (id === "steep_slope") {
    applyTerrainFault(state);
  }
  return true;
}

export function applyTerrainFault(state: SimState): void {
  if (state.faults.steep_slope) {
    state.surfaceSlopeRad = 0.38; // ~22°
    state.surfaceHeightM = 4 + Math.sin(state.x * 0.01) * 2;
  } else {
    state.surfaceSlopeRad = 0.04;
    state.surfaceHeightM = Math.sin(state.x * 0.004) * 1.5;
  }
}

export function updateTerrainUnderLander(state: SimState): void {
  if (state.faults.steep_slope) {
    state.surfaceHeightM = 6 + Math.sin(state.x * 0.02) * 3;
    state.surfaceSlopeRad = 0.34 + 0.06 * Math.sin(state.x * 0.01);
  } else {
    state.surfaceHeightM = Math.sin(state.x * 0.004) * 1.5 + Math.sin(state.x * 0.011) * 0.4;
    state.surfaceSlopeRad = 0.02 * Math.cos(state.x * 0.004);
  }
}

export function activeFaultLabels(state: SimState): string[] {
  return FAULT_CATALOG.filter((f) => state.faults[f.id]).map((f) => f.label);
}
