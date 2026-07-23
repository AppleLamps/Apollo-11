export interface Disposable {
  dispose(): void;
}

/** Owns Three.js GPU resources and releases them as one lifecycle unit. */
export class ResourceTracker {
  private readonly resources = new Set<Disposable>();

  track<T extends Disposable>(resource: T): T {
    this.resources.add(resource);
    return resource;
  }

  trackObject(root: THREE.Object3D): void {
    root.traverse((object) => {
      if (!(object instanceof THREE.Mesh || object instanceof THREE.Points)) return;
      this.track(object.geometry);
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      for (const material of materials) this.track(material);
    });
  }

  dispose(): void {
    for (const resource of this.resources) {
      resource.dispose();
    }
    this.resources.clear();
  }
}
import * as THREE from "three";
