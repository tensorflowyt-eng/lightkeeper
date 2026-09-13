export default function (THREE) {
  // A small pilot cutter — quick, low, for the later "rush hour" night.
  // Needs enough hull detail to clear the gate's 150-triangle floor.
  // Built with the bow at +x inside the inner group, turned so the front faces +Z.
  const g = new THREE.Group();
  const cut = new THREE.Group();
  const A = (o) => cut.add(o);

  const hull = new THREE.MeshStandardMaterial({ color: 0x4a5560, roughness: 0.7, name: 'metal' });
  const hullDark = new THREE.MeshStandardMaterial({ color: 0x333a42, roughness: 0.85 });
  const cabin = new THREE.MeshStandardMaterial({ color: 0xb9ad97, roughness: 0.85 });
  const iron = new THREE.MeshStandardMaterial({ color: 0x2f353c, roughness: 0.55, metalness: 0.4, name: 'metal' });
  const window = new THREE.MeshStandardMaterial({ color: 0x1c2126, emissive: 0xffd28a, emissiveIntensity: 1.2, roughness: 0.4 });
  const timber = new THREE.MeshStandardMaterial({ color: 0x6f6455, roughness: 0.95, name: 'timber' });

  // hull: wedge shape, bow at +x
  const s = new THREE.Shape();
  s.moveTo(-2.6, 0.25);
  s.lineTo(1.9, 0.25);
  s.quadraticCurveTo(3.3, 0.4, 3.7, 0.95);
  s.lineTo(3.0, 1.5);
  s.lineTo(-2.9, 1.45);
  s.quadraticCurveTo(-3.0, 0.8, -2.6, 0.25);
  const hullGeo = new THREE.ExtrudeGeometry(s, { depth: 1.4, bevelEnabled: false, curveSegments: 4 });
  hullGeo.translate(0, 0, -0.7);
  A(new THREE.Mesh(hullGeo, hull));

  // waterline stripe
  const boot = new THREE.Mesh(new THREE.BoxGeometry(5.4, 0.28, 1.5), hullDark);
  boot.position.set(0.3, 0.5, 0); A(boot);

  // deck plank strip
  const deck = new THREE.Mesh(new THREE.BoxGeometry(5.2, 0.1, 1.2), timber);
  deck.position.set(0.3, 1.52, 0); A(deck);

  // single forward cabin, low
  const cab = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.75, 1.1), cabin);
  cab.position.set(0.9, 1.95, 0); A(cab);
  const win = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.3, 0.95), window);
  win.position.set(0.9, 2.0, 0); A(win);

  // stern cabin block
  const aft = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.55, 1.0), cabin);
  aft.position.set(-2.1, 1.8, 0); A(aft);

  // porthole dots along the hull — cheap detail, reads at distance
  for (const x of [-1.2, -0.4, 0.4, 1.2]) {
    const porthole = new THREE.Mesh(new THREE.CircleGeometry(0.09, 8), window);
    porthole.position.set(x, 1.1, 0.71); A(porthole);
    const porthole2 = porthole.clone(); porthole2.position.z = -0.71; porthole2.rotation.y = Math.PI; A(porthole2);
  }

  // slim mast + a short yard
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.05, 2.0, 5), iron);
  mast.position.set(-1.4, 2.5, 0); A(mast);
  const yard = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 1.3, 4), iron);
  yard.rotation.z = Math.PI / 2; yard.position.set(-1.4, 3.1, 0); A(yard);

  // front faces +Z
  cut.rotation.y = -Math.PI / 2;
  g.add(cut);

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
