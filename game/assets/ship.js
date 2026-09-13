export default function (THREE) {
  const g = new THREE.Group();
  // Built with the bow at +x inside the inner group; the inner group is then
  // turned so the front faces +Z per the asset contract. g stays a single,
  // unrotated child so the translation-centring at the end is exact.
  const ship = new THREE.Group();

  const hull = new THREE.MeshStandardMaterial({ color: 0x39444d, roughness: 0.75, name: 'metal' });
  const hullDark = new THREE.MeshStandardMaterial({ color: 0x272e35, roughness: 0.85 });
  const cabin = new THREE.MeshStandardMaterial({ color: 0xcfc2ac, roughness: 0.85, name: 'plaster' });
  const iron = new THREE.MeshStandardMaterial({ color: 0x333940, roughness: 0.55, metalness: 0.4, name: 'metal' });
  const red = new THREE.MeshStandardMaterial({ color: 0xa83228, roughness: 0.7 });
  const window = new THREE.MeshStandardMaterial({ color: 0x1c2126, emissive: 0xffc069, emissiveIntensity: 1.1, roughness: 0.4 });
  const timber = new THREE.MeshStandardMaterial({ color: 0x7a6f5c, roughness: 0.95, name: 'timber' });
  const A = (o) => ship.add(o);

  // hull: profile in the x-y plane (x = length, bow at +x), extruded into beam
  const s = new THREE.Shape();
  s.moveTo(-5.0, 0.35);
  s.lineTo(3.6, 0.35);
  s.quadraticCurveTo(5.9, 0.55, 6.6, 1.35);
  s.lineTo(5.4, 2.5);
  s.lineTo(-5.55, 2.35);
  s.quadraticCurveTo(-5.7, 1.2, -5.0, 0.35);
  const hullGeo = new THREE.ExtrudeGeometry(s, { depth: 2.3, bevelEnabled: false, curveSegments: 5 });
  hullGeo.translate(0, 0, -1.15);
  A(new THREE.Mesh(hullGeo, hull));

  // waterline boot stripe
  const boot = new THREE.Mesh(new THREE.BoxGeometry(11.0, 0.42, 2.44), hullDark);
  boot.position.set(0.4, 0.55, 0); A(boot);

  // deck
  const deck = new THREE.Mesh(new THREE.BoxGeometry(10.4, 0.14, 2.1), timber);
  deck.position.set(0.3, 2.42, 0); A(deck);

  // forecastle (bow side, +x) and poop (stern) cabins
  const fwd = new THREE.Mesh(new THREE.BoxGeometry(2.4, 1.15, 1.8), cabin);
  fwd.position.set(3.6, 3.05, 0); A(fwd);
  const aft = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.95, 1.7), cabin);
  aft.position.set(-3.7, 2.95, 0); A(aft);

  // wheelhouse on the forecastle with a warm window band
  const wh = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.85, 1.5), iron);
  wh.position.set(3.4, 4.15, 0); A(wh);
  const whWin = new THREE.Mesh(new THREE.BoxGeometry(1.24, 0.4, 1.34), window);
  whWin.position.set(3.4, 4.22, 0); A(whWin);

  // raked funnel
  const funnel = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.46, 1.7, 8), iron);
  funnel.rotation.z = -0.28; funnel.position.set(0.6, 4.35, 0); A(funnel);
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.36, 0.4, 8), red);
  cap.rotation.z = -0.28; cap.position.set(0.42, 5.12, 0); A(cap);

  // masts
  for (const [x, h] of [[1.9, 3.6], [-1.6, 2.8]]) {
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.08, h, 5), iron);
    mast.position.set(x, 2.5 + h / 2, 0); A(mast);
  }

  // stern paddle wheel hint
  const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.95, 0.95, 0.12, 10), red);
  wheel.rotation.z = Math.PI / 2; wheel.position.set(-4.9, 1.5, 0); A(wheel);
  ship.userData.paddle = 'wheel';

  // front faces +Z: turn the built ship so the bow (+x) points +z
  ship.rotation.y = -Math.PI / 2;
  g.add(ship);

  // centre on x/z, lowest point to y=0, measured at the vertices in world space
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
