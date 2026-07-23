export type CameraMode = "chase" | "orbit" | "side" | "pad" | "high";

export const CAMERA_MODES: { id: CameraMode; label: string; hint: string }[] = [
  { id: "chase", label: "Chase", hint: "Follow the lander" },
  { id: "orbit", label: "Free", hint: "Drag to orbit · scroll to zoom" },
  { id: "side", label: "Side", hint: "Profile tracking shot" },
  { id: "pad", label: "Pad", hint: "From the landing site" },
  { id: "high", label: "High", hint: "Overhead approach view" },
];
