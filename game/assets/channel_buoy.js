export default function (THREE) {
  const g = new THREE.Group();
  const red = new THREE.MeshStandardMaterial({ color: 0xb03a2e, roughness: 0.7 });
  const white = new THREE.MeshStandardMaterial({ color: 0xd8d3c4, roughness: 0.8 });
  const iron = new THREE.MeshStandardMaterial({ color: 0x2c3036, roughness: 0.55, metalness: 0.5, name: 'metal' });
  const lamp = new THREE.MeshStandardMaterial({ color: 0xffe9b8, emissive: 0xffcf7a, emissiveIntensity: 1.4, roughness: 0.4 });

  // hull: a fat lathe body, two stripes painted on with separate bands
  const pts = [
    new THREE.Vector2(0.05, 0.0), new THREE.Vector2(0.55, 0.12), new THREE.Vector2(0.72, 0.55),
    new THREE.Vector2(0.6, 1.15), new THREE.Vector2(0.42, 1.6), new THREE.Vector2(0.3, 1.75),
    new THREE.Vector2(0.34, 2.0), new THREE.Vector2(0.2, 2.1),
  ];
  const body = new THREE.Mesh(new THREE.LatheGeometry(pts, 10), red);
  g.add(body);

  // white band around the middle
  const band = new THREE.Mesh(new THREE.CylinderGeometry(0.63, 0.65, 0.5, 10, 1, true), white);
  band.position.y = 0.95; g.add(band);

  // top cap + mast + light
  const cap = new THREE.Mesh(new THREE.ConeGeometry(0.36, 0.4, 8), iron);
  cap.position.y = 2.3; g.add(cap);
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.55, 5), iron);
  mast.position.y = 2.55; g.add(mast);
  const light = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 6), lamp);
  light.position.y = 2.9; g.add(light);
  g.userData.lampY = 2.9;

  // ring at the waterline so it reads as floating
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.05, 4, 12), iron);
  ring.rotation.x = Math.PI / 2; ring.position.y = 0.14; g.add(ring);

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
