import type { Telemetry } from "../sim/types";

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

function formatNumber(value: number, digits = 1): string {
  return Number.isFinite(value) ? value.toFixed(digits) : "—";
}

export class TelemetryPanel {
  private readonly valueNodes = new Map<string, HTMLElement>();

  constructor(private readonly grid: HTMLDListElement) {
    this.mount();
  }

  private mount(): void {
    this.grid.replaceChildren();
    for (const key of TELEMETRY_KEYS) {
      const label = document.createElement("dt");
      label.textContent = key;
      const value = document.createElement("dd");
      value.textContent = "—";
      this.grid.append(label, value);
      this.valueNodes.set(key, value);
    }
  }

  render(telemetry: Telemetry): void {
    const values: Record<(typeof TELEMETRY_KEYS)[number], string> = {
      Altitude: `${formatNumber(telemetry.altitudeM, 0)} m`,
      Radar: `${formatNumber(telemetry.sensedAltitudeM, 0)} m`,
      "Range to site": `${formatNumber(telemetry.rangeM, 0)} m`,
      "Vx / Vy": `${formatNumber(telemetry.vx, 1)} / ${formatNumber(telemetry.vy, 1)} m/s`,
      Pitch: `${formatNumber(telemetry.pitchDeg, 1)}°`,
      Throttle: `${formatNumber(telemetry.throttle * 100, 0)}%`,
      Thrust: `${formatNumber(telemetry.thrustN / 1000, 1)} kN`,
      Fuel: `${formatNumber(telemetry.fuelKg, 0)} kg`,
      Slope: `${formatNumber(telemetry.slopeDeg, 1)}°`,
    };

    for (const key of TELEMETRY_KEYS) {
      const node = this.valueNodes.get(key);
      if (node) node.textContent = values[key];
    }
  }
}
