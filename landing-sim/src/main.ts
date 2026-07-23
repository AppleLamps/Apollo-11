import "@fontsource/syne/latin-600.css";
import "@fontsource/syne/latin-700.css";
import "@fontsource/syne/latin-800.css";
import "@fontsource/ibm-plex-mono/latin-400.css";
import "@fontsource/ibm-plex-mono/latin-500.css";
import "@fontsource/ibm-plex-mono/latin-600.css";
import "./style.css";
import { AudioController } from "./audio/AudioController";
import { FramePerformanceMonitor } from "./rendering/FramePerformanceMonitor";
import { sanitizeDt } from "./sim/safeMath";
import { LandingWorld } from "./sim/world";
import { Hud } from "./ui/hud";
import { LandingScene } from "./ui/scene";

const canvas = document.getElementById("viewport");
if (!(canvas instanceof HTMLCanvasElement)) {
  throw new Error("Missing viewport canvas");
}

const world = new LandingWorld();
const scene = new LandingScene(canvas);
const audio = new AudioController();
const hud = new Hud(world, scene, audio, () => hud.render(world.telemetry()));
const performanceMonitor = new FramePerformanceMonitor();

let last = performance.now();
let raf = 0;

function frame(now: number): void {
  // Guard against tab-suspend clock jumps and non-finite timestamps
  const rawDt = (now - last) / 1000;
  last = Number.isFinite(now) ? now : performance.now();
  const dt = sanitizeDt(rawDt, 0.05) ?? 0;

  if (dt > 0) {
    world.step(dt);
  }
  const telemetry = world.telemetry();
  hud.render(telemetry);
  scene.render(world.renderSnapshot(telemetry));
  const performanceReading = performanceMonitor.update(rawDt, scene.getGraphicsQuality());
  if (performanceReading) hud.updatePerformance(performanceReading);
  audio.update(telemetry, world.state.running, world.state.paused);

  raf = requestAnimationFrame(frame);
}

raf = requestAnimationFrame(frame);

window.addEventListener("pagehide", () => {
  cancelAnimationFrame(raf);
  hud.dispose();
  scene.dispose();
  audio.dispose();
});
