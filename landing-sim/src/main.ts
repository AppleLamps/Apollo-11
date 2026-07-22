import "./style.css";
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
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;

  world.step(dt);
  const telemetry = world.telemetry();
  hud.render(telemetry);
  scene.sync(world, telemetry);

  requestAnimationFrame(frame);
}

requestAnimationFrame(frame);
