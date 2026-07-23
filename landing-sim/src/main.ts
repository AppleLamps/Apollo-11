import "./style.css";
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
const hud = new Hud(world, () => hud.render(world.telemetry()));

let last = performance.now();

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
  scene.sync(world, telemetry);

  requestAnimationFrame(frame);
}

requestAnimationFrame(frame);
