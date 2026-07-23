import { FAULT_CATALOG, isFaultId } from "../sim/faults";
import type { Telemetry } from "../sim/types";
import type { LandingWorld } from "../sim/world";

function fmt(n: number, digits = 1): string {
  if (!Number.isFinite(n)) return "—";
  return n.toFixed(digits);
}

const TELEMETRY_KEYS = [
  "Altitude",
  "Radar",
  "Range to site",
  "Vx / Vy",
  "Pitch",
  "Throttle",
  "Thrust",
  "Fuel",
  "Slope",
] as const;

/** Minimum gap between polite status announcements (ms). */
const STATUS_ANNOUNCE_MS = 1600;

export class Hud {
  private telemetryGrid: HTMLDListElement;
  private phaseLine: HTMLElement;
  private alarmLine: HTMLElement;
  private statusText: HTMLElement;
  private clockText: HTMLElement;
  private faultButtons: HTMLElement;
  private announce: HTMLElement;
  private btnStart: HTMLButtonElement;
  private btnReset: HTMLButtonElement;
  private btnPause: HTMLButtonElement;
  private valueNodes = new Map<string, HTMLElement>();
  private lastAnnounceKey = "";
  private lastAnnounceAt = 0;

  constructor(
    private world: LandingWorld,
    private onChange: () => void,
  ) {
    this.telemetryGrid = el("telemetry-grid") as HTMLDListElement;
    this.phaseLine = el("phase-line");
    this.alarmLine = el("alarm-line");
    this.statusText = el("status-text");
    this.clockText = el("clock-text");
    this.faultButtons = el("fault-buttons");
    this.announce = el("a11y-announce");
    this.btnStart = el("btn-start") as HTMLButtonElement;
    this.btnReset = el("btn-reset") as HTMLButtonElement;
    this.btnPause = el("btn-pause") as HTMLButtonElement;

    this.mountTelemetrySkeleton();
    this.mountFaults();
    this.bindControls();
    this.render(world.telemetry());
  }

  private mountTelemetrySkeleton(): void {
    this.telemetryGrid.replaceChildren();
    this.valueNodes.clear();
    for (const key of TELEMETRY_KEYS) {
      const dt = document.createElement("dt");
      dt.textContent = key;
      const dd = document.createElement("dd");
      dd.textContent = "—";
      this.telemetryGrid.append(dt, dd);
      this.valueNodes.set(key, dd);
    }
  }

  private mountFaults(): void {
    this.faultButtons.replaceChildren();
    for (const fault of FAULT_CATALOG) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "fault-btn";
      btn.dataset.faultId = fault.id;
      btn.title = fault.description;

      const label = document.createElement("span");
      label.textContent = fault.label;
      const detail = document.createElement("small");
      detail.textContent = fault.description;
      btn.append(label, detail);

      btn.addEventListener("click", () => {
        const id = btn.dataset.faultId;
        if (!id || !isFaultId(id)) return;
        this.world.toggleFault(id);
        this.syncFaultButtons();
        this.onChange();
      });
      this.faultButtons.append(btn);
    }
    this.syncFaultButtons();
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
  }

  syncFaultButtons(): void {
    for (const btn of this.faultButtons.querySelectorAll<HTMLButtonElement>(".fault-btn")) {
      const id = btn.dataset.faultId;
      if (!id || !isFaultId(id)) continue;
      btn.classList.toggle("active", this.world.state.faults[id]);
      btn.setAttribute("aria-pressed", String(this.world.state.faults[id]));
    }
  }

  render(t: Telemetry): void {
    const values: Record<(typeof TELEMETRY_KEYS)[number], string> = {
      Altitude: `${fmt(t.altitudeM, 0)} m`,
      Radar: `${fmt(t.sensedAltitudeM, 0)} m`,
      "Range to site": `${fmt(t.rangeM, 0)} m`,
      "Vx / Vy": `${fmt(t.vx, 1)} / ${fmt(t.vy, 1)} m/s`,
      Pitch: `${fmt(t.pitchDeg, 1)}°`,
      Throttle: `${fmt(t.throttle * 100, 0)}%`,
      Thrust: `${fmt(t.thrustN / 1000, 1)} kN`,
      Fuel: `${fmt(t.fuelKg, 0)} kg`,
      Slope: `${fmt(t.slopeDeg, 1)}°`,
    };

    for (const key of TELEMETRY_KEYS) {
      const node = this.valueNodes.get(key);
      if (node) node.textContent = values[key];
    }

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
    this.syncFaultButtons();
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
