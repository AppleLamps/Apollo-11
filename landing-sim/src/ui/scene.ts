import * as THREE from "three";
import type { Telemetry } from "../sim/types";
import type { LandingWorld } from "../sim/world";

const METERS_TO_SCENE = 0.01;

export class LandingScene {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene: THREE.Scene;
  readonly camera: THREE.PerspectiveCamera;
  private lander: THREE.Group;
  private plume: THREE.Mesh;
  private dust: THREE.Points;
  private stars: THREE.Points;
  private terrain: THREE.Mesh;
  private targetMarker: THREE.Mesh;
  private clock = new THREE.Clock();

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: false,
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(canvas.clientWidth, canvas.clientHeight, false);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.setClearColor(0x07090d, 1);

    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.FogExp2(0x0b0e14, 0.0022);

    this.camera = new THREE.PerspectiveCamera(
      55,
      canvas.clientWidth / Math.max(canvas.clientHeight, 1),
      0.1,
      4000,
    );

    const hemi = new THREE.HemisphereLight(0xb9c7d6, 0x3a2a1c, 0.55);
    this.scene.add(hemi);
    const sun = new THREE.DirectionalLight(0xffe2c2, 1.35);
    sun.position.set(-80, 120, 40);
    this.scene.add(sun);

    this.stars = this.makeStars();
    this.scene.add(this.stars);

    this.terrain = this.makeTerrain();
    this.scene.add(this.terrain);

    this.targetMarker = new THREE.Mesh(
      new THREE.RingGeometry(1.2, 1.5, 48),
      new THREE.MeshBasicMaterial({
        color: 0xc8a25a,
        transparent: true,
        opacity: 0.55,
        side: THREE.DoubleSide,
      }),
    );
    this.targetMarker.rotation.x = -Math.PI / 2;
    this.targetMarker.position.y = 0.05;
    this.scene.add(this.targetMarker);

    this.lander = this.makeLander();
    this.scene.add(this.lander);

    this.plume = new THREE.Mesh(
      new THREE.ConeGeometry(0.35, 2.2, 16, 1, true),
      new THREE.MeshBasicMaterial({
        color: 0xffb068,
        transparent: true,
        opacity: 0.65,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
      }),
    );
    this.plume.position.y = -1.6;
    this.plume.rotation.x = Math.PI;
    this.lander.add(this.plume);

    this.dust = this.makeDust();
    this.scene.add(this.dust);

    window.addEventListener("resize", () => this.resize());
    this.resize();
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
    const slope = world.state.surfaceSlopeRad;

    this.lander.position.set(x, y, 0);
    this.lander.rotation.z = -world.state.pitch;
    if (world.state.phase === "CRASHED") {
      this.lander.rotation.x = 0.7;
      this.lander.rotation.z += 0.5;
    } else {
      this.lander.rotation.x = slope * 0.3;
    }

    const thrust = telemetry.throttle;
    this.plume.visible = thrust > 0.05 && world.state.fuelKg > 0 && world.state.phase !== "LANDED";
    this.plume.scale.set(0.7 + thrust, 0.6 + thrust * 1.8, 0.7 + thrust);
    (this.plume.material as THREE.MeshBasicMaterial).opacity = 0.25 + thrust * 0.55;

    // Camera chase — wide at high altitude, intimate near surface
    const alt = Math.max(telemetry.altitudeM, 1);
    const camDist = THREE.MathUtils.clamp(18 + alt * METERS_TO_SCENE * 0.55, 22, 140);
    const camHeight = THREE.MathUtils.clamp(10 + alt * METERS_TO_SCENE * 0.25, 12, 70);
    const lookY = y + 1.5;
    this.camera.position.lerp(
      new THREE.Vector3(x - camDist * 0.55, y + camHeight * 0.45, camDist),
      0.06,
    );
    this.camera.lookAt(x, lookY, 0);

    this.terrain.rotation.z = -slope * 0.15;
    this.targetMarker.position.y = world.state.surfaceHeightM * METERS_TO_SCENE + 0.05;
    this.targetMarker.scale.setScalar(1 + Math.sin(t * 2) * 0.04);

    // Dust near surface under thrust
    const dustMat = this.dust.material as THREE.PointsMaterial;
    const near = alt < 90 && thrust > 0.2;
    dustMat.opacity = near ? THREE.MathUtils.clamp((90 - alt) / 90, 0, 0.7) * thrust : 0;
    this.dust.position.set(x, world.state.surfaceHeightM * METERS_TO_SCENE + 0.4, 0);
    this.dust.rotation.y = t * 0.4;

    this.stars.rotation.y = t * 0.002;
    this.renderer.render(this.scene, this.camera);
  }

  private makeStars(): THREE.Points {
    const count = 1400;
    const positions = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      const r = 200 + Math.random() * 600;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      positions[i * 3 + 1] = r * Math.cos(phi) + 80;
      positions[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    return new THREE.Points(
      geo,
      new THREE.PointsMaterial({
        color: 0xd9e2ec,
        size: 0.7,
        sizeAttenuation: true,
        transparent: true,
        opacity: 0.85,
      }),
    );
  }

  private makeTerrain(): THREE.Mesh {
    const geo = new THREE.PlaneGeometry(600, 600, 96, 96);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const px = pos.getX(i);
      const pz = pos.getZ(i);
      const h =
        Math.sin(px * 0.05) * 1.4 +
        Math.cos(pz * 0.04) * 1.1 +
        Math.sin(px * 0.12 + pz * 0.08) * 0.45;
      pos.setY(i, h);
    }
    pos.needsUpdate = true;
    geo.computeVertexNormals();

    const mat = new THREE.MeshStandardMaterial({
      color: 0x6d6357,
      roughness: 0.96,
      metalness: 0.02,
      flatShading: true,
    });
    return new THREE.Mesh(geo, mat);
  }

  private makeLander(): THREE.Group {
    const g = new THREE.Group();
    const bodyMat = new THREE.MeshStandardMaterial({
      color: 0xd8d2c5,
      metalness: 0.35,
      roughness: 0.45,
    });
    const accent = new THREE.MeshStandardMaterial({
      color: 0x2f3a44,
      metalness: 0.2,
      roughness: 0.6,
    });
    const gold = new THREE.MeshStandardMaterial({
      color: 0xb0894d,
      metalness: 0.55,
      roughness: 0.35,
    });

    const ascent = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.7, 1.1, 12), bodyMat);
    ascent.position.y = 0.9;
    g.add(ascent);

    const descent = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 1.1, 0.8, 12), accent);
    descent.position.y = 0.15;
    g.add(descent);

    const nozzle = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.45, 0.5, 10), gold);
    nozzle.position.y = -0.5;
    g.add(nozzle);

    for (let i = 0; i < 4; i++) {
      const angle = (i * Math.PI) / 2 + Math.PI / 4;
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.5, 6), bodyMat);
      leg.position.set(Math.cos(angle) * 0.9, -0.5, Math.sin(angle) * 0.9);
      leg.rotation.z = Math.cos(angle) * 0.45;
      leg.rotation.x = -Math.sin(angle) * 0.45;
      g.add(leg);

      const pad = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 0.08, 10), gold);
      pad.position.set(Math.cos(angle) * 1.25, -1.15, Math.sin(angle) * 1.25);
      g.add(pad);
    }

    return g;
  }

  private makeDust(): THREE.Points {
    const count = 400;
    const positions = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = Math.random() * 8;
      positions[i * 3] = Math.cos(a) * r;
      positions[i * 3 + 1] = Math.random() * 1.5;
      positions[i * 3 + 2] = Math.sin(a) * r;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    return new THREE.Points(
      geo,
      new THREE.PointsMaterial({
        color: 0xc4b49a,
        size: 0.35,
        transparent: true,
        opacity: 0,
        depthWrite: false,
      }),
    );
  }
}
