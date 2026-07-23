import * as THREE from "three";
import { CameraController } from "../rendering/CameraController";
import { EngineEffects } from "../rendering/effects/EngineEffects";
import { createLandingSite } from "../rendering/environment/createLandingSite";
import { setupLighting } from "../rendering/environment/setupLighting";
import { ResourceTracker } from "../rendering/ResourceTracker";
import { createLander } from "../rendering/vehicles/createLander";
import type { RenderSnapshot } from "../sim/types";
import { saneCameraScalar } from "./cameraRig";

const METERS_TO_SCENE = 0.01;

export class LandingScene {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene: THREE.Scene;
  readonly camera: THREE.PerspectiveCamera;
  private cameraController: CameraController;
  private lander: THREE.Group;
  private engineEffects: EngineEffects;
  private starsNear: THREE.Points;
  private starsFar: THREE.Points;
  private milkyWay: THREE.Mesh;
  private earth: THREE.Mesh;
  private terrain: THREE.Mesh;
  private farRim: THREE.Mesh;
  private targetMarker: THREE.Group;
  private landingBeacon: THREE.Mesh | null;
  private clock = new THREE.Clock();
  private contextLost = false;
  private readonly resources = new ResourceTracker();
  private readonly landerWorld = new THREE.Vector3();
  private readonly padWorld = new THREE.Vector3(0, 0.2, 0);
  private readonly onResize = (): void => {
    this.resize();
  };
  private readonly onContextLost = (event: Event): void => {
    event.preventDefault();
    this.contextLost = true;
  };
  private readonly onContextRestored = (): void => {
    this.contextLost = false;
    this.resize();
  };

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: false,
      powerPreference: "high-performance",
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(canvas.clientWidth, canvas.clientHeight, false);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.setClearColor(0x020308, 1);

    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.FogExp2(0x12151c, 0.00135);

    this.camera = new THREE.PerspectiveCamera(
      52,
      canvas.clientWidth / Math.max(canvas.clientHeight, 1),
      0.2,
      8000,
    );

    this.cameraController = new CameraController(this.camera, canvas);

    setupLighting(this.scene);
    this.starsFar = this.makeStars(4200, 900, 2200, 0.55, 0xb8c4d4);
    this.starsNear = this.makeStars(900, 380, 900, 1.35, 0xf2f6ff);
    this.scene.add(this.starsFar, this.starsNear);
    this.milkyWay = this.makeMilkyWay();
    this.scene.add(this.milkyWay);
    this.earth = this.makeEarth();
    this.scene.add(this.earth);

    this.terrain = this.makeTerrain();
    this.scene.add(this.terrain);
    this.farRim = this.makeFarRim();
    this.scene.add(this.farRim);

    this.targetMarker = createLandingSite();
    this.scene.add(this.targetMarker);
    const beacon = this.targetMarker.getObjectByName("beacon");
    this.landingBeacon = beacon instanceof THREE.Mesh ? beacon : null;

    this.lander = createLander();
    this.scene.add(this.lander);

    this.engineEffects = new EngineEffects(this.lander, this.resources);
    this.scene.add(this.engineEffects.dust);
    this.resources.trackObject(this.scene);

    window.addEventListener("resize", this.onResize);
    canvas.addEventListener("webglcontextlost", this.onContextLost, false);
    canvas.addEventListener("webglcontextrestored", this.onContextRestored, false);
    this.resize();
  }

  setCameraMode(mode: string): boolean {
    return this.cameraController.setMode(mode, this.landerWorld);
  }

  getCameraMode() {
    return this.cameraController.getMode();
  }

  dispose(): void {
    window.removeEventListener("resize", this.onResize);
    this.renderer.domElement.removeEventListener("webglcontextlost", this.onContextLost);
    this.renderer.domElement.removeEventListener("webglcontextrestored", this.onContextRestored);
    this.cameraController.dispose();
    this.resources.dispose();
    this.renderer.dispose();
  }

  resize(): void {
    const canvas = this.renderer.domElement;
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    if (canvas.width !== width || canvas.height !== height) {
      this.renderer.setSize(width, height, false);
      this.camera.aspect = width / Math.max(height, 1);
      this.camera.updateProjectionMatrix();
    }
  }

  render(snapshot: Readonly<RenderSnapshot>): void {
    if (this.contextLost) return;

    const t = this.clock.getElapsedTime();
    const { telemetry } = snapshot;
    const x = saneCameraScalar(snapshot.x, 0) * METERS_TO_SCENE;
    const y = saneCameraScalar(snapshot.y, 100) * METERS_TO_SCENE;
    const surfaceY = saneCameraScalar(snapshot.surfaceHeightM, 0) * METERS_TO_SCENE;
    const slope = saneCameraScalar(snapshot.surfaceSlopeRad, 0);

    this.landerWorld.set(x, y, 0);
    this.padWorld.set(0, surfaceY + 0.15, 0);

    this.lander.position.copy(this.landerWorld);
    this.lander.rotation.z = -snapshot.pitch;
    if (snapshot.phase === "CRASHED") {
      this.lander.rotation.x = 0.85;
      this.lander.rotation.z += 0.55;
      this.lander.rotation.y = 0.4;
    } else {
      this.lander.rotation.x = slope * 0.25;
      this.lander.rotation.y = Math.sin(t * 0.15) * 0.02;
    }

    this.engineEffects.update(snapshot, t, x, surfaceY);

    this.cameraController.update(telemetry, t, this.landerWorld, this.padWorld, METERS_TO_SCENE);

    this.terrain.rotation.z = -slope * 0.12;
    this.farRim.rotation.z = -slope * 0.05;
    this.targetMarker.position.y = surfaceY;
    this.targetMarker.rotation.z = -slope;
    if (this.landingBeacon) {
      const pulse = 0.45 + Math.sin(t * 3.2) * 0.35;
      (this.landingBeacon.material as THREE.MeshBasicMaterial).opacity = pulse;
      this.landingBeacon.scale.setScalar(1 + Math.sin(t * 2.4) * 0.08);
    }

    this.starsNear.rotation.y = t * 0.0035;
    this.starsFar.rotation.y = t * 0.0012;
    this.milkyWay.rotation.z = t * 0.0008;
    this.earth.rotation.y = t * 0.02;

    this.renderer.render(this.scene, this.camera);
  }

  private track<T extends { dispose: () => void }>(resource: T): T {
    return this.resources.track(resource);
  }

  private makeStars(
    count: number,
    rMin: number,
    rMax: number,
    size: number,
    color: number,
  ): THREE.Points {
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    const base = new THREE.Color(color);
    for (let i = 0; i < count; i++) {
      const r = rMin + Math.random() * (rMax - rMin);
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(THREE.MathUtils.clamp(2 * Math.random() - 1, -1, 1));
      positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      positions[i * 3 + 1] = r * Math.cos(phi);
      positions[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);
      const tint = 0.75 + Math.random() * 0.35;
      colors[i * 3] = base.r * tint;
      colors[i * 3 + 1] = base.g * (0.9 + Math.random() * 0.15);
      colors[i * 3 + 2] = base.b;
    }
    const geo = this.track(new THREE.BufferGeometry());
    geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    return new THREE.Points(
      geo,
      this.track(
        new THREE.PointsMaterial({
          size,
          sizeAttenuation: true,
          transparent: true,
          opacity: 0.95,
          vertexColors: true,
          depthWrite: false,
        }),
      ),
    );
  }

  private makeMilkyWay(): THREE.Mesh {
    const geo = new THREE.SphereGeometry(1600, 48, 32);
    const canvas = document.createElement("canvas");
    canvas.width = 512;
    canvas.height = 256;
    const ctx = canvas.getContext("2d");
    if (ctx) {
      const g = ctx.createLinearGradient(0, 0, 0, 256);
      g.addColorStop(0, "rgba(0,0,0,0)");
      g.addColorStop(0.42, "rgba(120,140,180,0.05)");
      g.addColorStop(0.5, "rgba(210,200,180,0.18)");
      g.addColorStop(0.58, "rgba(120,140,180,0.05)");
      g.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, 512, 256);
      for (let i = 0; i < 600; i++) {
        const x = Math.random() * 512;
        const y = 90 + Math.random() * 76;
        ctx.fillStyle = `rgba(230,235,255,${0.05 + Math.random() * 0.2})`;
        ctx.fillRect(x, y, 1.2, 1.2);
      }
    }
    const tex = this.track(new THREE.CanvasTexture(canvas));
    tex.colorSpace = THREE.SRGBColorSpace;
    const mat = this.track(
      new THREE.MeshBasicMaterial({
        map: tex,
        side: THREE.BackSide,
        transparent: true,
        opacity: 0.85,
        depthWrite: false,
      }),
    );
    const mesh = new THREE.Mesh(this.track(geo), mat);
    mesh.rotation.z = 0.4;
    return mesh;
  }

  private makeEarth(): THREE.Mesh {
    const canvas = document.createElement("canvas");
    canvas.width = 256;
    canvas.height = 128;
    const ctx = canvas.getContext("2d");
    if (ctx) {
      const g = ctx.createLinearGradient(0, 0, 256, 128);
      g.addColorStop(0, "#1a3a6e");
      g.addColorStop(0.35, "#2f6f4a");
      g.addColorStop(0.55, "#245a8c");
      g.addColorStop(0.75, "#3d7a52");
      g.addColorStop(1, "#1d3f72");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, 256, 128);
      ctx.fillStyle = "rgba(240,245,250,0.55)";
      for (let i = 0; i < 40; i++) {
        ctx.beginPath();
        ctx.ellipse(
          Math.random() * 256,
          Math.random() * 128,
          8 + Math.random() * 18,
          3 + Math.random() * 8,
          Math.random(),
          0,
          Math.PI * 2,
        );
        ctx.fill();
      }
    }
    const tex = this.track(new THREE.CanvasTexture(canvas));
    tex.colorSpace = THREE.SRGBColorSpace;
    const mesh = new THREE.Mesh(
      this.track(new THREE.SphereGeometry(18, 32, 24)),
      this.track(
        new THREE.MeshStandardMaterial({
          map: tex,
          emissive: 0x112244,
          emissiveIntensity: 0.35,
          roughness: 0.85,
          metalness: 0.05,
        }),
      ),
    );
    mesh.position.set(-220, 90, -380);
    return mesh;
  }

  private craterField(): { x: number; z: number; r: number; d: number }[] {
    const out: { x: number; z: number; r: number; d: number }[] = [];
    let seed = 17;
    const rand = () => {
      seed = (seed * 16807) % 2147483647;
      return (seed - 1) / 2147483646;
    };
    for (let i = 0; i < 48; i++) {
      out.push({
        x: (rand() - 0.5) * 520,
        z: (rand() - 0.5) * 520,
        r: 3 + rand() * 22,
        d: 0.4 + rand() * 2.2,
      });
    }
    // Keep pad area relatively clear
    out.push({ x: 18, z: -22, r: 14, d: 1.4 }, { x: -30, z: 26, r: 9, d: 0.9 });
    return out;
  }

  private heightAt(
    px: number,
    pz: number,
    craters: { x: number; z: number; r: number; d: number }[],
  ): number {
    let h =
      Math.sin(px * 0.035) * 2.2 +
      Math.cos(pz * 0.028) * 1.8 +
      Math.sin(px * 0.09 + pz * 0.07) * 0.7 +
      Math.sin(px * 0.015 - pz * 0.02) * 3.5;

    for (const c of craters) {
      const dx = px - c.x;
      const dz = pz - c.z;
      const d = Math.hypot(dx, dz);
      if (d < c.r) {
        const n = d / c.r;
        // Bowl with raised rim
        const bowl = (1 - n * n) * c.d;
        const rim = Math.exp(-Math.pow((n - 0.85) / 0.12, 2)) * c.d * 0.45;
        h += rim - bowl;
      }
    }

    // Flatten landing ellipse near origin
    const pad = Math.hypot(px, pz);
    if (pad < 16) {
      const w = 1 - pad / 16;
      h = h * (1 - w * 0.92) + 0.05 * w;
    }
    return h;
  }

  private makeTerrain(): THREE.Mesh {
    const craters = this.craterField();
    const geo = new THREE.PlaneGeometry(560, 560, 180, 180);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position;
    const colors = new Float32Array(pos.count * 3);
    const rock = new THREE.Color(0x6a6258);
    const dust = new THREE.Color(0x9a8f7d);
    const shade = new THREE.Color(0x4a433c);

    for (let i = 0; i < pos.count; i++) {
      const px = pos.getX(i);
      const pz = pos.getZ(i);
      const h = this.heightAt(px, pz, craters);
      pos.setY(i, h);
      const t = THREE.MathUtils.clamp((h + 2) / 8, 0, 1);
      const c = dust.clone().lerp(rock, t * 0.7).lerp(shade, Math.max(0, -h) * 0.08);
      // Subtle mottling
      const m = 0.92 + ((Math.sin(px * 0.4) + Math.cos(pz * 0.35)) * 0.04);
      colors[i * 3] = c.r * m;
      colors[i * 3 + 1] = c.g * m;
      colors[i * 3 + 2] = c.b * m;
    }
    pos.needsUpdate = true;
    geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    geo.computeVertexNormals();

    const mat = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.97,
      metalness: 0.02,
      flatShading: false,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.receiveShadow = true;
    mesh.castShadow = false;
    return mesh;
  }

  private makeFarRim(): THREE.Mesh {
    const geo = new THREE.CylinderGeometry(420, 460, 40, 64, 1, true);
    const mat = new THREE.MeshStandardMaterial({
      color: 0x4e4740,
      roughness: 1,
      metalness: 0,
      side: THREE.BackSide,
      flatShading: true,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.y = -8;
    return mesh;
  }

}
