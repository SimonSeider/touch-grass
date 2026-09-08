import * as THREE from 'three';

export type PlantKind = 'daisy' | 'buttercup' | 'purple' | 'clover' | 'seeds';
const TAU = Math.PI * 2;

// This is the main part of the Plant Geometry which uses the Texture Atlas to create the Plants Look.
export function plantGeometry(kind: PlantKind): THREE.BufferGeometry {
  const positions: number[] = [], uvs: number[] = [], colors: number[] = [], flutter: number[] = [], indices: number[] = [];
  function vertex(p: THREE.Vector3, u: number, v: number, cell: number, flex = 0) {
    positions.push(p.x, p.y, p.z); colors.push(1, 1, 1); flutter.push(flex);
    uvs.push((cell % 3 + 0.06 + u * 0.88) / 3, (1 - Math.floor(cell / 3) + 0.06 + v * 0.88) / 2);
  }
  function part(geometry: THREE.BufferGeometry, cell: number, transform: THREE.Matrix4) {
    geometry.applyMatrix4(transform);
    const p = geometry.getAttribute('position'), uv = geometry.getAttribute('uv'), offset = positions.length / 3;
    for (let i = 0; i < p.count; i++) vertex(new THREE.Vector3(p.getX(i), p.getY(i), p.getZ(i)), uv.getX(i), uv.getY(i), cell);
    if (geometry.index) for (const i of geometry.index.array) indices.push(offset + i);
    else for (let i = 0; i < p.count; i++) indices.push(offset + i);
    geometry.dispose();
  }
  function stem(base: THREE.Vector3, tip: THREE.Vector3, radius = 0.009) {
    const direction = tip.clone().sub(base);
    const transform = new THREE.Matrix4().compose(base.clone().add(tip).multiplyScalar(0.5), new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.clone().normalize()), new THREE.Vector3(1, 1, 1));
    part(new THREE.CylinderGeometry(radius * 0.65, radius, direction.length(), 8, 4), 5, transform);
  }
  function seed(center: THREE.Vector3, scale: THREE.Vector3, cell: number) {
    part(new THREE.SphereGeometry(1, 10, 6), cell, new THREE.Matrix4().compose(center, new THREE.Quaternion(), scale));
  }
  function leaf(base: THREE.Vector3, angle: number, length: number, width: number, rise: number, cell: number, round = false) {
    const segments = 6, across = 4;
    // Separate upper and lower curved skins give the leaf a thin physical edge.
    for (const side of [-1, 1]) {
      const offset = positions.length / 3;
      for (let i = 0; i <= segments; i++) for (let j = 0; j <= across; j++) {
        const t = i / segments, s = j / across * 2 - 1;
        const outline = Math.pow(Math.sin(Math.PI * t), round ? 0.55 : 0.8);
        const forward = t * length, lateral = s * width * outline;
        const y = rise * t + Math.sin(Math.PI * t) * width * (0.28 - s * s * 0.45) + side * 0.0015;
        vertex(new THREE.Vector3(base.x + Math.cos(angle) * forward - Math.sin(angle) * lateral, base.y + y, base.z + Math.sin(angle) * forward + Math.cos(angle) * lateral), j / across, t, cell, t * t);
      }
      for (let i = 0; i < segments; i++) for (let j = 0; j < across; j++) {
        const a = offset + i * (across + 1) + j, b = a + 1, c = a + across + 1, d = c + 1;
        if (side > 0) indices.push(a, c, b, b, c, d);
        else indices.push(a, b, c, b, d, c);
      }
    }
  }
  function flower(center: THREE.Vector3, cell: number, phase: number) {
    const petals = cell === 0 ? 11 : 5;
    const length = cell === 0 ? 0.14 : 0.125;
    for (let i = 0; i < petals; i++) {
      const angle = phase + i / petals * TAU;
      const root = center.clone().add(new THREE.Vector3(Math.cos(angle) * 0.018, 0, Math.sin(angle) * 0.018));
      leaf(root, angle, length, cell === 0 ? 0.027 : 0.06, cell === 0 ? -0.018 : 0.05, cell, cell !== 0);
    }
    seed(center.clone().add(new THREE.Vector3(0, 0.012, 0)), new THREE.Vector3(0.045, 0.025, 0.045), 1);
  }
  if (kind === 'clover') {
    for (let j = 0; j < 4; j++) {
      const angle = j * 2.4, root = new THREE.Vector3(Math.cos(angle) * 0.12, 0, Math.sin(angle) * 0.12);
      const top = root.clone().add(new THREE.Vector3(Math.cos(angle) * 0.07, 0.28 + j * 0.025, Math.sin(angle) * 0.07));
      stem(root, top, 0.004);
      for (let k = 0; k < 3; k++) leaf(top, angle + k / 3 * TAU, 0.14, 0.067, 0.018, 3, true);
    }
  } else if (kind === 'seeds') {
    for (let j = 0; j < 3; j++) {
      const root = new THREE.Vector3((j - 1) * 0.08, 0, Math.sin(j * 2) * 0.07);
      const h = 1.14 + j * 0.12, top = root.clone().add(new THREE.Vector3(0.05, h, 0));
      stem(root, top, 0.005);
      leaf(root.clone().lerp(top, 0.3), j * 2.4, 0.31, 0.014, 0.18, 3);
      for (let k = 0; k < 7; k++) {
        const angle = k * 2.4, base = root.clone().lerp(top, 0.76 + k * 0.033);
        const tip = base.clone().add(new THREE.Vector3(Math.cos(angle) * 0.075, 0.04, Math.sin(angle) * 0.075));
        stem(base, tip, 0.0025); seed(tip, new THREE.Vector3(0.012, 0.035, 0.012), 4);
      }
    }
  } else {
    const cell = kind === 'daisy' ? 0 : kind === 'buttercup' ? 1 : 2;
    const h = kind === 'purple' ? 0.92 : 0.84;
    const top = new THREE.Vector3(0.06, h, 0.03);
    stem(new THREE.Vector3(), top);
    for (let j = 0; j < 3; j++) leaf(top.clone().multiplyScalar(0.24 + j * 0.19), j * 2.4, 0.2, 0.045, 0.06, 3);
    flower(top, cell, 0.3);
    if (cell > 0) {
      const joint = top.clone().multiplyScalar(0.68), branch = new THREE.Vector3(-0.15, h * 0.86, 0.08);
      stem(joint, branch, 0.005); flower(branch, cell, 1.1);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.setAttribute('aFlutter', new THREE.Float32BufferAttribute(flutter, 1));
  geometry.setIndex(indices); geometry.computeVertexNormals(); geometry.computeBoundingSphere();
  return geometry;
}
