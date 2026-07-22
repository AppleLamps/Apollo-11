import { FAULT_CATALOG } from "../sim/faults";
import type { FaultId, Telemetry } from "../sim/types";
import type { LandingWorld } from "../sim/world";

function fmt(n: number, digits = 1): string {
  return n.toFixed(digits);
}

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

    this.mountFaults();
    this.bindControls();
    this.render(world.telemetry());
  }

  private mountFaults(): void {
    this.faultButtons.replaceChildren();
    for (const fault of FAULT_CATALOG) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "fault-btn";
      btn.dataset.faultId = fault.id;
      btn.title = fault.description;
      btn.innerHTML = `<span>${fault.label}</span><small>${fault.description}</small>`;
      btn.addEventListener("click", () => {
        this.world.toggleFault(fault.id as FaultId);
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
      const id = btn.dataset.faultId as FaultId;
      btn.classList.toggle("active", this.world.state.faults[id]);
      btn.setAttribute("aria-pressed", String(this.world.state.faults[id]));
    }
  }

  render(t: Telemetry): void {
    const rows: [string, string][] = [
      ["Altitude", `${fmt(t.altitudeM, 0)} m`],
      ["Radar", `${fmt(t.sensedAltitudeM, 0)} m`],
      ["Range to site", `${fmt(t.rangeM, 0)} m`],
      ["Vx / Vy", `${fmt(t.vx, 1)} / ${fmt(t.vy, 1)} m/s`],
      ["Pitch", `${fmt(t.pitchDeg, 1)}°`],
      ["Throttle", `${fmt(t.throttle * 100, 0)}%`],
      ["Thrust", `${fmt(t.thrustN / 1000, 1)} kN`],
      ["Fuel", `${fmt(t.fuelKg, 0)} kg`],
      ["Slope", `${fmt(t.slopeDeg, 1)}°`],
    ];

    this.telemetryGrid.replaceChildren();
    for (const [k, v] of rows) {
      const dt = document.createElement("dt");
      dt.textContent = k;
      const dd = document.createElement("dd");
      dd.textContent = v;
      this.telemetryGrid.append(dt, dd);
    }

    this.phaseLine.textContent = t.phase;
    this.phaseLine.dataset.phase = t.phase;

    if (t.alarm) {
      this.alarmLine.hidden = false;
      this.alarmLine.textContent = `ALARM ${t.alarm}`;
    } else {
      this.alarmLine.hidden = true;
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
