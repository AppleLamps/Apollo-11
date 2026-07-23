export const GRAPHICS_QUALITIES = ["low", "high", "cinematic"] as const;

export type GraphicsQuality = (typeof GRAPHICS_QUALITIES)[number];

export interface GraphicsProfile {
  label: string;
  pixelRatioCap: number;
  shadowMapSize: number;
  dustCount: number;
  bloom: boolean;
}

export const GRAPHICS_PROFILES: Record<GraphicsQuality, GraphicsProfile> = {
  low: {
    label: "Low",
    pixelRatioCap: 1,
    shadowMapSize: 1024,
    dustCount: 240,
    bloom: false,
  },
  high: {
    label: "High",
    pixelRatioCap: 1.75,
    shadowMapSize: 2048,
    dustCount: 900,
    bloom: false,
  },
  cinematic: {
    label: "Cinematic",
    pixelRatioCap: 2,
    shadowMapSize: 4096,
    dustCount: 1400,
    bloom: true,
  },
};

const STORAGE_KEY = "luminary.graphics-quality";

export function isGraphicsQuality(value: string | null): value is GraphicsQuality {
  return GRAPHICS_QUALITIES.includes(value as GraphicsQuality);
}

export function getInitialGraphicsQuality(): GraphicsQuality {
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (isGraphicsQuality(saved)) return saved;
  } catch {
    // Storage may be unavailable in privacy modes.
  }

  const nav = navigator as Navigator & { deviceMemory?: number };
  const constrained =
    window.matchMedia("(max-width: 700px)").matches ||
    (typeof nav.deviceMemory === "number" && nav.deviceMemory <= 4) ||
    (typeof nav.hardwareConcurrency === "number" && nav.hardwareConcurrency <= 4);
  return constrained ? "low" : "high";
}

export function persistGraphicsQuality(quality: GraphicsQuality): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, quality);
  } catch {
    // The setting still applies for the current session.
  }
}
