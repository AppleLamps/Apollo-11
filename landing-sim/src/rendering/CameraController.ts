import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import type { Telemetry } from "../sim/types";
import { isCameraMode, saneCameraScalar, type CameraMode } from "../ui/cameraRig";

export class CameraController {
  private readonly controls: OrbitControls;
  private mode: CameraMode = "chase";
  private readonly cameraTarget = new THREE.Vector3();
  private readonly lookAtTarget = new THREE.Vector3();
  private readonly scratchOffset = new THREE.Vector3();

  constructor(
    private readonly camera: THREE.PerspectiveCamera,
    canvas: HTMLCanvasElement,
  ) {
    this.controls = new OrbitControls(camera, canvas);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.maxPolarAngle = Math.PI * 0.48;
    this.controls.minDistance = 6;
    this.controls.maxDistance = 220;
    this.controls.enabled = false;
    this.controls.enablePan = false;
    this.controls.enableZoom = true;
  }

  setMode(mode: string, landerWorld: THREE.Vector3): boolean {
    if (!isCameraMode(mode)) return false;
    const previous = this.mode;
    this.mode = mode;
    this.controls.enabled = mode === "orbit";

    if (mode !== "orbit" && previous === "orbit") {
      this.controls.enabled = false;
    }

    if (mode === "orbit") {
      this.controls.target.copy(landerWorld);
      this.scratchOffset.copy(this.camera.position).sub(landerWorld);
      if (this.scratchOffset.lengthSq() < 16) {
        this.camera.position.set(
          landerWorld.x - 28,
          landerWorld.y + 16,
          landerWorld.z + 34,
        );
      }
      this.controls.update();
    }
    return true;
  }

  getMode(): CameraMode {
    return this.mode;
  }

  update(
    telemetry: Telemetry,
    elapsed: number,
    landerWorld: THREE.Vector3,
    padWorld: THREE.Vector3,
    metersToScene: number,
  ): void {
    const x = landerWorld.x;
    const y = landerWorld.y;
    const altitude = Math.max(saneCameraScalar(telemetry.altitudeM, 100), 1);

    if (this.mode === "orbit") {
      if (!Number.isFinite(x) || !Number.isFinite(y)) return;
      this.controls.target.lerp(landerWorld, 0.12);
      this.controls.update();
      return;
    }

    if (this.mode === "chase") {
      const distance = THREE.MathUtils.clamp(16 + altitude * metersToScene * 0.5, 18, 130);
      const height = THREE.MathUtils.clamp(9 + altitude * metersToScene * 0.22, 10, 62);
      this.cameraTarget.set(x - distance * 0.55, y + height * 0.42, distance * 0.95);
      this.lookAtTarget.set(x, y + 1.2, 0);
    } else if (this.mode === "side") {
      const distance = THREE.MathUtils.clamp(22 + altitude * metersToScene * 0.35, 20, 90);
      this.cameraTarget.set(x, y + distance * 0.18, distance);
      this.lookAtTarget.set(x, y + 0.8, 0);
    } else if (this.mode === "pad") {
      this.cameraTarget.set(
        Math.sin(elapsed * 0.05) * 4,
        Math.max(2.2, padWorld.y + 2.4),
        14 + Math.cos(elapsed * 0.05) * 2,
      );
      this.lookAtTarget.set(x, y + 0.5, 0);
    } else {
      const distance = THREE.MathUtils.clamp(30 + altitude * metersToScene * 0.4, 28, 140);
      this.cameraTarget.set(x + distance * 0.15, y + distance * 0.85, distance * 0.35);
      this.lookAtTarget.set(x, Math.max(0.5, y - 4), 0);
    }

    if (![this.cameraTarget.x, this.cameraTarget.y, this.cameraTarget.z].every(Number.isFinite)) {
      return;
    }

    this.camera.position.lerp(this.cameraTarget, this.mode === "pad" ? 0.04 : 0.07);
    this.camera.lookAt(this.lookAtTarget);
  }

  dispose(): void {
    this.controls.dispose();
  }
}
