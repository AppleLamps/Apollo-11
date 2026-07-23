import * as THREE from "three";

export function setupLighting(scene: THREE.Scene): void {
  scene.add(new THREE.HemisphereLight(0xc9d6e6, 0x3d342c, 0.42));

  const sun = new THREE.DirectionalLight(0xffe6c8, 2.1);
  sun.position.set(-120, 160, 70);
  sun.castShadow = true;
  const mapSize = isLowPowerDevice() ? 512 : 1024;
  sun.shadow.mapSize.set(mapSize, mapSize);
  sun.shadow.camera.near = 10;
  sun.shadow.camera.far = 400;
  sun.shadow.camera.left = -80;
  sun.shadow.camera.right = 80;
  sun.shadow.camera.top = 80;
  sun.shadow.camera.bottom = -80;
  sun.shadow.bias = -0.0002;
  scene.add(sun);

  const fill = new THREE.DirectionalLight(0x7f9bb8, 0.35);
  fill.position.set(60, 40, -80);
  scene.add(fill);

  const rim = new THREE.DirectionalLight(0xffd09a, 0.45);
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
