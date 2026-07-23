import type { GraphicsQuality } from "./GraphicsQuality";

export type PerformanceState = "warming" | "stable" | "strained" | "adapted";

export interface PerformanceReading {
  fps: number;
  frameMs: number;
  state: PerformanceState;
  downgradeTo?: GraphicsQuality;
}

const REPORT_INTERVAL_SEC = 0.75;
const SLOW_FPS = 48;
const SLOW_FRAME_MS = 1000 / SLOW_FPS;
const SUSTAINED_SLOW_REPORTS = 3;
const COOLDOWN_SEC = 12;

export class FramePerformanceMonitor {
  private elapsedSec = 0;
  private frameCount = 0;
  private slowReports = 0;
  private cooldownSec = 0;
  private lastQuality: GraphicsQuality | null = null;

  update(frameSec: number, quality: GraphicsQuality): PerformanceReading | null {
    if (quality !== this.lastQuality) {
      this.lastQuality = quality;
      this.slowReports = 0;
    }

    if (!Number.isFinite(frameSec) || frameSec <= 0 || frameSec > 0.25) {
      return null;
    }

    this.elapsedSec += frameSec;
    this.frameCount++;
    this.cooldownSec = Math.max(0, this.cooldownSec - frameSec);
    if (this.elapsedSec < REPORT_INTERVAL_SEC) return null;

    const fps = this.frameCount / this.elapsedSec;
    const frameMs = (this.elapsedSec / this.frameCount) * 1000;
    this.elapsedSec = 0;
    this.frameCount = 0;

    const slow = fps < SLOW_FPS && frameMs > SLOW_FRAME_MS;
    this.slowReports = slow ? this.slowReports + 1 : 0;

    if (
      slow &&
      this.slowReports >= SUSTAINED_SLOW_REPORTS &&
      this.cooldownSec === 0
    ) {
      const downgradeTo = nextLowerQuality(quality);
      if (downgradeTo) {
        this.slowReports = 0;
        this.cooldownSec = COOLDOWN_SEC;
        return { fps, frameMs, state: "adapted", downgradeTo };
      }
      return { fps, frameMs, state: "strained" };
    }

    return {
      fps,
      frameMs,
      state: slow ? "strained" : "stable",
    };
  }
}

export function nextLowerQuality(quality: GraphicsQuality): GraphicsQuality | null {
  if (quality === "cinematic") return "high";
  if (quality === "high") return "low";
  return null;
}
