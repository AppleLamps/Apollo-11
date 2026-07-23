import * as THREE from "three";

export function createLandingSite(): THREE.Group {
  const group = new THREE.Group();
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
  group.add(ring);

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
  group.add(cross);
  const secondCross = cross.clone();
  secondCross.rotation.z = Math.PI / 2;
  group.add(secondCross);

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
  group.add(beacon);
  return group;
}
