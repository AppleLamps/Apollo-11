import { describe, expect, it } from "vitest";
import {
  FramePerformanceMonitor,
  nextLowerQuality,
  type PerformanceReading,
} from "./FramePerformanceMonitor";

function runFrames(
  monitor: FramePerformanceMonitor,
  frameSec: number,
  quality: "low" | "high" | "cinematic",
  count: number,
): PerformanceReading[] {
  const readings: PerformanceReading[] = [];
  for (let i = 0; i < count; i++) {
    const reading = monitor.update(frameSec, quality);
    if (reading) readings.push(reading);
  }
  return readings;
}

describe("FramePerformanceMonitor", () => {
  it("maps quality levels downward without dropping below low", () => {
    expect(nextLowerQuality("cinematic")).toBe("high");
    expect(nextLowerQuality("high")).toBe("low");
    expect(nextLowerQuality("low")).toBeNull();
  });

  it("does not downgrade healthy rendering", () => {
    const readings = runFrames(new FramePerformanceMonitor(), 1 / 60, "cinematic", 240);
    expect(readings.some((reading) => reading.downgradeTo)).toBe(false);
    expect(readings.at(-1)?.state).toBe("stable");
  });

  it("downgrades one step after sustained slow rendering", () => {
    const readings = runFrames(new FramePerformanceMonitor(), 1 / 30, "cinematic", 90);
    const adapted = readings.find((reading) => reading.state === "adapted");
    expect(adapted?.downgradeTo).toBe("high");
    expect(adapted?.fps).toBeCloseTo(30, 0);
  });

  it("ignores tab-suspension gaps", () => {
    const monitor = new FramePerformanceMonitor();
    expect(monitor.update(2, "high")).toBeNull();
    const readings = runFrames(monitor, 1 / 60, "high", 60);
    expect(readings.at(-1)?.fps).toBeCloseTo(60, 0);
  });
});
