export default function (THREE) {
  const g = new THREE.Group();
  const stone = new THREE.MeshStandardMaterial({ color: 0x4b535c, roughness: 0.95, name: 'stone', flatShading: true });
  const dark = new THREE.MeshStandardMaterial({ color: 0x394049, roughness: 0.98, flatShading: true });

  // A reef of interlocking rocks. Each rock is a squashed, flat-shaded icosahedron
  // with its vertices jittered so no two look cloned.
  const jitter = (geo, amt, seed) => {
    let s = seed >>> 0;
    const rnd = () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296;
    const p = geo.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      p.setXYZ(i, x + (rnd() - .5) * amt, y + (rnd() - .5) * amt * .6, z + (rnd() - .5) * amt);
    }
    geo.computeVertexNormals();
    return geo;
  };

  const rocks = [
    // [x, y, z, radius, seed]
    [0.0, 0.0, 0.0, 2.6, 11],
    [2.3, 0.0, 0.9, 1.7, 23],
    [-2.0, 0.0, 1.2, 1.9, 37],
    [0.9, 0.0, -1.9, 1.4, 41],
    [-1.3, 0.0, -1.6, 1.5, 53],
  ];
  rocks.forEach(([x, , z, r, seed], i) => {
    const m = new THREE.Mesh(jitter(new THREE.IcosahedronGeometry(r, 1), r * 0.5, seed), i % 2 ? dark : stone);
    m.scale.y = 0.55;                       // rocks lie low, not domed
    m.position.set(x, r * 0.32, z);
    m.rotation.y = seed;
    g.add(m);
  });

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
  return g;
}
