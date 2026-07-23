import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { CameraController } from "../rendering/CameraController";
import { EngineEffects } from "../rendering/effects/EngineEffects";
import { createLandingSite } from "../rendering/environment/createLandingSite";
import { setupLighting } from "../rendering/environment/setupLighting";
import {
  getInitialGraphicsQuality,
  GRAPHICS_PROFILES,
  persistGraphicsQuality,
  type GraphicsQuality,
} from "../rendering/GraphicsQuality";
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
  private earth: THREE.Group;
  private sun: THREE.Group;
  private terrain: THREE.Mesh;
  private farRim: THREE.Mesh;
  private targetMarker: THREE.Group;
  private landingBeacon: THREE.Mesh | null;
  private sunLight: THREE.DirectionalLight;
  private composer: EffectComposer | null = null;
  private quality: GraphicsQuality;
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
    this.quality = getInitialGraphicsQuality();
    const profile = GRAPHICS_PROFILES[this.quality];
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: false,
      powerPreference: "high-performance",
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, profile.pixelRatioCap));
    this.renderer.setSize(canvas.clientWidth, canvas.clientHeight, false);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.14;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.setClearColor(0x020308, 1);

    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.Fog(0x030408, 260, 980);

    this.camera = new THREE.PerspectiveCamera(
      52,
      canvas.clientWidth / Math.max(canvas.clientHeight, 1),
      0.2,
      8000,
    );

    this.cameraController = new CameraController(this.camera, canvas);

    this.sunLight = setupLighting(this.scene, profile.shadowMapSize);
    this.starsFar = this.makeStars(5200, 900, 2400, 0.72, 0xaebbd0);
    this.starsNear = this.makeStars(1200, 380, 980, 1.55, 0xf4f7ff);
    this.scene.add(this.starsFar, this.starsNear);
    this.milkyWay = this.makeMilkyWay();
    this.scene.add(this.milkyWay);
    this.earth = this.makeEarth();
    this.scene.add(this.earth);
    this.sun = this.makeSun();
    this.scene.add(this.sun);

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
    this.engineEffects.setQuality(this.quality);
    this.scene.add(this.engineEffects.dust);
    this.resources.trackObject(this.scene);

    window.addEventListener("resize", this.onResize);
    canvas.addEventListener("webglcontextlost", this.onContextLost, false);
    canvas.addEventListener("webglcontextrestored", this.onContextRestored, false);
    this.configureComposer(profile.bloom);
    this.resize();
  }

  setCameraMode(mode: string): boolean {
    return this.cameraController.setMode(mode, this.landerWorld);
  }

  getCameraMode() {
    return this.cameraController.getMode();
  }

  getGraphicsQuality(): GraphicsQuality {
    return this.quality;
  }

  setGraphicsQuality(quality: GraphicsQuality): void {
    if (quality === this.quality) return;
    this.quality = quality;
    const profile = GRAPHICS_PROFILES[quality];
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, profile.pixelRatioCap));
    this.sunLight.shadow.mapSize.set(profile.shadowMapSize, profile.shadowMapSize);
    this.sunLight.shadow.map?.dispose();
    this.sunLight.shadow.map = null;
    this.engineEffects.setQuality(quality);
    persistGraphicsQuality(quality);
    this.configureComposer(profile.bloom);
    this.resize(true);
  }

  dispose(): void {
    window.removeEventListener("resize", this.onResize);
    this.renderer.domElement.removeEventListener("webglcontextlost", this.onContextLost);
    this.renderer.domElement.removeEventListener("webglcontextrestored", this.onContextRestored);
    this.cameraController.dispose();
    this.composer?.dispose();
    this.resources.dispose();
    this.renderer.dispose();
  }

  resize(force = false): void {
    const canvas = this.renderer.domElement;
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    if (force || canvas.width !== width || canvas.height !== height) {
      this.renderer.setSize(width, height, false);
      this.composer?.setSize(width, height);
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
    this.sun.rotation.z = -t * 0.002;

    if (this.composer) {
      this.composer.render();
    } else {
      this.renderer.render(this.scene, this.camera);
    }
  }

  private configureComposer(enabled: boolean): void {
    this.composer?.dispose();
    this.composer = null;
    if (!enabled) return;

    const composer = new EffectComposer(this.renderer);
    composer.setPixelRatio(Math.min(window.devicePixelRatio, GRAPHICS_PROFILES[this.quality].pixelRatioCap));
    composer.addPass(new RenderPass(this.scene, this.camera));
    composer.addPass(
      new UnrealBloomPass(
        new THREE.Vector2(
          this.renderer.domElement.clientWidth,
          this.renderer.domElement.clientHeight,
        ),
        0.58,
        0.32,
        0.86,
      ),
    );
    this.composer = composer;
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
            fog: false,
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

  private makeEarth(): THREE.Group {
    const canvas = document.createElement("canvas");
    canvas.width = 256;
    canvas.height = 128;
    const ctx = canvas.getContext("2d");
    if (ctx) {
      const g = ctx.createLinearGradient(0, 0, 256, 128);
      g.addColorStop(0, "#102d61");
      g.addColorStop(0.48, "#286ba2");
      g.addColorStop(1, "#0e2a59");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, 256, 128);
      let seed = 91;
      const rand = () => {
        seed = (seed * 16807) % 2147483647;
        return (seed - 1) / 2147483646;
      };
      ctx.fillStyle = "#4d7650";
      for (let i = 0; i < 24; i++) {
        ctx.beginPath();
        ctx.ellipse(
          rand() * 256,
          20 + rand() * 88,
          7 + rand() * 22,
          4 + rand() * 12,
          rand(),
          0,
          Math.PI * 2,
        );
        ctx.fill();
      }
      ctx.strokeStyle = "rgba(245,250,255,0.42)";
      ctx.lineWidth = 2;
      for (let i = 0; i < 32; i++) {
        ctx.beginPath();
        const y = rand() * 128;
        ctx.moveTo(rand() * 256, y);
        ctx.bezierCurveTo(rand() * 256, y - 8, rand() * 256, y + 8, rand() * 256, y);
        ctx.stroke();
      }
    }
    const tex = this.track(new THREE.CanvasTexture(canvas));
    tex.colorSpace = THREE.SRGBColorSpace;
    const group = new THREE.Group();
    const mesh = new THREE.Mesh(
      this.track(new THREE.SphereGeometry(18, 32, 24)),
      this.track(
        new THREE.MeshStandardMaterial({
          map: tex,
          emissive: 0x07172d,
          emissiveIntensity: 0.22,
          roughness: 0.85,
          metalness: 0.05,
        }),
      ),
    );
    group.add(mesh);
    const atmosphere = new THREE.Mesh(
      this.track(new THREE.SphereGeometry(18.8, 32, 24)),
      this.track(
        new THREE.MeshBasicMaterial({
          color: 0x4b9eff,
          transparent: true,
          opacity: 0.16,
          blending: THREE.AdditiveBlending,
          side: THREE.BackSide,
          depthWrite: false,
          fog: false,
        }),
      ),
    );
    group.add(atmosphere);
    group.position.set(-220, 90, -380);
    return group;
  }

  private makeSun(): THREE.Group {
    const group = new THREE.Group();
    group.position.set(-820, 590, 430);
    const texture = this.makeRadialTexture([
      [0, "rgba(255,255,244,1)"],
      [0.16, "rgba(255,239,178,1)"],
      [0.42, "rgba(255,173,72,0.32)"],
      [1, "rgba(255,126,42,0)"],
    ]);
    const glow = new THREE.Sprite(
      this.track(
        new THREE.SpriteMaterial({
          map: texture,
          color: 0xffffff,
          transparent: true,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
          depthTest: false,
          fog: false,
        }),
      ),
    );
    glow.scale.set(145, 145, 1);
    group.add(glow);
    const core = new THREE.Sprite(
      this.track(
        new THREE.SpriteMaterial({
          map: texture,
          color: 0xfff5cf,
          transparent: true,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
          depthTest: false,
          fog: false,
        }),
      ),
    );
    core.scale.set(42, 42, 1);
    group.add(core);
    return group;
  }

  private makeRadialTexture(stops: Array<[number, string]>): THREE.CanvasTexture {
    const canvas = document.createElement("canvas");
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext("2d");
    if (ctx) {
      const gradient = ctx.createRadialGradient(128, 128, 0, 128, 128, 128);
      for (const [offset, color] of stops) gradient.addColorStop(offset, color);
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, 256, 256);
    }
    const texture = this.track(new THREE.CanvasTexture(canvas));
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
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
    const rock = new THREE.Color(0x6d6b67);
    const dust = new THREE.Color(0x99958d);
    const shade = new THREE.Color(0x3b3a39);

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

    const detail = this.makeLunarDetailTexture();
    const mat = new THREE.MeshStandardMaterial({
      vertexColors: true,
      map: detail,
      bumpMap: detail,
      bumpScale: 0.32,
      roughness: 0.92,
      metalness: 0,
      flatShading: false,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.receiveShadow = true;
    mesh.castShadow = false;
    return mesh;
  }

  private makeLunarDetailTexture(): THREE.CanvasTexture {
    const canvas = document.createElement("canvas");
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext("2d");
    if (ctx) {
      const image = ctx.createImageData(512, 512);
      let seed = 1337;
      for (let i = 0; i < image.data.length; i += 4) {
        seed = (seed * 16807) % 2147483647;
        const fine = (seed / 2147483647 - 0.5) * 16;
        const x = (i / 4) % 512;
        const y = Math.floor(i / 4 / 512);
        const broad =
          Math.sin(x * 0.021 + Math.cos(y * 0.013)) * 8 +
          Math.cos(y * 0.017 + Math.sin(x * 0.009)) * 7 +
          Math.sin((x + y) * 0.006) * 5;
        const value = THREE.MathUtils.clamp(164 + fine + broad, 118, 204);
        image.data[i] = value;
        image.data[i + 1] = value;
        image.data[i + 2] = value * 0.98;
        image.data[i + 3] = 255;
      }
      ctx.putImageData(image, 0, 0);
    }
    const texture = this.track(new THREE.CanvasTexture(canvas));
    // Map once across the field. Repeating procedural canvas noise introduces
    // visible seams at grazing lunar light angles.
    texture.wrapS = THREE.ClampToEdgeWrapping;
    texture.wrapT = THREE.ClampToEdgeWrapping;
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = Math.min(8, this.renderer.capabilities.getMaxAnisotropy());
    return texture;
  }

  private makeFarRim(): THREE.Mesh {
    const geo = new THREE.CylinderGeometry(420, 470, 58, 96, 6, true);
    const positions = geo.attributes.position;
    for (let i = 0; i < positions.count; i++) {
      const x = positions.getX(i);
      const z = positions.getZ(i);
      const angle = Math.atan2(z, x);
      const ridge =
        Math.sin(angle * 5.0) * 8 +
        Math.sin(angle * 11.0 + 1.4) * 4 +
        Math.sin(angle * 23.0) * 1.8;
      const vertical = positions.getY(i);
      const topWeight = THREE.MathUtils.smoothstep(vertical, -10, 29);
      positions.setY(i, vertical + ridge * topWeight);
    }
    positions.needsUpdate = true;
    geo.computeVertexNormals();
    const mat = new THREE.MeshStandardMaterial({
      color: 0x393632,
      roughness: 1,
      metalness: 0,
      side: THREE.BackSide,
      flatShading: true,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.y = -14;
    mesh.receiveShadow = true;
    return mesh;
  }

}
