import * as THREE from '../lib/three.module.min.js';

const APP_VERSION = '0.1.0';
const SAVE_KEY = 'lifemaker_save';
const SAVE_VERSION = 1;

// 部屋の大きさ: 1 マス 0.5m、12×12 マス（6m 四方）
const CELL = 0.5;
const N = 12;
const HALF = N * CELL / 2;
const WALL_H = 2.6;
const WALL_T = 0.1;

// ---------- 家具の定義 ----------
// size: [横, 奥行き]（マス）。正面は +z。build は足元の中心を原点に作る。
const FURNITURE = {
    bed: {
        name: 'ベッド', icon: '🛏', color: '#7fa7c9', size: [2, 4], tags: ['寝る'],
        build(g, c) {
            box(g, 1.0, 0.3, 2.0, '#a8794f', 0, 0, 0);
            box(g, 1.0, 0.8, 0.08, '#a8794f', 0, 0, -0.96);
            box(g, 0.94, 0.18, 1.9, '#f4f1ea', 0, 0.3, 0);
            box(g, 0.6, 0.1, 0.3, '#ffffff', 0, 0.48, -0.72);
            box(g, 0.98, 0.07, 1.25, c, 0, 0.46, 0.32);
        },
    },
    sofa: {
        name: 'ソファ', icon: '🛋', color: '#8aa58c', size: [4, 2], tags: ['座る'],
        build(g, c) {
            box(g, 1.9, 0.4, 0.86, c, 0, 0.06, 0);
            box(g, 1.9, 0.5, 0.2, c, 0, 0.36, -0.33);
            box(g, 0.18, 0.26, 0.86, c, -0.86, 0.46, 0);
            box(g, 0.18, 0.26, 0.86, c, 0.86, 0.46, 0);
            box(g, 0.74, 0.1, 0.6, shade(c, 0.12), -0.38, 0.46, 0.08);
            box(g, 0.74, 0.1, 0.6, shade(c, 0.12), 0.38, 0.46, 0.08);
            for (const x of [-0.85, 0.85]) for (const z of [-0.36, 0.36]) box(g, 0.06, 0.06, 0.06, '#5b4636', x, 0, z);
        },
    },
    chair: {
        name: 'いす', icon: '🪑', color: '#b98b5e', size: [1, 1], tags: ['座る'],
        build(g, c) {
            for (const x of [-0.17, 0.17]) for (const z of [-0.17, 0.17]) box(g, 0.04, 0.42, 0.04, c, x, 0, z);
            box(g, 0.42, 0.05, 0.42, c, 0, 0.42, 0);
            box(g, 0.04, 0.45, 0.04, c, -0.17, 0.47, -0.19);
            box(g, 0.04, 0.45, 0.04, c, 0.17, 0.47, -0.19);
            box(g, 0.42, 0.16, 0.04, c, 0, 0.74, -0.19);
        },
    },
    table: {
        name: 'テーブル', icon: '🍽', color: '#c89a6a', size: [3, 2], tags: ['テーブル'],
        build(g, c) {
            box(g, 1.4, 0.05, 0.9, c, 0, 0.68, 0);
            for (const x of [-0.62, 0.62]) for (const z of [-0.37, 0.37]) box(g, 0.06, 0.68, 0.06, shade(c, -0.15), x, 0, z);
        },
    },
    lowtable: {
        name: 'ローテーブル', icon: '☕', color: '#e8e1d5', size: [2, 2], tags: ['テーブル'],
        build(g, c) {
            cyl(g, 0.42, 0.42, 0.04, c, 0, 0.34, 0, 32);
            cyl(g, 0.05, 0.05, 0.34, '#6b5847', 0, 0, 0, 12);
            cyl(g, 0.22, 0.22, 0.02, '#6b5847', 0, 0, 0, 24);
        },
    },
    bookshelf: {
        name: '本棚', icon: '📚', color: '#9c7350', size: [2, 1], tags: ['収納'],
        build(g, c) {
            const W = 0.94, D = 0.4, H = 1.8, z = -0.04;
            box(g, 0.03, H, D, c, -W / 2 + 0.015, 0, z);
            box(g, 0.03, H, D, c, W / 2 - 0.015, 0, z);
            box(g, W, 0.03, D, c, 0, H - 0.03, z);
            box(g, W, 0.02, 0.02, c, 0, 0, z - D / 2 + 0.01);
            box(g, W - 0.06, H, 0.02, shade(c, -0.12), 0, 0, z - D / 2 + 0.01);
            const bookColors = ['#c45c4a', '#4a7cc4', '#e3b34c', '#5d9c6a', '#8a6bb8', '#e8e1d5'];
            let k = 0;
            for (let i = 0; i < 4; i++) {
                const y = i * 0.44;
                box(g, W - 0.06, 0.03, D, c, 0, y, z);
                let x = -W / 2 + 0.06;
                while (x < W / 2 - 0.12) {
                    const bw = 0.04 + ((k * 7) % 5) * 0.012, bh = 0.24 + ((k * 3) % 4) * 0.03;
                    box(g, bw, bh, 0.26, bookColors[k % bookColors.length], x + bw / 2, y + 0.03, z + 0.02);
                    x += bw + 0.005; k++;
                    if (k % 9 === 0) x += 0.12;
                }
            }
        },
    },
    wardrobe: {
        name: 'クローゼット', icon: '🚪', color: '#e5dccd', size: [2, 1], tags: ['収納'],
        build(g, c) {
            box(g, 0.94, 1.9, 0.46, c, 0, 0, -0.01);
            box(g, 0.005, 1.7, 0.01, shade(c, -0.25), 0, 0.12, 0.225);
            box(g, 0.02, 0.18, 0.03, '#8a7a66', -0.05, 0.95, 0.23);
            box(g, 0.02, 0.18, 0.03, '#8a7a66', 0.05, 0.95, 0.23);
            box(g, 0.94, 0.08, 0.46, shade(c, -0.2), 0, 0, -0.01);
        },
    },
    tvstand: {
        name: 'テレビ台', icon: '📺', color: '#6f5a48', size: [3, 1], tags: ['収納', '家電'],
        build(g, c) {
            box(g, 1.4, 0.42, 0.42, c, 0, 0, 0);
            box(g, 0.6, 0.01, 0.3, shade(c, -0.2), -0.3, 0.2, 0.2);
            box(g, 0.3, 0.03, 0.18, '#2b2b2e', 0, 0.42, -0.04);
            box(g, 0.05, 0.12, 0.04, '#2b2b2e', 0, 0.45, -0.04);
            box(g, 1.1, 0.64, 0.04, '#2b2b2e', 0, 0.55, -0.04);
            box(g, 1.04, 0.58, 0.005, '#16181d', 0, 0.58, -0.017);
        },
    },
    plant: {
        name: '観葉植物', icon: '🪴', color: '#5f9e5a', size: [1, 1], tags: ['植物'],
        build(g, c) {
            cyl(g, 0.15, 0.11, 0.3, '#c47a52', 0, 0, 0, 16);
            ball(g, 0.2, c, 0, 0.55, 0);
            ball(g, 0.15, shade(c, 0.1), 0.1, 0.72, 0.05);
            ball(g, 0.13, shade(c, -0.1), -0.1, 0.68, -0.06);
        },
    },
    lamp: {
        name: 'スタンドライト', icon: '💡', color: '#f3e3b8', size: [1, 1], tags: ['照明'],
        build(g, c) {
            cyl(g, 0.13, 0.13, 0.03, '#3a3633', 0, 0, 0, 20);
            cyl(g, 0.015, 0.015, 1.35, '#3a3633', 0, 0.03, 0, 8);
            const shadeMesh = cyl(g, 0.11, 0.18, 0.24, c, 0, 1.3, 0, 24);
            shadeMesh.material.emissive = new THREE.Color(c);
            shadeMesh.material.emissiveIntensity = 0.35;
        },
    },
    rug: {
        name: 'ラグ', icon: '🟫', color: '#c98c6b', size: [4, 3], tags: ['敷物'], flat: true,
        build(g, c) {
            box(g, 1.9, 0.012, 1.4, c, 0, 0, 0);
            box(g, 1.6, 0.014, 1.1, shade(c, 0.15), 0, 0, 0);
        },
    },
};

// ---------- 形を作る小さな関数 ----------
const materialCache = new Map();
function mat(color) {
    if (!materialCache.has(color)) materialCache.set(color, new THREE.MeshStandardMaterial({ color, roughness: 0.85 }));
    return materialCache.get(color);
}
function addMesh(g, geo, color, x, y, z, own = false) {
    const m = new THREE.Mesh(geo, own ? mat(color).clone() : mat(color));
    m.position.set(x, y, z);
    m.castShadow = true;
    m.receiveShadow = true;
    g.add(m);
    return m;
}
function box(g, w, h, d, color, x, y, z) {
    return addMesh(g, new THREE.BoxGeometry(w, h, d), color, x, y + h / 2, z);
}
function cyl(g, rTop, rBottom, h, color, x, y, z, seg = 16) {
    return addMesh(g, new THREE.CylinderGeometry(rTop, rBottom, h, seg), color, x, y + h / 2, z, true);
}
function ball(g, r, color, x, y, z) {
    const geo = new THREE.IcosahedronGeometry(r, 1);
    const m = addMesh(g, geo, color, x, y, z);
    m.material = mat(color).clone();
    m.material.flatShading = true;
    return m;
}
function shade(hex, amount) {
    const c = new THREE.Color(hex);
    const hsl = {};
    c.getHSL(hsl);
    c.setHSL(hsl.h, hsl.s, Math.min(1, Math.max(0, hsl.l + amount)));
    return '#' + c.getHexString();
}

// ---------- 状態とセーブ ----------
function makeDefaultGame() {
    return {
        saveVersion: SAVE_VERSION,
        appearance: 'auto',
        nextUid: 5,
        items: [
            { uid: 1, type: 'rug', gx: 4, gz: 5, rot: 0 },
            { uid: 2, type: 'bed', gx: 1, gz: 0, rot: 0 },
            { uid: 3, type: 'plant', gx: 11, gz: 0, rot: 0 },
            { uid: 4, type: 'sofa', gx: 4, gz: 9, rot: 2 },
        ],
    };
}

let game = makeDefaultGame();
let resetting = false;

function saveGame() {
    if (resetting) return;
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(game)); } catch (err) { console.error(err); }
}

function loadGame() {
    let raw = null;
    try { raw = localStorage.getItem(SAVE_KEY); } catch (err) { console.error(err); }
    game = makeDefaultGame();
    if (!raw) return;
    let p;
    try {
        p = JSON.parse(raw);
        if (!p || typeof p !== 'object') throw new Error('invalid save');
    } catch (err) {
        try { localStorage.setItem(SAVE_KEY + '_corrupted', raw); } catch (e) { }
        setTimeout(() => toast('セーブデータが壊れていたので初期化しました'), 0);
        return;
    }
    if (['auto', 'light', 'dark'].includes(p.appearance)) game.appearance = p.appearance;
    if (Array.isArray(p.items)) {
        const seen = new Set();
        game.items = p.items
            .filter(it => it && FURNITURE[it.type] && Number.isInteger(it.uid) && !seen.has(it.uid) && seen.add(it.uid))
            .map(it => {
                const item = { uid: it.uid, type: it.type, gx: toInt(it.gx), gz: toInt(it.gz), rot: ((toInt(it.rot) % 4) + 4) % 4 };
                clampItem(item);
                return item;
            });
    }
    const maxUid = game.items.reduce((m, it) => Math.max(m, it.uid), 0);
    game.nextUid = Math.max(toInt(p.nextUid), maxUid + 1);
    game.saveVersion = SAVE_VERSION;
}
function toInt(v) { const n = Math.round(Number(v)); return Number.isFinite(n) ? n : 0; }

// ---------- 配置の計算 ----------
function footprint(item) {
    const [w, d] = FURNITURE[item.type].size;
    return item.rot % 2 ? [d, w] : [w, d];
}
function clampItem(item) {
    const [fw, fd] = footprint(item);
    item.gx = Math.min(Math.max(item.gx, 0), N - fw);
    item.gz = Math.min(Math.max(item.gz, 0), N - fd);
}
function itemCenter(item) {
    const [fw, fd] = footprint(item);
    return new THREE.Vector3((item.gx + fw / 2) * CELL - HALF, 0, (item.gz + fd / 2) * CELL - HALF);
}
function overlaps(a, b) {
    const [aw, ad] = footprint(a), [bw, bd] = footprint(b);
    return a.gx < b.gx + bw && b.gx < a.gx + aw && a.gz < b.gz + bd && b.gz < a.gz + ad;
}
function isBlocked(item) {
    if (FURNITURE[item.type].flat) return false;
    return game.items.some(o => o.uid !== item.uid && !FURNITURE[o.type].flat && overlaps(item, o));
}
// 部屋の中心に近い、空いている場所を探す
function findFreeSpot(item) {
    const [fw, fd] = footprint(item);
    let best = null, bestDist = Infinity;
    for (let gz = 0; gz <= N - fd; gz++) {
        for (let gx = 0; gx <= N - fw; gx++) {
            const cand = { ...item, gx, gz };
            if (isBlocked(cand)) continue;
            const dist = (gx + fw / 2 - N / 2) ** 2 + (gz + fd / 2 - N / 2) ** 2;
            if (dist < bestDist) { bestDist = dist; best = { gx, gz }; }
        }
    }
    return best || { gx: Math.floor((N - fw) / 2), gz: Math.floor((N - fd) / 2) };
}

// ---------- 3D の場面 ----------
const canvas = document.getElementById('scene');
const view = document.getElementById('view');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100);
const cam = { azimuth: Math.PI / 4, polar: 0.95, radius: 12.5, target: new THREE.Vector3(0, 0.6, 0) };
const CAM_LIMITS = { polarMin: 0.25, polarMax: 1.35, radiusMin: 5, radiusMax: 22 };

scene.add(new THREE.HemisphereLight('#fffaf0', '#b9a58f', 1.6));
const sun = new THREE.DirectionalLight('#fff3e0', 1.8);
sun.position.set(4, 8, 5);
sun.castShadow = true;
sun.shadow.mapSize.set(1024, 1024);
Object.assign(sun.shadow.camera, { left: -5, right: 5, top: 5, bottom: -5, near: 1, far: 20 });
sun.shadow.bias = -0.0005;
sun.shadow.normalBias = 0.02;
scene.add(sun);

// 床
const floorTex = makeFloorTexture();
const floor = new THREE.Mesh(
    new THREE.BoxGeometry(N * CELL, 0.1, N * CELL),
    new THREE.MeshStandardMaterial({ map: floorTex, roughness: 0.9 })
);
floor.position.y = -0.05;
floor.receiveShadow = true;
scene.add(floor);

function makeFloorTexture() {
    const size = 512, cv = document.createElement('canvas');
    cv.width = cv.height = size;
    const ctx = cv.getContext('2d');
    const boards = 12;
    for (let i = 0; i < boards; i++) {
        const l = 62 + ((i * 37) % 7) - 3;
        ctx.fillStyle = `hsl(30 38% ${l}%)`;
        ctx.fillRect(0, i * size / boards, size, size / boards);
        ctx.fillStyle = 'rgba(80,50,30,.25)';
        ctx.fillRect(0, i * size / boards, size, 2);
        const cut = ((i * 211) % size);
        ctx.fillRect(cut, i * size / boards, 2, size / boards);
    }
    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    return tex;
}

// マス目（家具を選んでいる間だけ見せる）
const grid = new THREE.GridHelper(N * CELL, N, '#000000', '#000000');
grid.material.transparent = true;
grid.material.opacity = 0.12;
grid.position.y = 0.003;
grid.visible = false;
scene.add(grid);

// 壁: カメラ側の壁は隠す
const wallMat = new THREE.MeshStandardMaterial({ color: '#f1ece3', roughness: 0.95 });
const walls = [
    { normal: new THREE.Vector3(0, 0, -1), pos: [0, WALL_H / 2, -HALF - WALL_T / 2], size: [N * CELL + WALL_T * 2, WALL_H, WALL_T] },
    { normal: new THREE.Vector3(0, 0, 1), pos: [0, WALL_H / 2, HALF + WALL_T / 2], size: [N * CELL + WALL_T * 2, WALL_H, WALL_T] },
    { normal: new THREE.Vector3(-1, 0, 0), pos: [-HALF - WALL_T / 2, WALL_H / 2, 0], size: [WALL_T, WALL_H, N * CELL] },
    { normal: new THREE.Vector3(1, 0, 0), pos: [HALF + WALL_T / 2, WALL_H / 2, 0], size: [WALL_T, WALL_H, N * CELL] },
].map(w => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(...w.size), wallMat);
    m.position.set(...w.pos);
    m.receiveShadow = true;
    scene.add(m);
    // 幅木
    const base = new THREE.Mesh(new THREE.BoxGeometry(w.size[0] + 0.001, 0.08, w.size[2] + 0.03), mat('#cbbba6'));
    base.position.set(w.pos[0], 0.04, w.pos[2]);
    scene.add(base);
    return { ...w, mesh: m, base };
});

// 選んだ家具の足元の印
const markerMat = new THREE.MeshBasicMaterial({ color: '#d9774b', transparent: true, opacity: 0.35, depthWrite: false });
const marker = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), markerMat);
marker.rotation.x = -Math.PI / 2;
marker.position.y = 0.006;
marker.visible = false;
scene.add(marker);

const furnitureRoot = new THREE.Group();
scene.add(furnitureRoot);
const objects = new Map(); // uid → Group

function buildObject(item) {
    const def = FURNITURE[item.type];
    const g = new THREE.Group();
    def.build(g, def.color);
    g.userData.uid = item.uid;
    furnitureRoot.add(g);
    objects.set(item.uid, g);
    placeObject(item);
}
function placeObject(item) {
    const g = objects.get(item.uid);
    if (!g) return;
    const c = itemCenter(item);
    g.position.set(c.x, 0, c.z);
    g.rotation.y = -item.rot * Math.PI / 2;
    if (selectedUid === item.uid) updateMarker();
    requestRender();
}
function removeObject(uid) {
    const g = objects.get(uid);
    if (!g) return;
    furnitureRoot.remove(g);
    const shared = new Set(materialCache.values());
    g.traverse(o => {
        if (!o.isMesh) return;
        o.geometry.dispose();
        if (!shared.has(o.material)) o.material.dispose();
    });
    objects.delete(uid);
}
function rebuildAll() {
    for (const uid of [...objects.keys()]) removeObject(uid);
    game.items.forEach(buildObject);
    requestRender();
}

// ---------- カメラ ----------
function updateCamera() {
    cam.polar = Math.min(Math.max(cam.polar, CAM_LIMITS.polarMin), CAM_LIMITS.polarMax);
    cam.radius = Math.min(Math.max(cam.radius, CAM_LIMITS.radiusMin), CAM_LIMITS.radiusMax);
    const s = Math.sin(cam.polar);
    camera.position.set(
        cam.target.x + cam.radius * s * Math.sin(cam.azimuth),
        cam.target.y + cam.radius * Math.cos(cam.polar),
        cam.target.z + cam.radius * s * Math.cos(cam.azimuth)
    );
    camera.lookAt(cam.target);
    for (const w of walls) {
        const outside = camera.position.dot(w.normal) > HALF;
        w.mesh.visible = !outside;
        w.base.visible = !outside;
    }
    requestRender();
}

function resize() {
    const w = view.clientWidth, h = view.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    // 縦長の画面では部屋が収まるよう少し引く
    camera.fov = w / h < 0.8 ? 50 : 38;
    camera.updateProjectionMatrix();
    requestRender();
}
new ResizeObserver(resize).observe(view);

let renderQueued = false;
function requestRender() {
    if (renderQueued) return;
    renderQueued = true;
    requestAnimationFrame(() => { renderQueued = false; renderer.render(scene, camera); });
}

// ---------- 選択と操作 ----------
let selectedUid = null;
const toolbar = document.getElementById('toolbar');
const selName = document.getElementById('sel-name');
const hint = document.getElementById('hint');

function findItem(uid) { return game.items.find(it => it.uid === uid); }

function select(uid) {
    selectedUid = uid;
    const item = findItem(uid);
    toolbar.hidden = !item;
    grid.visible = !!item;
    if (item) {
        selName.textContent = FURNITURE[item.type].name;
        hint.classList.add('hidden');
    }
    updateMarker();
    requestRender();
}
function updateMarker() {
    const item = findItem(selectedUid);
    marker.visible = !!item;
    if (!item) return;
    const [fw, fd] = footprint(item);
    const c = itemCenter(item);
    marker.scale.set(fw * CELL, fd * CELL, 1);
    marker.position.x = c.x;
    marker.position.z = c.z;
    marker.position.y = FURNITURE[item.type].flat ? 0.02 : 0.006;
    markerMat.color.set(isBlocked(item) ? '#d9534f' : '#d9774b');
}

function addItem(type) {
    const item = { uid: game.nextUid++, type, gx: 0, gz: 0, rot: 0 };
    Object.assign(item, findFreeSpot(item));
    game.items.push(item);
    buildObject(item);
    select(item.uid);
    saveGame();
}
function rotateSelected() {
    const item = findItem(selectedUid);
    if (!item) return;
    const [fw, fd] = footprint(item);
    const cx = item.gx + fw / 2, cz = item.gz + fd / 2;
    item.rot = (item.rot + 1) % 4;
    const [nw, nd] = footprint(item);
    item.gx = Math.round(cx - nw / 2);
    item.gz = Math.round(cz - nd / 2);
    clampItem(item);
    placeObject(item);
    updateMarker();
    saveGame();
}
function removeSelected() {
    const item = findItem(selectedUid);
    if (!item) return;
    game.items = game.items.filter(it => it.uid !== item.uid);
    removeObject(item.uid);
    select(null);
    toast(`${FURNITURE[item.type].name}をしまいました`);
    saveGame();
}

document.getElementById('rotate-btn').addEventListener('click', rotateSelected);
document.getElementById('remove-btn').addEventListener('click', removeSelected);
document.getElementById('done-btn').addEventListener('click', () => select(null));
window.addEventListener('keydown', (e) => {
    if (document.querySelector('dialog[open]')) return;
    if (e.key === 'r' || e.key === 'R') rotateSelected();
    else if (e.key === 'Delete' || e.key === 'Backspace') removeSelected();
    else if (e.key === 'Escape') select(null);
});

// ---------- 指・マウスの操作 ----------
const raycaster = new THREE.Raycaster();
const floorPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const pointers = new Map(); // pointerId → {x, y}
let gesture = null;

function ndc(x, y) {
    const r = canvas.getBoundingClientRect();
    return new THREE.Vector2(((x - r.left) / r.width) * 2 - 1, -((y - r.top) / r.height) * 2 + 1);
}
function pickItem(x, y) {
    raycaster.setFromCamera(ndc(x, y), camera);
    const hits = raycaster.intersectObjects(furnitureRoot.children, true);
    let flatHit = null;
    for (const h of hits) {
        let o = h.object;
        while (o && o.userData.uid === undefined) o = o.parent;
        if (!o) continue;
        const item = findItem(o.userData.uid);
        if (!item) continue;
        if (!FURNITURE[item.type].flat) return item; // 敷物より上の家具を優先
        flatHit = flatHit || item;
    }
    return flatHit;
}
function floorPoint(x, y) {
    raycaster.setFromCamera(ndc(x, y), camera);
    return raycaster.ray.intersectPlane(floorPlane, new THREE.Vector3());
}
function pinchInfo() {
    const [a, b] = [...pointers.values()];
    return { dist: Math.hypot(a.x - b.x, a.y - b.y), angle: Math.atan2(b.y - a.y, b.x - a.x) };
}

canvas.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    e.preventDefault();
    canvas.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (pointers.size === 2) {
        if (gesture?.type === 'drag') saveGame();
        gesture = { type: 'pinch', ...pinchInfo() };
        return;
    }
    if (pointers.size > 2) return;

    const item = pickItem(e.clientX, e.clientY);
    const p = floorPoint(e.clientX, e.clientY);
    if (item && p) {
        select(item.uid);
        const c = itemCenter(item);
        gesture = { type: 'drag', uid: item.uid, offX: c.x - p.x, offZ: c.z - p.z, startX: e.clientX, startY: e.clientY, moved: false };
    } else {
        gesture = { type: 'orbit', lastX: e.clientX, lastY: e.clientY, startX: e.clientX, startY: e.clientY, moved: false };
    }
});

canvas.addEventListener('pointermove', (e) => {
    if (!pointers.has(e.pointerId)) return;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (!gesture) return;

    if (gesture.type === 'pinch' && pointers.size >= 2) {
        const now = pinchInfo();
        if (now.dist > 0 && gesture.dist > 0) cam.radius *= gesture.dist / now.dist;
        cam.azimuth -= (now.angle - gesture.angle);
        Object.assign(gesture, now);
        updateCamera();
    } else if (gesture.type === 'orbit') {
        const dx = e.clientX - gesture.lastX, dy = e.clientY - gesture.lastY;
        gesture.lastX = e.clientX; gesture.lastY = e.clientY;
        if (!gesture.moved && Math.hypot(e.clientX - gesture.startX, e.clientY - gesture.startY) > 6) {
            gesture.moved = true;
            hint.classList.add('hidden');
        }
        cam.azimuth -= dx * 0.008;
        cam.polar -= dy * 0.006;
        updateCamera();
    } else if (gesture.type === 'drag') {
        if (Math.hypot(e.clientX - gesture.startX, e.clientY - gesture.startY) > 4) gesture.moved = true;
        if (!gesture.moved) return;
        const item = findItem(gesture.uid);
        const p = floorPoint(e.clientX, e.clientY);
        if (!item || !p) return;
        const [fw, fd] = footprint(item);
        const gx = Math.round((p.x + gesture.offX + HALF) / CELL - fw / 2);
        const gz = Math.round((p.z + gesture.offZ + HALF) / CELL - fd / 2);
        if (gx !== item.gx || gz !== item.gz) {
            item.gx = gx; item.gz = gz;
            clampItem(item);
            placeObject(item);
        }
    }
});

function endPointer(e) {
    if (!pointers.has(e.pointerId)) return;
    pointers.delete(e.pointerId);
    if (!gesture) return;
    if (gesture.type === 'drag') {
        if (gesture.moved) saveGame();
        gesture = null;
    } else if (gesture.type === 'orbit') {
        if (!gesture.moved && e.type === 'pointerup') select(null); // 何もない所をタップしたら選択をやめる
        gesture = null;
    } else if (gesture.type === 'pinch') {
        // 1 本残ったら、そこから回転を続ける（飛ばないように位置を取り直す）
        const rest = [...pointers.values()][0];
        gesture = rest ? { type: 'orbit', lastX: rest.x, lastY: rest.y, startX: rest.x, startY: rest.y, moved: true } : null;
    }
}
canvas.addEventListener('pointerup', endPointer);
canvas.addEventListener('pointercancel', endPointer);
canvas.addEventListener('contextmenu', (e) => e.preventDefault());
window.addEventListener('blur', () => { pointers.clear(); if (gesture?.type === 'drag') saveGame(); gesture = null; });
canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    cam.radius *= Math.exp(e.deltaY * 0.001);
    updateCamera();
}, { passive: false });

// ---------- 家具の一覧 ----------
function renderCatalog() {
    const wrap = document.getElementById('items');
    wrap.innerHTML = '';
    for (const [type, def] of Object.entries(FURNITURE)) {
        const b = document.createElement('button');
        b.className = 'item';
        b.dataset.type = type;
        b.innerHTML = `<span class="swatch"></span><span class="label"></span>`;
        b.querySelector('.swatch').textContent = def.icon;
        b.querySelector('.swatch').style.background = def.color + '55';
        b.querySelector('.label').textContent = def.name;
        b.addEventListener('click', () => addItem(type));
        wrap.appendChild(b);
    }
}

// ---------- 明るさ ----------
const darkQuery = matchMedia('(prefers-color-scheme: dark)');
function applyAppearance() {
    const a = game.appearance;
    if (a === 'light' || a === 'dark') document.documentElement.dataset.theme = a;
    else delete document.documentElement.dataset.theme;
    const css = getComputedStyle(document.documentElement);
    document.querySelector('meta[name="theme-color"]').content = css.getPropertyValue('--bg').trim();
    scene.background = new THREE.Color(css.getPropertyValue('--scene-bg').trim() || '#e9e3d8');
    requestRender();
}
darkQuery.addEventListener('change', applyAppearance);

// ---------- 設定 ----------
const menu = document.getElementById('menu');
document.getElementById('menu-btn').addEventListener('click', () => {
    menu.querySelectorAll('input[name="appearance"]').forEach(r => { r.checked = r.value === game.appearance; });
    if (menu.showModal) menu.showModal();
});
document.getElementById('menu-close').addEventListener('click', () => menu.close());
menu.addEventListener('click', (e) => { if (e.target === menu) menu.close(); });
menu.querySelectorAll('input[name="appearance"]').forEach(r => r.addEventListener('change', () => {
    game.appearance = r.value;
    applyAppearance();
    saveGame();
}));
document.getElementById('clear-room-btn').addEventListener('click', () => {
    if (!confirm('部屋の家具を全部しまいますか？')) return;
    game.items = [];
    select(null);
    rebuildAll();
    saveGame();
    menu.close();
});
document.getElementById('reset-btn').addEventListener('click', () => {
    if (!confirm('全てのデータを消しますか？（元に戻せません）')) return;
    resetting = true;
    [SAVE_KEY, SAVE_KEY + '_corrupted'].forEach(k => { try { localStorage.removeItem(k); } catch (e) { } });
    location.reload();
});

// ---------- 通知 ----------
let toastTimer = 0;
function toast(msg) {
    const t = document.getElementById('toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('show'), 1800);
}

// ---------- 起動 ----------
loadGame();
applyAppearance();
renderCatalog();
rebuildAll();
updateCamera();
resize();
document.getElementById('version').textContent = `v${APP_VERSION}`;

setInterval(saveGame, 10000);
window.addEventListener('beforeunload', saveGame);
document.addEventListener('visibilitychange', () => { if (document.hidden) saveGame(); });

if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
    navigator.serviceWorker.register('sw.js').catch(err => console.error(err));
}

// テストから使う
window.__lifemaker = {
    game: () => game, selected: () => selectedUid, cam, addItem, rotateSelected, removeSelected, select, isBlocked, footprint, APP_VERSION, FURNITURE,
    // 家具の中心が画面のどこに映るか（クライアント座標）
    screenOf(uid) {
        const item = findItem(uid);
        const p = itemCenter(item);
        p.y = 0.3;
        p.project(camera);
        const r = canvas.getBoundingClientRect();
        return { x: r.left + (p.x + 1) / 2 * r.width, y: r.top + (1 - p.y) / 2 * r.height };
    },
};
