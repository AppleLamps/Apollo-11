import * as THREE from "three";
import type { RenderSnapshot } from "../../sim/types";
import type { ResourceTracker } from "../ResourceTracker";

export class EngineEffects {
  private readonly plumeInner: THREE.Mesh;
  private readonly plumeOuter: THREE.Mesh;
  readonly dust: THREE.Points;

  constructor(lander: THREE.Group, resources: ResourceTracker) {
    const plumeMaterial = resources.track(
      new THREE.MeshBasicMaterial({
        color: 0xffc078,
        transparent: true,
        opacity: 0.55,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
      }),
    );
    this.plumeInner = new THREE.Mesh(
      resources.track(new THREE.ConeGeometry(0.22, 1.6, 18, 1, true)),
      plumeMaterial,
    );
    this.plumeInner.position.y = -1.35;
    this.plumeInner.rotation.x = Math.PI;
    lander.add(this.plumeInner);

    const outerMaterial = resources.track(plumeMaterial.clone());
    outerMaterial.color.setHex(0xff8a4a);
    outerMaterial.opacity = 0.28;
    this.plumeOuter = new THREE.Mesh(
      resources.track(new THREE.ConeGeometry(0.48, 2.6, 20, 1, true)),
      outerMaterial,
    );
    this.plumeOuter.position.y = -1.7;
    this.plumeOuter.rotation.x = Math.PI;
    lander.add(this.plumeOuter);

    this.dust = createDust(resources);
  }

  update(
    snapshot: Readonly<RenderSnapshot>,
    elapsed: number,
    x: number,
    surfaceY: number,
  ): void {
    const thrust = snapshot.telemetry.throttle;
    const plumeOn = thrust > 0.05 && snapshot.fuelRemaining && snapshot.phase !== "LANDED";
    this.plumeInner.visible = plumeOn;
    this.plumeOuter.visible = plumeOn;

    if (plumeOn) {
      const flicker = 0.92 + Math.sin(elapsed * 40) * 0.08;
      this.plumeInner.scale.set(
        0.7 + thrust * 0.5,
        (0.8 + thrust * 1.6) * flicker,
        0.7 + thrust * 0.5,
      );
      this.plumeOuter.scale.set(
        0.9 + thrust,
        (1 + thrust * 1.8) * flicker,
        0.9 + thrust,
      );
      (this.plumeInner.material as THREE.MeshBasicMaterial).opacity = 0.3 + thrust * 0.5;
      (this.plumeOuter.material as THREE.MeshBasicMaterial).opacity = 0.12 + thrust * 0.28;
    }

    const altitude = Math.max(snapshot.telemetry.altitudeM, 1);
    const nearSurface = altitude < 110 && thrust > 0.15;
    const material = this.dust.material as THREE.PointsMaterial;
    material.opacity = nearSurface
      ? THREE.MathUtils.clamp((110 - altitude) / 110, 0, 0.85) * thrust
      : 0;
    this.dust.position.set(x, surfaceY + 0.35, 0);
    this.dust.rotation.y = elapsed * 0.55;
  }
}

function createDust(resources: ResourceTracker): THREE.Points {
  const count = 700;
  const positions = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const angle = Math.random() * Math.PI * 2;
    const radius = Math.random() * 12;
    positions[i * 3] = Math.cos(angle) * radius;
    positions[i * 3 + 1] = Math.random() * 2.2;
    positions[i * 3 + 2] = Math.sin(angle) * radius;
  }
  const geometry = resources.track(new THREE.BufferGeometry());
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  return new THREE.Points(
    geometry,
    resources.track(
      new THREE.PointsMaterial({
        color: 0xd2c3a8,
        size: 0.42,
        transparent: true,
        opacity: 0,
        depthWrite: false,
      }),
    ),
  );
}
