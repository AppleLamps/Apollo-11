import * as THREE from "three";

export function setupLighting(scene: THREE.Scene): void {
  // The Moon has no atmosphere: keep ambient light restrained so terrain
  // relief is defined primarily by the hard, low-angle sun.
  scene.add(new THREE.HemisphereLight(0x9bacbd, 0x171411, 0.2));

  const sun = new THREE.DirectionalLight(0xfff1d2, 3.25);
  sun.name = "sun-light";
  sun.position.set(-160, 115, 85);
  sun.castShadow = true;
  const mapSize = isLowPowerDevice() ? 1024 : 2048;
  sun.shadow.mapSize.set(mapSize, mapSize);
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 420;
  sun.shadow.camera.left = -95;
  sun.shadow.camera.right = 95;
  sun.shadow.camera.top = 95;
  sun.shadow.camera.bottom = -95;
  sun.shadow.bias = -0.00008;
  sun.shadow.normalBias = 0.035;
  sun.shadow.radius = 2;
  scene.add(sun, sun.target);

  const fill = new THREE.DirectionalLight(0x6682a3, 0.16);
  fill.position.set(60, 40, -80);
  scene.add(fill);

  const rim = new THREE.DirectionalLight(0xffc477, 0.22);
  rim.position.set(40, 20, 100);
  scene.add(rim);
}

function isLowPowerDevice(): boolean {
  const nav = navigator as Navigator & { deviceMemory?: number; hardwareConcurrency?: number };
  const smallViewport = window.matchMedia("(max-width: 700px)").matches;
  const lowMemory = typeof nav.deviceMemory === "number" && nav.deviceMemory <= 4;
  const lowCpu = typeof nav.hardwareConcurrency === "number" && nav.hardwareConcurrency <= 4;
  return smallViewport || lowMemory || lowCpu;
}
