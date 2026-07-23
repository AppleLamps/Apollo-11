import type { Telemetry } from "../sim/types";
import type { LandingWorld } from "../sim/world";
import { CAMERA_MODES, isCameraMode, type CameraMode } from "./cameraRig";
import { FaultPanel } from "./FaultPanel";
import type { LandingScene } from "./scene";
import { TelemetryPanel } from "./TelemetryPanel";

function fmt(n: number, digits = 1): string {
  if (!Number.isFinite(n)) return "—";
  return n.toFixed(digits);
}

/** Minimum gap between polite status announcements (ms). */
const STATUS_ANNOUNCE_MS = 1600;

export class Hud {
  private telemetryPanel: TelemetryPanel;
  private faultPanel: FaultPanel;
  private phaseLine: HTMLElement;
  private alarmLine: HTMLElement;
  private statusText: HTMLElement;
  private clockText: HTMLElement;
  private announce: HTMLElement;
  private btnStart: HTMLButtonElement;
  private btnReset: HTMLButtonElement;
  private btnPause: HTMLButtonElement;
  private cameraModes: HTMLElement;
  private cameraHint: HTMLElement;
  private lastAnnounceKey = "";
  private lastAnnounceAt = 0;
  private readonly onKeyDown = (event: KeyboardEvent): void => {
    if (
      event.target instanceof HTMLInputElement ||
      event.target instanceof HTMLTextAreaElement ||
      (event.target instanceof HTMLElement && event.target.isContentEditable)
    ) {
      return;
    }
    if (event.metaKey || event.ctrlKey || event.altKey) return;

    const map: Record<string, CameraMode> = {
      "1": "chase",
      "2": "orbit",
      "3": "side",
      "4": "pad",
      "5": "high",
    };
    const mode = map[event.key];
    if (!mode) return;
    event.preventDefault();
    this.setCameraMode(mode);
  };

  constructor(
    private world: LandingWorld,
    private scene: LandingScene,
    private onChange: () => void,
  ) {
    this.telemetryPanel = new TelemetryPanel(el("telemetry-grid") as HTMLDListElement);
    this.phaseLine = el("phase-line");
    this.alarmLine = el("alarm-line");
    this.statusText = el("status-text");
    this.clockText = el("clock-text");
    this.announce = el("a11y-announce");
    this.btnStart = el("btn-start") as HTMLButtonElement;
    this.btnReset = el("btn-reset") as HTMLButtonElement;
    this.btnPause = el("btn-pause") as HTMLButtonElement;
    this.cameraModes = el("camera-modes");
    this.cameraHint = el("camera-hint");

    this.faultPanel = new FaultPanel(el("fault-buttons"), world, onChange);
    this.mountCameraModes();
    this.bindControls();
    this.render(world.telemetry());
  }

  private mountCameraModes(): void {
    this.cameraModes.replaceChildren();
    for (const mode of CAMERA_MODES) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "btn";
      btn.dataset.cameraMode = mode.id;
      btn.textContent = mode.label;
      btn.title = mode.hint;
      btn.addEventListener("click", () => {
        const id = btn.dataset.cameraMode;
        if (!id || !isCameraMode(id)) return;
        this.setCameraMode(id);
      });
      this.cameraModes.append(btn);
    }
    this.syncCameraModes();
  }

  private setCameraMode(mode: string): void {
    if (!isCameraMode(mode)) return;
    if (!this.scene.setCameraMode(mode)) return;
    this.syncCameraModes();
  }

  private syncCameraModes(): void {
    const active = this.scene.getCameraMode();
    const meta = CAMERA_MODES.find((m) => m.id === active);
    this.cameraHint.textContent = meta?.hint ?? "";
    document.getElementById("app")?.setAttribute("data-camera", active);
    for (const btn of this.cameraModes.querySelectorAll<HTMLButtonElement>(".btn")) {
      const id = btn.dataset.cameraMode;
      const on = id === active;
      btn.classList.toggle("active", on);
      btn.setAttribute("aria-pressed", String(on));
    }
  }

  private bindControls(): void {
    this.btnStart.addEventListener("click", () => {
      this.world.engage();
      this.btnPause.disabled = false;
      this.btnPause.textContent = "Pause";
      this.onChange();
    });
    this.btnReset.addEventListener("click", () => {
      this.world.reset(true);
      this.btnPause.disabled = true;
      this.btnPause.textContent = "Pause";
      this.onChange();
    });
    this.btnPause.addEventListener("click", () => {
      this.world.togglePause();
      this.btnPause.textContent = this.world.state.paused ? "Resume" : "Pause";
      this.onChange();
    });

    window.addEventListener("keydown", this.onKeyDown);
  }

  dispose(): void {
    window.removeEventListener("keydown", this.onKeyDown);
  }

  render(t: Telemetry): void {
    this.telemetryPanel.render(t);

    this.phaseLine.textContent = t.phase;
    this.phaseLine.dataset.phase = t.phase;

    if (t.alarm) {
      this.alarmLine.hidden = false;
      this.alarmLine.textContent = `ALARM ${t.alarm}`;
    } else {
      this.alarmLine.hidden = true;
      this.alarmLine.textContent = "";
    }

    this.clockText.textContent = `T+${fmt(t.timeSec, 1)}s`;

    const status = this.statusMessage(t);
    this.statusText.textContent = status;
    this.maybeAnnounce(t, status);

    this.btnPause.disabled = !this.world.state.running;
    this.faultPanel.render();
  }

  private statusMessage(t: Telemetry): string {
    if (t.outcome) return t.outcome;
    if (!this.world.state.running) return "Press Engage to begin powered descent.";
    if (this.world.state.paused) return "Paused.";
    const faults = Object.entries(this.world.state.faults)
      .filter(([, on]) => on)
      .map(([id]) => id.replaceAll("_", " "));
    return faults.length
      ? `Autopilot flying with faults: ${faults.join(", ")}`
      : "Autopilot flying clean.";
  }

  /**
   * Announce phase / alarm / outcome changes immediately; throttle routine status.
   * Visual telemetry updates every frame without hitting aria-live.
   */
  private maybeAnnounce(t: Telemetry, status: string): void {
    const key = `${t.phase}|${t.alarm ?? ""}|${t.outcome ?? ""}|${status}`;
    if (key === this.lastAnnounceKey) return;

    const now = performance.now();
    const phaseAlarmOutcome = `${t.phase}|${t.alarm ?? ""}|${t.outcome ?? ""}`;
    const prevPhaseAlarmOutcome = this.lastAnnounceKey.split("|").slice(0, 3).join("|");
    const urgent = phaseAlarmOutcome !== prevPhaseAlarmOutcome || Boolean(t.outcome) || Boolean(t.alarm);

    if (!urgent && now - this.lastAnnounceAt < STATUS_ANNOUNCE_MS) return;

    this.lastAnnounceKey = key;
    this.lastAnnounceAt = now;
    this.announce.textContent = t.alarm
      ? `${t.phase}. Alarm ${t.alarm}. ${status}`
      : `${t.phase}. ${status}`;
  }
}

function el(id: string): HTMLElement {
  const node = document.getElementById(id);
  if (!node) throw new Error(`Missing #${id}`);
  return node;
}
