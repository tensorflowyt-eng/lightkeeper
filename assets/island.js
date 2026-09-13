export default function (THREE) {
  const g = new THREE.Group();
  const rock = new THREE.MeshStandardMaterial({ color: 0x4d555e, roughness: 0.96, name: 'stone', flatShading: true });
  const cliff = new THREE.MeshStandardMaterial({ color: 0x5a5248, roughness: 0.98, flatShading: true });
  const grass = new THREE.MeshStandardMaterial({ color: 0x3d5238, roughness: 0.9, name: 'foliage' });

  // A low rock mound with a grassy plateau on top — big enough for a lighthouse,
  // not so big it swallows the sky. Target: ~10m across, ~6.5m tall.
  const jitter = (geo, amt, seed) => {
    let s = seed >>> 0;
    const rnd = () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296;
    const p = geo.attributes.position;
    for (let i = 0; i < p.count; i++) p.setXYZ(i, p.getX(i) + (rnd() - .5) * amt, p.getY(i) + (rnd() - .5) * amt * .5, p.getZ(i) + (rnd() - .5) * amt);
    geo.computeVertexNormals();
    return geo;
  };

  // rocky skirt that meets the water: wide and squat
  const skirt = new THREE.Mesh(jitter(new THREE.IcosahedronGeometry(4.6, 1), 0.9, 7), rock);
  skirt.scale.y = 0.40; skirt.position.y = 2.0; g.add(skirt);

  // raised plateau
  const top = new THREE.Mesh(jitter(new THREE.CylinderGeometry(3.4, 4.6, 3.4, 12), 0.7, 9), cliff);
  top.position.y = 3.6; g.add(top);

  // grass cap
  const cap = new THREE.Mesh(jitter(new THREE.CylinderGeometry(3.5, 3.6, 0.6, 12), 0.5, 13), grass);
  cap.position.y = 5.4; g.add(cap);

  // a couple of boulders on the plateau for scale
  for (const [x, z, r, seed] of [[2.2, 1.5, 0.8, 21], [-2.4, -1.2, 0.65, 31]]) {
    const b = new THREE.Mesh(jitter(new THREE.IcosahedronGeometry(r, 0), r * 0.4, seed), rock);
    b.scale.y = 0.7; b.position.set(x, 5.7, z); g.add(b);
  }

  // centre on x/z, lowest point to y=0, measured at the vertices
  const box = new THREE.Box3(), v = new THREE.Vector3(), m = new THREE.Matrix4(), im = new THREE.Matrix4();
  g.updateMatrixWorld(true);
  g.traverse((n) => {
    const p = n.isMesh && n.geometry.attributes.position; if (!p) return;
    const put = (mat) => { for (let i = 0; i < p.count; i++) box.expandByPoint(v.fromBufferAttribute(p, i).applyMatrix4(mat)); };
    if (n.isInstancedMesh) { for (let c = 0; c < n.count; c++) { n.getMatrixAt(c, im); put(m.multiplyMatrices(n.matrixWorld, im)); } return; }
    put(n.matrixWorld);
  });
  const c = box.getCenter(new THREE.Vector3());
  g.children.forEach((o) => { o.position.x -= c.x; o.position.y -= box.min.y; o.position.z -= c.z; });
  g.userData.mounts = 'bottom';
  g.userData.platformY = 5.6;   // where a lighthouse should sit
  return g;
}
