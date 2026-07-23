import * as THREE from "three";

export function setupLighting(scene: THREE.Scene, shadowMapSize: number): THREE.DirectionalLight {
  // The Moon has no atmosphere: keep ambient light restrained so terrain
  // relief is defined primarily by the hard, low-angle sun.
  scene.add(new THREE.HemisphereLight(0x9bacbd, 0x171411, 0.2));

  const sun = new THREE.DirectionalLight(0xfff1d2, 3.25);
  sun.name = "sun-light";
  sun.position.set(-160, 115, 85);
  sun.castShadow = true;
  sun.shadow.mapSize.set(shadowMapSize, shadowMapSize);
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
  return sun;
}
