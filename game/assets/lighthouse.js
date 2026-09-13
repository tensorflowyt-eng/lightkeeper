export default function (THREE) {
  const g = new THREE.Group();

  const paint = new THREE.MeshStandardMaterial({ color: 0xe7e1d3, roughness: 0.85, name: 'plaster' });
  const red = new THREE.MeshStandardMaterial({ color: 0xa83228, roughness: 0.7, name: 'plaster' });
  const iron = new THREE.MeshStandardMaterial({ color: 0x2c3036, roughness: 0.5, metalness: 0.55, name: 'metal' });
  const glass = new THREE.MeshStandardMaterial({ color: 0x9fc8e8, roughness: 0.15, metalness: 0.1,
    transparent: true, opacity: 0.42, emissive: 0xffd98a, emissiveIntensity: 0.55, side: THREE.DoubleSide });
  const core = new THREE.MeshStandardMaterial({ color: 0xffe9b8, emissive: 0xffd27a, emissiveIntensity: 1.6, roughness: 0.4 });
  const stone = new THREE.MeshStandardMaterial({ color: 0x596068, roughness: 0.95, name: 'stone', flatShading: true });

  // rock plinth the tower stands on
  const plinth = new THREE.Mesh(new THREE.CylinderGeometry(4.6, 5.4, 1.6, 9), stone);
  plinth.position.y = 0.8; g.add(plinth);

  // tower: taper from 3.1 to 2.0, 9.6m of white banding
  const tower = new THREE.Mesh(new THREE.CylinderGeometry(2.0, 3.1, 9.6, 10), paint);
  tower.position.y = 1.6 + 4.8; g.add(tower);

  // red service band
  const band = new THREE.Mesh(new THREE.CylinderGeometry(2.62, 2.84, 1.15, 10), red);
  band.position.y = 5.1; g.add(band);

  // gallery platform
  const gal = new THREE.Mesh(new THREE.CylinderGeometry(2.6, 2.6, 0.28, 12), iron);
  gal.position.y = 11.28; g.add(gal);

  // railing: 8 posts + top ring
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.95, 4), iron);
    post.position.set(Math.sin(a) * 2.42, 11.82, Math.cos(a) * 2.42);
    g.add(post);
  }
  const rail = new THREE.Mesh(new THREE.TorusGeometry(2.42, 0.05, 4, 24), iron);
  rail.rotation.x = Math.PI / 2; rail.position.y = 12.3; g.add(rail);

  // lamp room: glass drum
  const drum = new THREE.Mesh(new THREE.CylinderGeometry(1.45, 1.45, 1.7, 10, 1, true), glass);
  drum.position.y = 12.28; g.add(drum);

  // the light itself
  const lamp = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 0.9, 8), core);
  lamp.position.y = 12.28; g.add(lamp);
  g.userData.lampY = 12.28;

  // roof: iron cone + finial
  const roof = new THREE.Mesh(new THREE.ConeGeometry(1.85, 1.25, 10), iron);
  roof.position.y = 13.5; g.add(roof);
  const finial = new THREE.Mesh(new THREE.SphereGeometry(0.14, 6, 5), iron);
  finial.position.y = 14.2; g.add(finial);

  // door, front (+Z)
  const door = new THREE.Mesh(new THREE.BoxGeometry(0.95, 1.85, 0.16), iron);
  door.position.set(0, 2.35, 3.0); g.add(door);
  const arch = new THREE.Mesh(new THREE.CylinderGeometry(0.52, 0.52, 0.18, 8, 1, false, 0, Math.PI), iron);
  arch.rotation.x = Math.PI / 2; arch.position.set(0, 3.28, 3.0); g.add(arch);

  // two small windows, front and back
  for (const zz of [1, -1]) {
    const win = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.75, 0.1), new THREE.MeshStandardMaterial({
      color: 0x20262c, emissive: 0xffb84d, emissiveIntensity: 0.7, roughness: 0.4 }));
    win.position.set(0, 8.1, zz * 2.25); g.add(win);
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
  return g;
}
