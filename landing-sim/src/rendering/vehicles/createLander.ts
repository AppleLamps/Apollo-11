import * as THREE from "three";

export function createLander(): THREE.Group {
  const group = new THREE.Group();
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

  const ascent = new THREE.Mesh(new THREE.BoxGeometry(1.15, 1.05, 1.15), body);
  ascent.position.y = 1.15;
  group.add(ascent);
  const hatch = new THREE.Mesh(new THREE.CircleGeometry(0.22, 20), graphite);
  hatch.position.set(0, 1.15, 0.58);
  group.add(hatch);
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
  group.add(window);

  const antenna = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.9, 8), body);
  antenna.position.set(-0.35, 1.95, -0.2);
  group.add(antenna);
  const dish = new THREE.Mesh(new THREE.SphereGeometry(0.18, 12, 8, 0, Math.PI), foil);
  dish.position.set(-0.35, 2.35, -0.2);
  dish.rotation.x = Math.PI;
  group.add(dish);

  const descent = new THREE.Mesh(new THREE.CylinderGeometry(1.15, 1.35, 0.85, 8), graphite);
  descent.position.y = 0.35;
  group.add(descent);

  for (let i = 0; i < 8; i++) {
    const angle = (i / 8) * Math.PI * 2;
    const panel = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.7, 0.04), foil);
    panel.position.set(Math.cos(angle) * 1.15, 0.35, Math.sin(angle) * 1.15);
    panel.rotation.y = -angle + Math.PI / 2;
    group.add(panel);
  }

  const band = new THREE.Mesh(new THREE.CylinderGeometry(1.16, 1.16, 0.08, 8), stripe);
  band.position.y = 0.55;
  group.add(band);
  const nozzle = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.55, 0.7, 16), foil);
  nozzle.position.y = -0.35;
  group.add(nozzle);
  const nozzleLip = new THREE.Mesh(new THREE.TorusGeometry(0.55, 0.04, 8, 24), body);
  nozzleLip.rotation.x = Math.PI / 2;
  nozzleLip.position.y = -0.7;
  group.add(nozzleLip);

  for (let i = 0; i < 4; i++) {
    const angle = (i / 4) * Math.PI * 2 + Math.PI / 4;
    const rcs = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.18, 0.22), graphite);
    rcs.position.set(Math.cos(angle) * 0.85, 1.35, Math.sin(angle) * 0.85);
    group.add(rcs);
  }

  for (let i = 0; i < 4; i++) {
    const angle = (i * Math.PI) / 2 + Math.PI / 4;
    const leg = new THREE.Group();
    leg.position.set(Math.cos(angle) * 0.95, 0.2, Math.sin(angle) * 0.95);
    leg.rotation.y = -angle;

    const primary = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.55, 8), body);
    primary.position.set(0.55, -0.55, 0);
    primary.rotation.z = 0.55;
    leg.add(primary);
    const strut = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.95, 6), body);
    strut.position.set(0.25, -0.15, 0.2);
    strut.rotation.z = 0.35;
    strut.rotation.x = -0.4;
    leg.add(strut);
    const pad = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.32, 0.08, 14), foil);
    pad.position.set(1.05, -1.15, 0);
    pad.receiveShadow = true;
    leg.add(pad);
    const probe = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.45, 6), body);
    probe.position.set(1.05, -1.4, 0);
    leg.add(probe);
    group.add(leg);
  }

  group.traverse((object) => {
    if (object instanceof THREE.Mesh) object.castShadow = true;
  });
  return group;
}
