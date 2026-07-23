import { describe, expect, it, vi } from "vitest";
import { ResourceTracker } from "./ResourceTracker";

describe("ResourceTracker", () => {
  it("disposes each tracked resource once and clears ownership", () => {
    const tracker = new ResourceTracker();
    const first = { dispose: vi.fn() };
    const second = { dispose: vi.fn() };

    expect(tracker.track(first)).toBe(first);
    tracker.track(first);
    tracker.track(second);
    tracker.dispose();
    tracker.dispose();

    expect(first.dispose).toHaveBeenCalledTimes(1);
    expect(second.dispose).toHaveBeenCalledTimes(1);
  });
});
