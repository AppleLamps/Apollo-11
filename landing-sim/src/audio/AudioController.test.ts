import { describe, expect, it } from "vitest";
import { detectAudioCue } from "./AudioController";

describe("detectAudioCue", () => {
  it("prioritizes terminal and alarm transitions", () => {
    expect(
      detectAudioCue(
        { phase: "FINAL", alarm: null },
        { phase: "LANDED", alarm: null },
      ),
    ).toBe("landed");
    expect(
      detectAudioCue(
        { phase: "APPROACH", alarm: null },
        { phase: "APPROACH", alarm: "1202" },
      ),
    ).toBe("alarm");
  });

  it("does not repeat a cue for unchanged telemetry", () => {
    const state = { phase: "BRAKING" as const, alarm: null };
    expect(detectAudioCue(state, state)).toBeNull();
  });

  it("recognizes engagement and ordinary phase changes", () => {
    expect(
      detectAudioCue(
        { phase: "STANDBY", alarm: null },
        { phase: "BRAKING", alarm: null },
      ),
    ).toBe("engage");
    expect(
      detectAudioCue(
        { phase: "BRAKING", alarm: null },
        { phase: "APPROACH", alarm: null },
      ),
    ).toBe("phase");
  });
});
