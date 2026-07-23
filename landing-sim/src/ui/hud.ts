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

export class Hud {
  private telemetryGrid: HTMLDListElement;
  private phaseLine: HTMLElement;
  private alarmLine: HTMLElement;
  private statusText: HTMLElement;
  private clockText: HTMLElement;
  private faultButtons: HTMLElement;
  private btnStart: HTMLButtonElement;
  private btnReset: HTMLButtonElement;
  private btnPause: HTMLButtonElement;
  private valueNodes = new Map<string, HTMLElement>();

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

    if (t.outcome) {
      this.statusText.textContent = t.outcome;
    } else if (!this.world.state.running) {
      this.statusText.textContent = "Press Engage to begin powered descent.";
    } else if (this.world.state.paused) {
      this.statusText.textContent = "Paused.";
    } else {
      const faults = Object.entries(this.world.state.faults)
        .filter(([, on]) => on)
        .map(([id]) => id.replaceAll("_", " "));
      this.statusText.textContent = faults.length
        ? `Autopilot flying with faults: ${faults.join(", ")}`
        : "Autopilot flying clean.";
    }

    this.btnPause.disabled = !this.world.state.running;
    this.syncFaultButtons();
  }
}

function el(id: string): HTMLElement {
  const node = document.getElementById(id);
  if (!node) throw new Error(`Missing #${id}`);
  return node;
}
