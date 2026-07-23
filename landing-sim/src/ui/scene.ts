import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import type { Telemetry } from "../sim/types";
import type { LandingWorld } from "../sim/world";
import type { CameraMode } from "./cameraRig";

const METERS_TO_SCENE = 0.01;

export class LandingScene {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene: THREE.Scene;
  readonly camera: THREE.PerspectiveCamera;
  private controls: OrbitControls;
  private lander: THREE.Group;
  private plumeInner: THREE.Mesh;
  private plumeOuter: THREE.Mesh;
  private dust: THREE.Points;
  private starsNear: THREE.Points;
  private starsFar: THREE.Points;
  private milkyWay: THREE.Mesh;
  private earth: THREE.Mesh;
  private terrain: THREE.Mesh;
  private farRim: THREE.Mesh;
  private targetMarker: THREE.Group;
  private landingBeacon: THREE.Mesh;
  private clock = new THREE.Clock();
  private cameraMode: CameraMode = "chase";
  private readonly camTarget = new THREE.Vector3();
  private readonly lookAtTarget = new THREE.Vector3();
  private readonly landerWorld = new THREE.Vector3();
  private readonly padWorld = new THREE.Vector3(0, 0.2, 0);
  private readonly onResize = (): void => {
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

    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.maxPolarAngle = Math.PI * 0.48;
    this.controls.minDistance = 6;
    this.controls.maxDistance = 220;
    this.controls.enabled = false;
    this.controls.enablePan = false;

    this.setupLights();
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

    this.targetMarker = this.makeLandingSite();
    this.scene.add(this.targetMarker);
    this.landingBeacon = this.targetMarker.getObjectByName("beacon") as THREE.Mesh;

    this.lander = this.makeLander();
    this.scene.add(this.lander);

    const plumeMat = new THREE.MeshBasicMaterial({
      color: 0xffc078,
      transparent: true,
      opacity: 0.55,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    this.plumeInner = new THREE.Mesh(new THREE.ConeGeometry(0.22, 1.6, 18, 1, true), plumeMat);
    this.plumeInner.position.y = -1.35;
    this.plumeInner.rotation.x = Math.PI;
    this.lander.add(this.plumeInner);

    this.plumeOuter = new THREE.Mesh(
      new THREE.ConeGeometry(0.48, 2.6, 20, 1, true),
      plumeMat.clone(),
    );
    (this.plumeOuter.material as THREE.MeshBasicMaterial).color.setHex(0xff8a4a);
    (this.plumeOuter.material as THREE.MeshBasicMaterial).opacity = 0.28;
    this.plumeOuter.position.y = -1.7;
    this.plumeOuter.rotation.x = Math.PI;
    this.lander.add(this.plumeOuter);

    this.dust = this.makeDust();
    this.scene.add(this.dust);

    window.addEventListener("resize", this.onResize);
    this.resize();
  }

  setCameraMode(mode: CameraMode): void {
    this.cameraMode = mode;
    this.controls.enabled = mode === "orbit";
    if (mode === "orbit") {
      this.controls.target.copy(this.landerWorld);
      // Seed a useful orbit distance if coming from another mode
      const offset = this.camera.position.clone().sub(this.landerWorld);
      if (offset.length() < 4) {
        this.camera.position.set(
          this.landerWorld.x - 28,
          this.landerWorld.y + 16,
          this.landerWorld.z + 34,
        );
      }
      this.controls.update();
    }
  }

  getCameraMode(): CameraMode {
    return this.cameraMode;
  }

  dispose(): void {
    window.removeEventListener("resize", this.onResize);
    this.controls.dispose();
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

  sync(world: LandingWorld, telemetry: Telemetry): void {
    const t = this.clock.getElapsedTime();
    const x = world.state.x * METERS_TO_SCENE;
    const y = world.state.y * METERS_TO_SCENE;
    const surfaceY = world.state.surfaceHeightM * METERS_TO_SCENE;
    const slope = world.state.surfaceSlopeRad;

    this.landerWorld.set(x, y, 0);
    this.padWorld.set(0, surfaceY + 0.15, 0);

    this.lander.position.copy(this.landerWorld);
    this.lander.rotation.z = -world.state.pitch;
    if (world.state.phase === "CRASHED") {
      this.lander.rotation.x = 0.85;
      this.lander.rotation.z += 0.55;
      this.lander.rotation.y = 0.4;
    } else {
      this.lander.rotation.x = slope * 0.25;
      this.lander.rotation.y = Math.sin(t * 0.15) * 0.02;
    }

    const thrust = telemetry.throttle;
    const plumeOn = thrust > 0.05 && world.state.fuelKg > 0 && world.state.phase !== "LANDED";
    this.plumeInner.visible = plumeOn;
    this.plumeOuter.visible = plumeOn;
    if (plumeOn) {
      const flicker = 0.92 + Math.sin(t * 40) * 0.08;
      this.plumeInner.scale.set(0.7 + thrust * 0.5, (0.8 + thrust * 1.6) * flicker, 0.7 + thrust * 0.5);
      this.plumeOuter.scale.set(0.9 + thrust, (1 + thrust * 1.8) * flicker, 0.9 + thrust);
      (this.plumeInner.material as THREE.MeshBasicMaterial).opacity = 0.3 + thrust * 0.5;
      (this.plumeOuter.material as THREE.MeshBasicMaterial).opacity = 0.12 + thrust * 0.28;
    }

    this.updateCamera(telemetry, t);

    this.terrain.rotation.z = -slope * 0.12;
    this.farRim.rotation.z = -slope * 0.05;
    this.targetMarker.position.y = surfaceY;
    this.targetMarker.rotation.z = -slope;
    if (this.landingBeacon) {
      const pulse = 0.45 + Math.sin(t * 3.2) * 0.35;
      (this.landingBeacon.material as THREE.MeshBasicMaterial).opacity = pulse;
      this.landingBeacon.scale.setScalar(1 + Math.sin(t * 2.4) * 0.08);
    }

    const alt = Math.max(telemetry.altitudeM, 1);
    const dustMat = this.dust.material as THREE.PointsMaterial;
    const near = alt < 110 && thrust > 0.15;
    dustMat.opacity = near ? THREE.MathUtils.clamp((110 - alt) / 110, 0, 0.85) * thrust : 0;
    this.dust.position.set(x, surfaceY + 0.35, 0);
    this.dust.rotation.y = t * 0.55;

    this.starsNear.rotation.y = t * 0.0035;
    this.starsFar.rotation.y = t * 0.0012;
    this.milkyWay.rotation.z = t * 0.0008;
    this.earth.rotation.y = t * 0.02;

    this.renderer.render(this.scene, this.camera);
  }

  private updateCamera(telemetry: Telemetry, t: number): void {
    const x = this.landerWorld.x;
    const y = this.landerWorld.y;
    const alt = Math.max(telemetry.altitudeM, 1);

    if (this.cameraMode === "orbit") {
      this.controls.target.lerp(this.landerWorld, 0.12);
      this.controls.update();
      return;
    }

    if (this.cameraMode === "chase") {
      const camDist = THREE.MathUtils.clamp(16 + alt * METERS_TO_SCENE * 0.5, 18, 130);
      const camHeight = THREE.MathUtils.clamp(9 + alt * METERS_TO_SCENE * 0.22, 10, 62);
      this.camTarget.set(x - camDist * 0.55, y + camHeight * 0.42, camDist * 0.95);
      this.lookAtTarget.set(x, y + 1.2, 0);
    } else if (this.cameraMode === "side") {
      const dist = THREE.MathUtils.clamp(22 + alt * METERS_TO_SCENE * 0.35, 20, 90);
      this.camTarget.set(x, y + dist * 0.18, dist);
      this.lookAtTarget.set(x, y + 0.8, 0);
    } else if (this.cameraMode === "pad") {
      this.camTarget.set(
        Math.sin(t * 0.05) * 4,
        Math.max(2.2, this.padWorld.y + 2.4),
        14 + Math.cos(t * 0.05) * 2,
      );
      this.lookAtTarget.set(x, y + 0.5, 0);
    } else {
      // high
      const dist = THREE.MathUtils.clamp(30 + alt * METERS_TO_SCENE * 0.4, 28, 140);
      this.camTarget.set(x + dist * 0.15, y + dist * 0.85, dist * 0.35);
      this.lookAtTarget.set(x, Math.max(0.5, y - 4), 0);
    }

    const lerp = this.cameraMode === "pad" ? 0.04 : 0.07;
    this.camera.position.lerp(this.camTarget, lerp);
    this.camera.lookAt(this.lookAtTarget);
  }

  private setupLights(): void {
    const hemi = new THREE.HemisphereLight(0xc9d6e6, 0x3d342c, 0.42);
    this.scene.add(hemi);

    const sun = new THREE.DirectionalLight(0xffe6c8, 2.1);
    sun.position.set(-120, 160, 70);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.near = 10;
    sun.shadow.camera.far = 400;
    sun.shadow.camera.left = -80;
    sun.shadow.camera.right = 80;
    sun.shadow.camera.top = 80;
    sun.shadow.camera.bottom = -80;
    sun.shadow.bias = -0.0002;
    this.scene.add(sun);

    const fill = new THREE.DirectionalLight(0x7f9bb8, 0.35);
    fill.position.set(60, 40, -80);
    this.scene.add(fill);

    const rim = new THREE.DirectionalLight(0xffd09a, 0.45);
    rim.position.set(40, 20, 100);
    this.scene.add(rim);
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
      const phi = Math.acos(2 * Math.random() - 1);
      positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      positions[i * 3 + 1] = r * Math.cos(phi);
      positions[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);
      const tint = 0.75 + Math.random() * 0.35;
      colors[i * 3] = base.r * tint;
      colors[i * 3 + 1] = base.g * (0.9 + Math.random() * 0.15);
      colors[i * 3 + 2] = base.b;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    return new THREE.Points(
      geo,
      new THREE.PointsMaterial({
        size,
        sizeAttenuation: true,
        transparent: true,
        opacity: 0.95,
        vertexColors: true,
        depthWrite: false,
      }),
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
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    const mat = new THREE.MeshBasicMaterial({
      map: tex,
      side: THREE.BackSide,
      transparent: true,
      opacity: 0.85,
      depthWrite: false,
    });
    const mesh = new THREE.Mesh(geo, mat);
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
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    const mesh = new THREE.Mesh(
      new THREE.SphereGeometry(18, 32, 24),
      new THREE.MeshStandardMaterial({
        map: tex,
        emissive: 0x112244,
        emissiveIntensity: 0.35,
        roughness: 0.85,
        metalness: 0.05,
      }),
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

  private makeLandingSite(): THREE.Group {
    const g = new THREE.Group();
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(2.2, 2.55, 64),
      new THREE.MeshBasicMaterial({
        color: 0xd0a35a,
        transparent: true,
        opacity: 0.7,
        side: THREE.DoubleSide,
      }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.08;
    g.add(ring);

    const cross = new THREE.Mesh(
      new THREE.PlaneGeometry(0.12, 3.2),
      new THREE.MeshBasicMaterial({
        color: 0xe7e0d4,
        transparent: true,
        opacity: 0.35,
        side: THREE.DoubleSide,
      }),
    );
    cross.rotation.x = -Math.PI / 2;
    cross.position.y = 0.09;
    g.add(cross);
    const cross2 = cross.clone();
    cross2.rotation.z = Math.PI / 2;
    g.add(cross2);

    const beacon = new THREE.Mesh(
      new THREE.CircleGeometry(0.55, 32),
      new THREE.MeshBasicMaterial({
        color: 0x7eb6c9,
        transparent: true,
        opacity: 0.5,
        side: THREE.DoubleSide,
      }),
    );
    beacon.name = "beacon";
    beacon.rotation.x = -Math.PI / 2;
    beacon.position.y = 0.1;
    g.add(beacon);
    return g;
  }

  private makeLander(): THREE.Group {
    const g = new THREE.Group();
    const body = new THREE.MeshStandardMaterial({
      color: 0xe4ddd0,
      metalness: 0.4,
      roughness: 0.4,
    });
    const graphite = new THREE.MeshStandardMaterial({
      color: 0x2c333a,
      metalness: 0.55,
      roughness: 0.45,
    });
    const foil = new THREE.MeshStandardMaterial({
      color: 0xc49a4a,
      metalness: 0.85,
      roughness: 0.28,
      emissive: 0x3a2a10,
      emissiveIntensity: 0.12,
    });
    const stripe = new THREE.MeshStandardMaterial({
      color: 0x7a2e2e,
      metalness: 0.2,
      roughness: 0.6,
    });

    // Ascent stage
    const ascent = new THREE.Mesh(new THREE.BoxGeometry(1.15, 1.05, 1.15), body);
    ascent.position.y = 1.15;
    ascent.castShadow = true;
    g.add(ascent);
    const hatch = new THREE.Mesh(new THREE.CircleGeometry(0.22, 20), graphite);
    hatch.position.set(0, 1.15, 0.58);
    g.add(hatch);
    const window = new THREE.Mesh(
      new THREE.PlaneGeometry(0.28, 0.2),
      new THREE.MeshStandardMaterial({
        color: 0x88c4e0,
        emissive: 0x224455,
        emissiveIntensity: 0.4,
        metalness: 0.2,
        roughness: 0.2,
      }),
    );
    window.position.set(0.35, 1.35, 0.581);
    g.add(window);

    // Antenna
    const antenna = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.9, 8), body);
    antenna.position.set(-0.35, 1.95, -0.2);
    g.add(antenna);
    const dish = new THREE.Mesh(new THREE.SphereGeometry(0.18, 12, 8, 0, Math.PI), foil);
    dish.position.set(-0.35, 2.35, -0.2);
    dish.rotation.x = Math.PI;
    g.add(dish);

    // Descent stage octagon-ish
    const descent = new THREE.Mesh(new THREE.CylinderGeometry(1.15, 1.35, 0.85, 8), graphite);
    descent.position.y = 0.35;
    descent.castShadow = true;
    g.add(descent);

    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const panel = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.7, 0.04), foil);
      panel.position.set(Math.cos(a) * 1.15, 0.35, Math.sin(a) * 1.15);
      panel.rotation.y = -a + Math.PI / 2;
      g.add(panel);
    }

    const band = new THREE.Mesh(new THREE.CylinderGeometry(1.16, 1.16, 0.08, 8), stripe);
    band.position.y = 0.55;
    g.add(band);

    const nozzle = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.55, 0.7, 16), foil);
    nozzle.position.y = -0.35;
    g.add(nozzle);
    const nozzleLip = new THREE.Mesh(new THREE.TorusGeometry(0.55, 0.04, 8, 24), body);
    nozzleLip.rotation.x = Math.PI / 2;
    nozzleLip.position.y = -0.7;
    g.add(nozzleLip);

    // RCS quads
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
      const rcs = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.18, 0.22), graphite);
      rcs.position.set(Math.cos(a) * 0.85, 1.35, Math.sin(a) * 0.85);
      g.add(rcs);
    }

    // Landing legs
    for (let i = 0; i < 4; i++) {
      const angle = (i * Math.PI) / 2 + Math.PI / 4;
      const legRoot = new THREE.Group();
      legRoot.position.set(Math.cos(angle) * 0.95, 0.2, Math.sin(angle) * 0.95);
      legRoot.rotation.y = -angle;

      const primary = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.55, 8), body);
      primary.position.set(0.55, -0.55, 0);
      primary.rotation.z = 0.55;
      primary.castShadow = true;
      legRoot.add(primary);

      const strut = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.95, 6), body);
      strut.position.set(0.25, -0.15, 0.2);
      strut.rotation.z = 0.35;
      strut.rotation.x = -0.4;
      legRoot.add(strut);

      const pad = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.32, 0.08, 14), foil);
      pad.position.set(1.05, -1.15, 0);
      pad.castShadow = true;
      pad.receiveShadow = true;
      legRoot.add(pad);

      const probe = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.45, 6), body);
      probe.position.set(1.05, -1.4, 0);
      legRoot.add(probe);

      g.add(legRoot);
    }

    g.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
        obj.castShadow = true;
      }
    });
    return g;
  }

  private makeDust(): THREE.Points {
    const count = 700;
    const positions = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = Math.random() * 12;
      positions[i * 3] = Math.cos(a) * r;
      positions[i * 3 + 1] = Math.random() * 2.2;
      positions[i * 3 + 2] = Math.sin(a) * r;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    return new THREE.Points(
      geo,
      new THREE.PointsMaterial({
        color: 0xd2c3a8,
        size: 0.42,
        transparent: true,
        opacity: 0,
        depthWrite: false,
      }),
    );
  }
}
