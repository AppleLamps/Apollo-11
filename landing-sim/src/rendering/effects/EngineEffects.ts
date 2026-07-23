import * as THREE from "three";
import type { RenderSnapshot } from "../../sim/types";
import type { ResourceTracker } from "../ResourceTracker";

export class EngineEffects {
  private readonly plumeCore: THREE.Mesh;
  private readonly plumeInner: THREE.Mesh;
  private readonly plumeOuter: THREE.Mesh;
  private readonly groundGlow: THREE.Mesh;
  private readonly engineLight: THREE.PointLight;
  private readonly dustBase: Float32Array;
  readonly dust: THREE.Points;

  constructor(lander: THREE.Group, resources: ResourceTracker) {
    const coreMaterial = resources.track(
      new THREE.MeshBasicMaterial({
        color: 0xeaf8ff,
        transparent: true,
        opacity: 0.92,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );
    this.plumeCore = new THREE.Mesh(
      resources.track(new THREE.ConeGeometry(0.1, 1.05, 16, 1, true)),
      coreMaterial,
    );
    this.plumeCore.position.y = -1.12;
    this.plumeCore.rotation.x = Math.PI;
    lander.add(this.plumeCore);

    const plumeMaterial = resources.track(
      new THREE.MeshBasicMaterial({
        color: 0xffd08a,
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

    this.engineLight = new THREE.PointLight(0xffa557, 0, 11, 2);
    this.engineLight.position.y = -1.05;
    lander.add(this.engineLight);

    this.groundGlow = new THREE.Mesh(
      resources.track(new THREE.CircleGeometry(4.5, 48)),
      resources.track(
        new THREE.MeshBasicMaterial({
          color: 0xffa45e,
          transparent: true,
          opacity: 0,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
          side: THREE.DoubleSide,
        }),
      ),
    );
    this.groundGlow.rotation.x = -Math.PI / 2;
    resources.trackObject(this.groundGlow);

    const dustResult = createDust(resources);
    this.dust = dustResult.points;
    this.dustBase = dustResult.base;
    this.dust.add(this.groundGlow);
  }

  update(
    snapshot: Readonly<RenderSnapshot>,
    elapsed: number,
    x: number,
    surfaceY: number,
  ): void {
    const thrust = snapshot.telemetry.throttle;
    const plumeOn =
      thrust > 0.05 &&
      snapshot.fuelRemaining &&
      snapshot.phase !== "STANDBY" &&
      snapshot.phase !== "LANDED" &&
      snapshot.phase !== "CRASHED";
    this.plumeInner.visible = plumeOn;
    this.plumeOuter.visible = plumeOn;
    this.plumeCore.visible = plumeOn;

    if (plumeOn) {
      const flicker = 0.91 + Math.sin(elapsed * 47) * 0.055 + Math.sin(elapsed * 83) * 0.035;
      this.plumeCore.scale.set(0.82 + thrust * 0.28, (0.7 + thrust * 1.05) * flicker, 0.82 + thrust * 0.28);
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
    this.engineLight.intensity = plumeOn ? 1.4 + thrust * 4.2 : 0;

    const altitude = Math.max(snapshot.telemetry.altitudeM, 1);
    const nearSurface = altitude < 110 && thrust > 0.15;
    const material = this.dust.material as THREE.PointsMaterial;
    material.opacity = nearSurface
      ? THREE.MathUtils.clamp((110 - altitude) / 110, 0, 0.85) * thrust
      : 0;
    const dustStrength = nearSurface ? THREE.MathUtils.clamp((110 - altitude) / 90, 0, 1) * thrust : 0;
    const positions = this.dust.geometry.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < positions.count; i++) {
      const baseIndex = i * 3;
      const phase = (elapsed * (2.2 + (i % 11) * 0.08) + this.dustBase[baseIndex + 2]) % 1;
      const radius = this.dustBase[baseIndex] * (0.3 + phase * 1.15);
      const angle = this.dustBase[baseIndex + 1] + elapsed * 0.16;
      positions.setXYZ(
        i,
        Math.cos(angle) * radius,
        0.08 + Math.sin(phase * Math.PI) * (0.25 + radius * 0.055) * dustStrength,
        Math.sin(angle) * radius,
      );
    }
    positions.needsUpdate = nearSurface;
    const glowMaterial = this.groundGlow.material as THREE.MeshBasicMaterial;
    glowMaterial.opacity = dustStrength * 0.12;
    this.groundGlow.scale.setScalar(0.55 + dustStrength * 1.2);
    this.dust.position.set(x, surfaceY + 0.35, 0);
  }
}

function createDust(resources: ResourceTracker): { points: THREE.Points; base: Float32Array } {
  const count = 900;
  const positions = new Float32Array(count * 3);
  const base = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const angle = Math.random() * Math.PI * 2;
    const radius = 1.5 + Math.pow(Math.random(), 0.65) * 14;
    positions[i * 3] = Math.cos(angle) * radius;
    positions[i * 3 + 1] = Math.random() * 0.4;
    positions[i * 3 + 2] = Math.sin(angle) * radius;
    base[i * 3] = radius;
    base[i * 3 + 1] = angle;
    base[i * 3 + 2] = Math.random();
  }
  const geometry = resources.track(new THREE.BufferGeometry());
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  const points = new THREE.Points(
    geometry,
    resources.track(
      new THREE.PointsMaterial({
        color: 0xc8b89d,
        size: 0.3,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        blending: THREE.NormalBlending,
      }),
    ),
  );
  return { points, base };
}
