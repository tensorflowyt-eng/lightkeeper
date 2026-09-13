/**
 * LIGHTKEEPER — a night lighthouse game.
 *
 * You are the keeper's pilot cutter. The lighthouse lamp burns oil; you sail to
 * the dock to refill it. Ships cross the reef at night. While the lamp is lit,
 * the beam turns and every ship that reaches its channel mark is GUIDED. If the
 * oil runs dry, the beam dies and the ships go LOST.
 *
 * The __GAME__ contract at the bottom is what harness/playtest.mjs and
 * harness/jam.mjs steer by:
 *   - pos  is the cutter's position in metres; the harness holds a control until
 *     it has covered a distance, so throttling must actually advance the boat.
 *   - fps  comes from real elapsed time, never a clamped delta.
 *   - over stays false: this game has no death, the night just gets busier.
 */
import * as THREE from 'three';
import { ASSET } from '../assetlib.js';

const canvas = document.getElementById('c');
const loadEl = document.getElementById('load');
const barf = document.getElementById('barf');
const loadmsg = document.getElementById('loadmsg');
const startScreen = document.getElementById('start');
const hud = document.getElementById('hud');

const MAX_DT = 1 / 20;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const damp = (a, b, l, dt) => a + (b - a) * (1 - Math.exp(-l * dt));
const TAU = Math.PI * 2;
const rnd = (a = 1, b) => (b === undefined ? Math.random() * a : a + Math.random() * (b - a));
const pick = (xs) => xs[Math.floor(Math.random() * xs.length)];

// ---------------------------------------------------------------- renderer
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance', stencil: false });
renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
renderer.setSize(innerWidth, innerHeight, false);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.1;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.info.autoReset = false;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x05070c);
scene.fog = new THREE.FogExp2(0x0a1018, 0.0055);

const camera = new THREE.PerspectiveCamera(62, innerWidth / innerHeight, 0.1, 600);
camera.position.set(0, 6, 14);

// ---------------------------------------------------------------- sky
// One big gradient dome, plus a moon disc and a static star field. All of it
// rides on a sky root that the camera's yaw keeps centred on the player.
const skyRoot = new THREE.Group();
scene.add(skyRoot);

const skyGeo = new THREE.SphereGeometry(420, 24, 12);
const skyMat = new THREE.ShaderMaterial({
  side: THREE.BackSide,
  depthWrite: false,
  uniforms: { top: { value: new THREE.Color(0x070b14) }, mid: { value: new THREE.Color(0x182739) },
               bot: { value: new THREE.Color(0x2c4560) }, moonDir: { value: new THREE.Vector3(0.35, 0.5, -0.8) } },
  vertexShader: `varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
  fragmentShader: `
    varying vec3 vP; uniform vec3 top; uniform vec3 mid; uniform vec3 bot; uniform vec3 moonDir;
    void main(){
      float h = normalize(vP).y;
      vec3 c = h < 0.12 ? mix(bot, mid, smoothstep(-0.1, 0.12, h)) : mix(mid, top, smoothstep(0.12, 0.7, h));
      // moon: a soft disc with a brighter core
      float m = smoothstep(0.9991, 0.9996, dot(normalize(vP), normalize(moonDir)));
      c += m * vec3(0.95, 0.98, 1.0) * 1.35;
      c += smoothstep(0.9975, 0.9996, dot(normalize(vP), normalize(moonDir))) * vec3(0.16, 0.2, 0.26);
      gl_FragColor = vec4(c, 1.0);
    }`
});
const sky = new THREE.Mesh(skyGeo, skyMat);
sky.position.y = 0;
skyRoot.add(sky);

const starGeo = new THREE.BufferGeometry();
{
  const N = 420, pos = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) {
    const v = new THREE.Vector3(rnd(-1, 1), rnd(0.12, 1), rnd(-1, 1)).normalize().multiplyScalar(400);
    pos.set([v.x, v.y, v.z], i * 3);
  }
  starGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
}
const stars = new THREE.Points(starGeo, new THREE.PointsMaterial({ color: 0xcfd8e6, size: 1.6, sizeAttenuation: true, fog: false, transparent: true, opacity: 0.85 }));
skyRoot.add(stars);

// ---------------------------------------------------------------- water
// A gently displaced plane with a moon-glitter path and depth tint. Keep it
// coarse: it is the biggest single surface in the scene.
const waterMat = new THREE.ShaderMaterial({
  uniforms: {
    uTime: { value: 0 }, uMoonDir: { value: new THREE.Vector3(0.35, 0.5, -0.8) },
    uDeep: { value: new THREE.Color(0x0d1c2b) }, uShallow: { value: new THREE.Color(0x27435c) },
    uFog: { value: new THREE.Color(0x0d141d) }, uFogDensity: { value: 0.0055 },
  },
  vertexShader: `
    uniform float uTime; varying vec3 vW; varying float vH;
    void main(){
      vec3 p = position;
      float h = sin(p.x * 0.09 + uTime * 0.9) * 0.30
              + sin(p.y * 0.13 - uTime * 0.7) * 0.22
              + sin((p.x + p.y) * 0.05 + uTime * 0.4) * 0.24;
      p.z += h;
      vec4 w = modelMatrix * vec4(p, 1.0);
      vW = w.xyz; vH = h;
      gl_Position = projectionMatrix * viewMatrix * w;
    }`,
  fragmentShader: `
    uniform vec3 uDeep; uniform vec3 uShallow; uniform vec3 uMoonDir; uniform float uTime;
    uniform vec3 uFog; uniform float uFogDensity;
    varying vec3 vW; varying float vH;
    void main(){
      // water is a plane rotated flat; local y becomes world height
      float band = smoothstep(-0.4, 0.9, vH);
      vec3 c = mix(uShallow, uDeep, band);
      // moon glitter: narrow sparkle corridor down the moon direction
      vec2 moonUV = vW.xz * 0.06;
      float g = sin(moonUV.x * 9.0 + uTime * 2.1) * sin(moonUV.y * 11.0 - uTime * 1.7);
      float glitter = smoothstep(0.85, 1.0, g) * smoothstep(0.5, 0.9, uMoonDir.y) * 0.7;
      c += glitter * vec3(0.85, 0.92, 1.0) * 0.5;
      // exp2 fog to match the scene
      float d = length(vW - cameraPosition);
      float f = 1.0 - exp(-uFogDensity * uFogDensity * d * d);
      c = mix(c, uFog, clamp(f, 0.0, 1.0));
      // subtle crest highlights where the wave peaks catch the moon
      c += smoothstep(0.5, 1.1, vH) * vec3(0.06, 0.09, 0.12);
      gl_FragColor = vec4(c, 1.0);
    }`
});
const water = new THREE.Mesh(new THREE.PlaneGeometry(600, 600, 72, 72), waterMat);
water.rotation.x = -Math.PI / 2;
water.receiveShadow = true;
scene.add(water);

// ---------------------------------------------------------------- lights
const hemi = new THREE.HemisphereLight(0x46587a, 0x0c1014, 0.85);
scene.add(hemi);
const moonLight = new THREE.DirectionalLight(0xbcd0ea, 0.95);
moonLight.position.set(120, 160, -260);
moonLight.castShadow = true;
moonLight.shadow.mapSize.set(1024, 1024);
moonLight.shadow.camera.left = -70; moonLight.shadow.camera.right = 70;
moonLight.shadow.camera.top = 70; moonLight.shadow.camera.bottom = -70;
moonLight.shadow.camera.far = 600;
moonLight.shadow.bias = -0.0006;
scene.add(moonLight);
scene.add(moonLight.target);

// ---------------------------------------------------------------- world layout
const LHOUSE = new THREE.Vector3(0, 0, -120);   // the lighthouse stands on its rock
const DOCK = new THREE.Vector3(14, 0, -104);    // refuel pad beside the rock
const REEF_Y = 0;
const CHANNEL_MARK = new THREE.Vector3(60, 0, 20);   // the far channel buoy a ship must reach
const PLAYER_START = new THREE.Vector3(10, 0, -92);

console.log('lightkeeper: part 1 loaded');

// ---------------------------------------------------------------- assets
const ASSETS = ['lighthouse.js', 'ship.js', 'pilot_cutter.js', 'island.js', 'reef_rocks.js', 'channel_buoy.js'];
let lighthouseG, beamPivot, beam, beamMat, beamLight, lampCore;
let dockPad, reefGroup, channelBuoy;
let ships = [];

// Assets load through assetlib.ASSET, which resolves ./assets/*.js against the
// page URL and caches the merged prototype, so every placement below is cheap.

// The lighthouse: tower on its rock, a lamp room, and the rotating beam.
async function buildLighthouse() {
  const rock = await ASSET('./assets/island.js');
  rock.position.copy(LHOUSE); rock.position.y = -2.2;
  rock.scale.setScalar(1.7);
  scene.add(rock);

  lighthouseG = await ASSET('./assets/lighthouse.js');
  lighthouseG.position.copy(LHOUSE);
  scene.add(lighthouseG);

  // beam: a long thin cone of light, parented to a pivot at the lamp height so
  // we can spin it around Y. Additive so it reads as light, not geometry.
  beamPivot = new THREE.Group();
  beamPivot.position.set(LHOUSE.x, 13.2, LHOUSE.z);
  const beamGeo = new THREE.ConeGeometry(9, 150, 24, 1, true);
  beamGeo.translate(0, 0, 0);
  beamMat = new THREE.ShaderMaterial({
    transparent: true,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    depthWrite: false,
    fog: false,
    uniforms: { uOn: { value: 1 } },
    vertexShader: `
      varying float vT;
      void main(){
        vT = position.y / 150.0 + 0.5;   // 0 at the wide end, 1 at the apex
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: `
      uniform float uOn; varying float vT;
      void main(){
        // apex (near the lamp) is brightest; the wide end dissolves to nothing
        float a = smoothstep(0.0, 1.0, vT);
        a = a * a * 0.5 * uOn;
        gl_FragColor = vec4(vec3(1.0, 0.95, 0.78), a);
      }`
  });
  beam = new THREE.Mesh(beamGeo, beamMat);
  // cone points +Y; tilt it horizontal and offset so its wide end sweeps outward
  beam.rotation.x = -Math.PI / 2;
  beam.position.z = 75;
  beamPivot.add(beam);
  scene.add(beamPivot);

  // a point light that rides the beam tip so lit surfaces actually pick it up
  beamLight = new THREE.PointLight(0xfff0c0, 0, 220, 2);
  beamLight.position.set(LHOUSE.x, 11.2, LHOUSE.z + 60);
  scene.add(beamLight);

  // the lamp core: a small emissive sphere at the pivot
  lampCore = new THREE.Mesh(new THREE.SphereGeometry(1.1, 12, 12),
    new THREE.MeshStandardMaterial({ color: 0xfff6dd, emissive: 0xffd98a, emissiveIntensity: 2.2, roughness: 0.4 }));
  lampCore.position.copy(beamPivot.position);
  scene.add(lampCore);
}

async function buildDock() {
  dockPad = await ASSET('./assets/channel_buoy.js');
  // repurpose the buoy's red/white body as the dock pad marker
  dockPad.position.copy(DOCK);
  dockPad.scale.setScalar(1.4);
  scene.add(dockPad);
}

async function buildReef() {
  reefGroup = new THREE.Group();
  const spots = [
    [34, -40, 1.0, 0.3], [52, -22, 1.3, 2.1], [70, 4, 0.9, 4.0],
    [88, 24, 1.2, 1.1], [60, 44, 1.0, 5.2], [24, 18, 0.8, 3.3],
  ];
  for (const [x, z, s, rot] of spots) {
    const r = await ASSET('./assets/reef_rocks.js');
    r.position.set(x, 0, z);
    r.scale.setScalar(s);
    r.rotation.y = rot;
    reefGroup.add(r);
  }
  scene.add(reefGroup);
}

async function buildChannel() {
  channelBuoy = await ASSET('./assets/channel_buoy.js');
  channelBuoy.position.copy(CHANNEL_MARK);
  scene.add(channelBuoy);
}

// ---------------------------------------------------------------- ship traffic
// Ships spawn on the open water, steer for the channel buoy, and if they reach
// it while the lamp is lit they are GUIDED (+score); if the lamp is dark when
// they arrive they run the reef and are LOST. They are scenery-with-purpose:
// the player does not touch them, they just make the lamp matter.
const SHIP_CAP = 5;

async function spawnShip() {
  if (ships.length >= SHIP_CAP) return;
  const s = await ASSET('./assets/ship.js', { keepHierarchy: true });
  s.scale.setScalar(0.9);
  // open water start: a ring well out to sea, biased toward the far side of the reef
  const ang = rnd(-1.1, 1.1) + Math.PI * 0.5;
  const dist = rnd(210, 300);
  s.position.set(Math.cos(ang) * dist, 0, Math.sin(ang) * dist);
  s.rotation.y = Math.atan2(-s.position.x, -s.position.z);
  s.userData.state = 'crossing';
  s.userData.turn = 0;
  scene.add(s);
  ships.push(s);
}

function shipSpeedForNight() {
  return 7 + night * 0.9;
}

function updateShips(dt) {
  for (let i = ships.length - 1; i >= 0; i--) {
    const s = ships[i];
    const target = CHANNEL_MARK;
    const toT = new THREE.Vector3().subVectors(target, s.position);
    toT.y = 0;
    const dist = toT.length();
    const fwd = new THREE.Vector3(0, 0, 1).applyQuaternion(s.quaternion);
    s.rotation.y = damp(s.rotation.y,
      s.rotation.y + Math.atan2(toT.x, toT.z), 0.9, dt);
    const speed = shipSpeedForNight();
    s.position.addScaledVector(fwd, speed * dt);
    // gentle bob
    s.position.y = Math.sin(t * 0.8 + s.position.x * 0.3) * 0.18;

    if (dist < 10) {
      // arrived at the channel mark
      if (oil > 0.02) {
        guided++;
        toast('SHIP GUIDED THROUGH +10');
      } else {
        lost++;
        toast('SHIP LOST IN THE DARK');
      }
      // retire it: sink out of sight far out
      s.position.copy(target).add(new THREE.Vector3(rnd(-8, 8), 0, 60));
      s.visible = false;
      scene.remove(s);
      ships.splice(i, 1);
    } else if (dist > 340) {
      // something drifted out of bounds — retire it cleanly
      s.visible = false;
      scene.remove(s);
      ships.splice(i, 1);
    }
  }
  // keep the water busy
  if (t - lastSpawn > spawnGap && ships.length < SHIP_CAP) {
    lastSpawn = t;
    spawnGap = rnd(9, 16) - Math.min(5, night);
    spawnShip();
  }
}

// ---------------------------------------------------------------- player: the keeper's cutter
// A drivable boat: throttle + rudder on the water, no death. This is the thing
// the harness steers — throttle must genuinely advance the hull.
const player = {
  pos: PLAYER_START.clone(),
  vel: new THREE.Vector3(),
  heading: 0,                 // facing +Z, away from the lamp, onto the water
  obj: null,
  throttle: 0,
  steer: 0,
};

async function buildPlayer() {
  player.obj = await ASSET('./assets/pilot_cutter.js', { keepHierarchy: true });
  player.obj.scale.setScalar(1.1);
  player.obj.position.copy(player.pos);
  scene.add(player.obj);
}

function updatePlayer(dt) {
  const fwd = new THREE.Vector3(Math.sin(player.heading), 0, Math.cos(player.heading));
  // engine: throttle drives forward with drag
  const MAXV = 11;
  player.vel.addScaledVector(fwd, player.throttle * 26 * dt);
  player.vel.multiplyScalar(Math.pow(0.35, dt));        // water drag
  const v = player.vel.length();
  if (v > MAXV) player.vel.multiplyScalar(MAXV / v);
  player.pos.addScaledVector(player.vel, dt);

  // rudder: turning is fastest under way, like a real boat
  player.heading += player.steer * 1.7 * clamp(v / 4, 0.15, 1) * dt;

  // keep the keeper on his own side of the channel — soft wall, not death
  const R = 190;
  const rr = Math.hypot(player.pos.x, player.pos.z);
  if (rr > R) {
    const n = new THREE.Vector3(player.pos.x / rr, 0, player.pos.z / rr);
    player.pos.addScaledVector(n, -(rr - R));
    player.vel.addScaledVector(n, -player.vel.dot(n));
  }
  // don't sail onto the lighthouse rock or the dock pad
  for (const w of [LHOUSE, DOCK]) {
    const d = new THREE.Vector3().subVectors(player.pos, w);
    d.y = 0;
    const dl = d.length();
    const rad = w === LHOUSE ? 12 : 5;
    if (dl < rad && dl > 1e-3) {
      d.multiplyScalar(1 / dl);
      player.pos.copy(w).addScaledVector(d, rad);
      player.vel.addScaledVector(d, -player.vel.dot(d));
    }
  }
  // reef rocks: soft bump
  if (reefGroup) {
    for (const r of reefGroup.children) {
      const d = new THREE.Vector3().subVectors(player.pos, r.position);
      d.y = 0;
      const dl = d.length();
      if (dl < 9 && dl > 1e-3) {
        d.multiplyScalar(1 / dl);
        player.pos.copy(r.position).addScaledVector(d, 9);
        player.vel.multiplyScalar(0.4);
      }
    }
  }
  player.obj.position.set(player.pos.x, 0.28 + Math.sin(t * 1.1) * 0.12, player.pos.z);
  player.obj.rotation.set(0, player.heading, 0);
  // wake tilt: lean into the turn
  player.obj.rotation.z = -player.steer * clamp(v / MAXV, 0, 1) * 0.14;
}

// ---------------------------------------------------------------- camera
const cam = { yaw: 0, pitch: -0.42, dist: 15, targetY: 4.2 };
function updateCamera(dt) {
  const bob = Math.sin(t * 1.1) * 0.18;
  cam.dist = damp(cam.dist, 15, 3, dt);
  const cx = player.pos.x - Math.sin(cam.yaw) * Math.cos(cam.pitch) * cam.dist;
  const cz = player.pos.z - Math.cos(cam.yaw) * Math.cos(cam.pitch) * cam.dist;
  const cy = player.pos.y - Math.sin(cam.pitch) * cam.dist;
  camera.position.x = damp(camera.position.x, cx, 12, dt);
  camera.position.y = damp(camera.position.y, Math.max(cy, 1.2) + bob, 12, dt);
  camera.position.z = damp(camera.position.z, cz, 12, dt);
  camera.lookAt(player.pos.x, player.pos.y + cam.targetY, player.pos.z);
  // keep the sky centred on the player so the dome never slides off
  skyRoot.position.set(player.pos.x, 0, player.pos.z);
  moonLight.target.position.copy(player.pos);
}

// ---------------------------------------------------------------- game state
let t = 0;                 // game clock (seconds)
let playing = false;       // false until KEEP WATCH is pressed
let oil = 100;             // lamp oil, 0..100 — burns ~1.15/s
let guided = 0, lost = 0, score = 0, night = 1;
let lastSpawn = 0, spawnGap = 4;
let lastT = performance.now();
let fpsSm = 60;

// toast(msg): one floating line above the water
const toastEl = document.getElementById('toast');
const refuelEl = document.getElementById('refuel');
const oilLine = document.getElementById('oilline');
const oilPct = document.getElementById('oilpct');
const oilBox = document.getElementById('oilbox');
const nightEl = document.getElementById('night');
const scoreEl = document.getElementById('score');
const sGuided = document.getElementById('sguided');
const sLost = document.getElementById('slost');
const touchEl = document.getElementById('touch');
const stickEl = document.getElementById('stick');
const lookEl = document.getElementById('look');
const hornEl = document.getElementById('horn');
const startb = document.getElementById('startb');
const restartb = document.getElementById('restartb');
let toastUntil = 0;
function toast(msg) {
  toastEl.textContent = msg;
  toastEl.style.opacity = 1;
  toastUntil = t + 1.6;
}

// ---------------------------------------------------------------- lamp: oil, beam, refuel
const OIL_BURN = 1.15;
function updateLamp(dt) {
  if (!playing) return;
  oil = Math.max(0, oil - OIL_BURN * dt);
  const lit = oil > 0.02;
  beamMat.uniforms.uOn.value = damp(beamMat.uniforms.uOn.value, lit ? 1 : 0, 6, dt);
  lampCore.material.emissiveIntensity = damp(lampCore.material.emissiveIntensity, lit ? 2.2 : 0.15, 6, dt);
  beamLight.intensity = damp(beamLight.intensity, lit ? 1.1 : 0, 6, dt);
  if (lit) {
    beamPivot.rotation.y += dt * 0.85;                    // the beam turns
    beamLight.position.set(LHOUSE.x + Math.sin(beamPivot.rotation.y) * 60, 11.2,
                           LHOUSE.z + Math.cos(beamPivot.rotation.y) * 60);
  }
  // refuel at the dock
  const d = Math.hypot(player.pos.x - DOCK.x, player.pos.z - DOCK.z);
  const atDock = d < 7;
  refuelEl.classList.toggle('on', atDock && oil < 99.5);
  if (atDock) oil = Math.min(100, oil + 26 * dt);
}

// ---------------------------------------------------------------- audio (synthesized, no files)
let actx = null, master = null, muted = false, hornCool = 0;
function audio() {
  if (actx) return;
  try {
    actx = new (window.AudioContext || window.webkitAudioContext)();
    master = actx.createGain();
    master.gain.value = muted ? 0 : 0.55;
    master.connect(actx.destination);
    // ocean: two incommensurate low sine pulses through a lowpass, like surf
    const surf = actx.createOscillator(); surf.frequency.value = 46;
    const surf2 = actx.createOscillator(); surf2.frequency.value = 61;
    const lp = actx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 240;
    const g = actx.createGain(); g.gain.value = 0.05;
    const lfo = actx.createOscillator(); lfo.frequency.value = 0.11;
    const lg = actx.createGain(); lg.gain.value = 0.025;
    lfo.connect(lg); lg.connect(g.gain);
    surf.connect(lp); surf2.connect(lp); lp.connect(g); g.connect(master);
    surf.start(); surf2.start(); lfo.start();
  } catch (e) { console.warn('[audio]', e.message); }
}
function toggleMute() {
  muted = !muted;
  if (master) master.gain.value = muted ? 0 : 0.55;
}
function horn() {
  if (!actx || t < hornCool) return;
  hornCool = t + 1.2;
  const o1 = actx.createOscillator(), o2 = actx.createOscillator();
  o1.type = 'sawtooth'; o2.type = 'sawtooth';
  o1.frequency.value = 196; o2.frequency.value = 233;
  const f = actx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 620;
  const g = actx.createGain();
  g.gain.setValueAtTime(0.0001, actx.currentTime);
  g.gain.exponentialRampToValueAtTime(0.34, actx.currentTime + 0.06);
  g.gain.setValueAtTime(0.34, actx.currentTime + 0.34);
  g.gain.exponentialRampToValueAtTime(0.0001, actx.currentTime + 0.9);
  o1.connect(f); o2.connect(f); f.connect(g); g.connect(master);
  o1.start(); o2.start(); o1.stop(actx.currentTime + 0.95); o2.stop(actx.currentTime + 0.95);
}

// ---------------------------------------------------------------- input
const keys = {};
function applyKeys() {
  if (!playing) return;
  player.throttle = (keys.KeyW || keys.ArrowUp) ? 1 : (keys.KeyS || keys.ArrowDown ? -0.4 : 0);
  player.steer = ((keys.KeyA || keys.ArrowLeft) ? 1 : 0) - ((keys.KeyD || keys.ArrowRight) ? 1 : 0);
}
addEventListener('keydown', (e) => {
  keys[e.code] = true;
  if (e.code === 'Space') { e.preventDefault(); horn(); }
  if (e.code === 'KeyM') toggleMute();
  if (e.code === 'KeyR') restart();
  if ((e.code === 'Space' || e.code.startsWith('Arrow')) && playing) e.preventDefault();
});
addEventListener('keyup', (e) => { keys[e.code] = false; });

// touch: left virtual stick (throttle = up/down, steer = left/right), right side looks
const touch = { on: matchMedia('(pointer:coarse)').matches };
let stickId = null, lookId = null, stickC = null, lookC = null;
function applyStick() {
  if (stickC === null) return;
  player.throttle = clamp(-stickC.y, 0, 1) * (Math.hypot(stickC.x, stickC.y) > 0.08 ? 1 : 0)
                  - clamp(stickC.y, -0.4, 0) * 0.4;
  player.steer = clamp(stickC.x, -1, 1);
}
stickEl.addEventListener('pointerdown', (e) => {
  stickId = e.pointerId; stickEl.setPointerCapture(e.pointerId);
  const r = stickEl.getBoundingClientRect();
  stickC = { x: e.clientX - (r.left + r.width / 2), y: e.clientY - (r.top + r.height / 2) };
});
stickEl.addEventListener('pointermove', (e) => {
  if (e.pointerId !== stickId) return;
  const r = stickEl.getBoundingClientRect();
  stickC = { x: (e.clientX - (r.left + r.width / 2)) / 70, y: (e.clientY - (r.top + r.height / 2)) / 70 };
});
const stickEnd = (e) => { if (e.pointerId === stickId) { stickId = null; stickC = null; player.throttle = 0; player.steer = 0; } };
stickEl.addEventListener('pointerup', stickEnd); stickEl.addEventListener('pointercancel', stickEnd);

lookEl.addEventListener('pointerdown', (e) => {
  lookId = e.pointerId; lookC = { x: e.clientX, y: e.clientY };
  lookEl.setPointerCapture(e.pointerId);
});
lookEl.addEventListener('pointermove', (e) => {
  if (e.pointerId !== lookId) return;
  cam.yaw -= (e.clientX - lookC.x) * 0.004;
  cam.pitch = clamp(cam.pitch - (e.clientY - lookC.y) * 0.003, -1.15, 0.25);
  lookC = { x: e.clientX, y: e.clientY };
});
const lookEnd = (e) => { if (e.pointerId === lookId) lookId = null; };
lookEl.addEventListener('pointerup', lookEnd); lookEl.addEventListener('pointercancel', lookEnd);

hornEl.addEventListener('pointerdown', (e) => { e.preventDefault(); hornEl.classList.add('dn'); audio(); horn(); });
addEventListener('pointerup', () => hornEl.classList.remove('dn'));

// ---------------------------------------------------------------- start / restart
function start() {
  if (playing) return;
  playing = true;
  startScreen.classList.remove('on');
  hud.classList.add('on');
  if (touch.on) touchEl.classList.add('on');
  audio();
  if (actx && actx.state === 'suspended') actx.resume();
  toastEl.style.opacity = 0;
  lastSpawn = t; spawnGap = 3;
}
function restart() {
  for (const s of ships.splice(0)) { s.visible = false; scene.remove(s); }
  oil = 100; guided = 0; lost = 0; score = 0; night = 1;
  player.pos.copy(PLAYER_START); player.vel.set(0, 0, 0); player.heading = 0;
  player.throttle = 0; player.steer = 0;
  cam.yaw = 0; cam.pitch = -0.42;
  beamPivot.rotation.y = 0;
  if (!playing) return;
  toast('A NEW NIGHT');
}
startb.addEventListener('click', start);
startb.addEventListener('pointerup', start);
restartb.addEventListener('click', restart);
addEventListener('click', () => { if (!playing && !startScreen.classList.contains('on') && document.visibilityState === 'visible') start(); });

// ---------------------------------------------------------------- load
async function load() {
  const urls = ASSETS.map((a) => `./assets/${a}`);
  for (let i = 0; i < urls.length; i++) {
    loadmsg.textContent = `preparing ${ASSETS[i]}`;
    barf.style.width = `${((i) / urls.length) * 100}%`;
    await ASSET(urls[i], { keepHierarchy: true });   // warm the cache
  }
  barf.style.width = '100%';
  loadmsg.textContent = 'lighting the lamp';
  await buildLighthouse();
  await buildDock();
  await buildReef();
  await buildChannel();
  await buildPlayer();
  loadEl.style.display = 'none';
  startScreen.classList.add('on');
  window.__READY__ = true;
  console.log('lightkeeper: ready',
    { draws: renderer.info.render.calls, tris: renderer.info.render.triangles });
}
load().catch((e) => {
  console.error('lightkeeper: load failed', e);
  loadmsg.textContent = 'the light failed to light';
  loadmsg.style.color = '#d8342a';
});

// ---------------------------------------------------------------- HUD
function updateHud() {
  oilLine.style.width = `${oil}%`;
  oilPct.textContent = `${Math.round(oil)}%`;
  oilBox.classList.toggle('low', oil < 30);
  const nearDock = Math.hypot(player.pos.x - DOCK.x, player.pos.z - DOCK.z) < 7;
  refuelEl.classList.toggle('on', nearDock && playing && oil < 99.5);
  nightEl.textContent = `NIGHT ${night}`;
  scoreEl.innerHTML = `${score} <small>GUIDED LIGHT</small>`;
  sGuided.textContent = `${guided} GUIDED`;
  sLost.textContent = `${lost} LOST`;
  if (t > toastUntil) toastEl.style.opacity = 0;
}

// ---------------------------------------------------------------- loop
function frame() {
  const now = performance.now();
  const realDt = (now - lastT) / 1000;
  lastT = now;
  const dt = Math.min(realDt, MAX_DT);
  if (realDt > 1e-4) fpsSm = damp(fpsSm, 1 / realDt, 3, realDt);
  t += dt;

  if (playing) {
    applyKeys();
    applyStick();
    updatePlayer(dt);
    updateLamp(dt);
    updateShips(dt);
    // the night deepens: every 90 s the traffic gets busier
    night = 1 + Math.floor(t / 90);
  }
  updateCamera(dt);

  // idle animation so the loading-to-start transition feels alive
  waterMat.uniforms.uTime.value = t;
  if (!playing && beamPivot && t > 0.05) beamPivot.rotation.y += dt * 0.85;

  renderer.info.reset();
  renderer.render(scene, camera);
  updateHud();
  requestAnimationFrame(frame);
}

// ---------------------------------------------------------------- the contract
window.__GAME__ = {
  get pos() { return [player.pos.x, player.pos.z]; },
  get speed() { return Math.round(player.vel.length() * 10) / 10; },
  get score() { return score; },
  get fps() { return Math.round(fpsSm); },
  get over() { return false; },
  // renderer.info was captured right after the last render, this frame
  get draws() { return renderer.info.render.calls; },
  get tris() { return renderer.info.render.triangles; },
};
window.addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight, false);
});
requestAnimationFrame(frame);
