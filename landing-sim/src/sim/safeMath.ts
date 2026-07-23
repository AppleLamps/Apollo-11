/** Finite-aware helpers shared by physics, guidance, and UI. */

export function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  if (!Number.isFinite(min) || !Number.isFinite(max)) return value;
  return Math.min(max, Math.max(min, value));
}

export function finiteOr(value: number, fallback: number): number {
  return Number.isFinite(value) ? value : fallback;
}

/** Accept only positive finite timesteps; reject NaN/negative/zero. */
export function sanitizeDt(dt: number, maxDt = 0.05): number | null {
  if (!Number.isFinite(dt) || dt <= 0) return null;
  return Math.min(dt, maxDt);
}

export function assertPositiveFinite(value: number, label: string): number {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`Invalid ${label}: expected positive finite number, got ${String(value)}`);
  }
  return value;
}
