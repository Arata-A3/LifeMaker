import * as THREE from '../lib/three.module.min.js';

const APP_VERSION = '0.3.0';
const SAVE_KEY = 'lifemaker_save';
const SAVE_VERSION = 2; // 2: 家具の色を部位ごとに、床と壁を追加

// 部屋の大きさ: 1 マス 0.5m、12×12 マス（6m 四方）
const CELL = 0.5;
const N = 12;
const HALF = N * CELL / 2;
const WALL_H = 2.6;
const WALL_T = 0.1;

// ---------- 家具の定義 ----------
// size: [横, 奥行き]（マス）。正面は +z。build(g, c) は足元の中心を原点に作る。
// slots: 色を変えられる部位。c.<key> にその部位の色が入る。最初の部位が一覧の見本の色。
// 面がぴったり重なるとチラつくので、部品どうしは少し（2〜5mm）ずらして重ねる。
const FURNITURE = {
    bed: {
        name: 'ベッド', icon: '🛏', size: [2, 4], tags: ['寝る', '寝室', 'ナチュラル', '木'],
        slots: [['main', '掛け布団', '#7fa7c9'], ['frame', 'フレーム', '#a8794f'], ['sheet', 'シーツ・枕', '#f4f1ea']],
        build(g, c) {
            box(g, 1.0, 0.3, 2.0, c.frame, 0, 0, 0);
            box(g, 1.02, 0.8, 0.08, c.frame, 0, 0, -0.965);
            box(g, 0.94, 0.18, 1.9, c.sheet, 0, 0.3, 0);
            box(g, 0.6, 0.1, 0.3, shade(c.sheet, 0.05), 0, 0.48, -0.72);
            box(g, 0.98, 0.07, 1.25, c.main, 0, 0.46, 0.32);
        },
    },
    sofa: {
        name: 'ソファ', icon: '🛋', size: [4, 2], tags: ['座る', 'リビング', 'ナチュラル', '布'],
        slots: [['main', '布', '#8aa58c'], ['cushion', 'クッション', '#a7bea8'], ['legs', '脚', '#5b4636']],
        build(g, c) {
            box(g, 1.9, 0.4, 0.86, c.main, 0, 0.06, 0);
            box(g, 1.88, 0.5, 0.2, c.main, 0, 0.36, -0.325);
            box(g, 0.18, 0.26, 0.86, c.main, -0.86, 0.46, 0);
            box(g, 0.18, 0.26, 0.86, c.main, 0.86, 0.46, 0);
            box(g, 0.74, 0.1, 0.6, c.cushion, -0.38, 0.46, 0.08);
            box(g, 0.74, 0.1, 0.6, c.cushion, 0.38, 0.46, 0.08);
            for (const x of [-0.85, 0.85]) for (const z of [-0.36, 0.36]) box(g, 0.06, 0.06, 0.06, c.legs, x, 0, z);
        },
    },
    chair: {
        name: 'いす', icon: '🪑', size: [1, 1], tags: ['座る', 'ダイニング', 'ナチュラル', '木'],
        slots: [['main', '木', '#b98b5e'], ['seat', '座面', '#b98b5e']],
        build(g, c) {
            for (const x of [-0.17, 0.17]) for (const z of [-0.17, 0.17]) box(g, 0.04, 0.42, 0.04, c.main, x, 0, z);
            box(g, 0.42, 0.05, 0.42, c.seat, 0, 0.42, 0);
            box(g, 0.04, 0.45, 0.04, c.main, -0.17, 0.47, -0.19);
            box(g, 0.04, 0.45, 0.04, c.main, 0.17, 0.47, -0.19);
            box(g, 0.42, 0.16, 0.03, c.main, 0, 0.74, -0.19);
        },
    },
    table: {
        name: 'テーブル', icon: '🍽', size: [3, 2], tags: ['テーブル', 'ダイニング', 'ナチュラル', '木'],
        slots: [['main', '天板', '#c89a6a'], ['legs', '脚', '#a07a50']],
        build(g, c) {
            box(g, 1.4, 0.05, 0.9, c.main, 0, 0.68, 0);
            for (const x of [-0.62, 0.62]) for (const z of [-0.37, 0.37]) box(g, 0.06, 0.68, 0.06, c.legs, x, 0, z);
        },
    },
    lowtable: {
        name: 'ローテーブル', icon: '☕', size: [2, 2], tags: ['テーブル', 'リビング', 'シンプル'],
        slots: [['main', '天板', '#e8e1d5'], ['base', '脚', '#6b5847']],
        build(g, c) {
            cyl(g, 0.42, 0.42, 0.04, c.main, 0, 0.34, 0, 32);
            cyl(g, 0.05, 0.05, 0.335, c.base, 0, 0.005, 0, 12);
            cyl(g, 0.22, 0.22, 0.02, c.base, 0, 0, 0, 24);
        },
    },
    bookshelf: {
        name: '本棚', icon: '📚', size: [2, 1], tags: ['収納', '書斎', 'ナチュラル', '木'],
        slots: [['main', '本棚', '#9c7350'], ['back', '背板', '#7c5a3e']],
        build(g, c) {
            const W = 0.94, D = 0.4, H = 1.8, z = -0.04;
            box(g, 0.03, H, D, c.main, -W / 2 + 0.015, 0, z);
            box(g, 0.03, H, D, c.main, W / 2 - 0.015, 0, z);
            box(g, W + 0.01, 0.03, D + 0.01, c.main, 0, H, z);
            box(g, W - 0.064, H - 0.01, 0.02, c.back, 0, 0.005, z - D / 2 + 0.012);
            const bookColors = ['#c45c4a', '#4a7cc4', '#e3b34c', '#5d9c6a', '#8a6bb8', '#e8e1d5'];
            let k = 0;
            for (let i = 0; i < 4; i++) {
                const y = i * 0.44;
                box(g, W - 0.062, 0.03, D - 0.004, c.main, 0, y, z + 0.002);
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
        name: 'クローゼット', icon: '🚪', size: [2, 1], tags: ['収納', '寝室', 'シンプル'],
        slots: [['main', '本体', '#e5dccd'], ['handle', '取っ手', '#8a7a66'], ['plinth', '台座', '#bfae93']],
        build(g, c) {
            box(g, 0.9, 0.08, 0.42, c.plinth, 0, 0, -0.02);           // 台座は本体より少し内側
            box(g, 0.94, 1.82, 0.46, c.main, 0, 0.08, -0.01);         // 本体は台座の上に載せる
            box(g, 0.006, 1.66, 0.006, shade(c.main, -0.25), 0, 0.16, 0.223);
            box(g, 0.02, 0.18, 0.03, c.handle, -0.05, 0.95, 0.235);
            box(g, 0.02, 0.18, 0.03, c.handle, 0.05, 0.95, 0.235);
        },
    },
    tvstand: {
        name: 'テレビ台', icon: '📺', size: [3, 1], tags: ['収納', '家電', 'リビング', 'シンプル'],
        slots: [['main', '台', '#6f5a48'], ['tv', 'テレビ', '#2b2b2e']],
        build(g, c) {
            box(g, 1.4, 0.42, 0.42, c.main, 0, 0, 0);
            box(g, 0.6, 0.006, 0.006, shade(c.main, -0.2), -0.3, 0.2, 0.213);
            box(g, 0.3, 0.03, 0.18, c.tv, 0, 0.42, -0.04);
            box(g, 0.05, 0.12, 0.03, c.tv, 0, 0.45, -0.04);
            box(g, 1.1, 0.64, 0.04, c.tv, 0, 0.55, -0.04);
            box(g, 1.04, 0.58, 0.005, '#16181d', 0, 0.58, -0.017);
        },
    },
    plant: {
        name: '観葉植物', icon: '🪴', size: [1, 1], tags: ['植物', 'ナチュラル', '小物'],
        slots: [['main', '葉', '#5f9e5a'], ['pot', '鉢', '#c47a52']],
        build(g, c) {
            cyl(g, 0.15, 0.11, 0.3, c.pot, 0, 0, 0, 16);
            ball(g, 0.2, c.main, 0, 0.55, 0);
            ball(g, 0.15, shade(c.main, 0.1), 0.1, 0.72, 0.05);
            ball(g, 0.13, shade(c.main, -0.1), -0.1, 0.68, -0.06);
        },
    },
    lamp: {
        name: 'スタンドライト', icon: '💡', size: [1, 1], tags: ['照明', 'リビング', 'シンプル'],
        slots: [['main', 'かさ', '#f3e3b8'], ['pole', '柱と台', '#3a3633']],
        build(g, c) {
            cyl(g, 0.13, 0.13, 0.03, c.pole, 0, 0, 0, 20);
            cyl(g, 0.015, 0.015, 1.35, c.pole, 0, 0.03, 0, 8);
            const shadeMesh = cyl(g, 0.11, 0.18, 0.24, c.main, 0, 1.3, 0, 24);
            shadeMesh.material.emissive = new THREE.Color(c.main);
            shadeMesh.material.emissiveIntensity = 0.35;
        },
    },
    rug: {
        name: 'ラグ', icon: '🟫', size: [4, 3], tags: ['敷物', 'リビング', '布'], flat: true,
        slots: [['main', '外側', '#c98c6b'], ['inner', '内側', '#d9a88d']],
        build(g, c) {
            box(g, 1.9, 0.012, 1.4, c.main, 0, 0, 0);
            box(g, 1.6, 0.014, 1.1, c.inner, 0, 0, 0);
        },
    },
};
// 部位を { key, name, color } の形にし、見本の色（最初の部位）を color に置く
for (const def of Object.values(FURNITURE)) {
    def.slots = def.slots.map(([key, name, color]) => ({ key, name, color }));
    def.color = def.slots[0].color;
}

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
// 床と壁の柄。color: 柄の元の色（ユーザーが色を決めていないときに使う）
const FLOOR_PATTERNS = {
    wood: { name: 'フローリング', color: '#c89a6a' },
    tile: { name: 'タイル', color: '#e6e1d8' },
    carpet: { name: 'カーペット', color: '#9fa9b5' },
    tatami: { name: '畳', color: '#c7c08a' },
};
const WALL_PATTERNS = {
    plain: { name: '無地', color: '#f1ece3' },
    stripe: { name: 'ストライプ', color: '#e9e0cf' },
    brick: { name: 'レンガ', color: '#b9765a' },
    wainscot: { name: '腰壁', color: '#f1ece3' },
};

function makeDefaultGame() {
    return {
        saveVersion: SAVE_VERSION,
        appearance: 'auto',
        nextUid: 5,
        items: [
            { uid: 1, type: 'rug', gx: 4, gz: 5, rot: 0, colors: {} },
            { uid: 2, type: 'bed', gx: 1, gz: 0, rot: 0, colors: {} },
            { uid: 3, type: 'plant', gx: 11, gz: 0, rot: 0, colors: {} },
            { uid: 4, type: 'sofa', gx: 4, gz: 9, rot: 2, colors: {} },
        ],
        floor: { pattern: 'wood', color: null }, // color: null は柄の元の色
        wall: { pattern: 'plain', color: null },
        recentColors: [],
        presets: [], // { id, name, savedAt, items, floor, wall }
        nextPresetId: 1,
    };
}
const MAX_RECENT = 8;
const MAX_PRESETS = 30;

function normHex(v) {
    return typeof v === 'string' && /^#[0-9a-fA-F]{6}$/.test(v) ? v.toLowerCase() : null;
}
// 部位ごとの色。決めた色だけを持つ（決めていない部位は元の色）
function sanitizeColors(type, colors, oldColor) {
    const out = {};
    const keys = FURNITURE[type].slots.map(s => s.key);
    if (colors && typeof colors === 'object') {
        for (const k of keys) { const h = normHex(colors[k]); if (h) out[k] = h; }
    }
    const old = normHex(oldColor); // v0.2.0 までは 1 色だけ（color）だった
    if (old && !out[keys[0]]) out[keys[0]] = old;
    return out;
}
// 家具の一覧の形をそろえる。重複・知らない家具を除き、部屋からはみ出すものは中に入れる
function sanitizeItems(list) {
    if (!Array.isArray(list)) return [];
    const seen = new Set();
    return list
        .filter(it => it && FURNITURE[it.type] && Number.isInteger(it.uid) && !seen.has(it.uid) && seen.add(it.uid))
        .map(it => {
            const item = { uid: it.uid, type: it.type, gx: toInt(it.gx), gz: toInt(it.gz), rot: ((toInt(it.rot) % 4) + 4) % 4, colors: sanitizeColors(it.type, it.colors, it.color) };
            clampItem(item);
            return item;
        });
}
function sanitizeSurface(v, patterns, fallback) {
    const pattern = v && patterns[v.pattern] ? v.pattern : fallback;
    return { pattern, color: normHex(v && v.color) };
}
function slotColor(item, key) {
    return item.colors[key] || FURNITURE[item.type].slots.find(s => s.key === key).color;
}
function colorsFor(item) {
    const c = {};
    for (const s of FURNITURE[item.type].slots) c[s.key] = item.colors[s.key] || s.color;
    return c;
}
function surfaceColor(kind) {
    const v = game[kind];
    return v.color || (kind === 'floor' ? FLOOR_PATTERNS : WALL_PATTERNS)[v.pattern].color;
}

let game = makeDefaultGame();
let resetting = false;

function saveGame() {
    if (resetting) return;
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(game)); } catch (err) { console.error(err); }
    recordHistory();
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
    if (Array.isArray(p.items)) game.items = sanitizeItems(p.items);
    const maxUid = game.items.reduce((m, it) => Math.max(m, it.uid), 0);
    game.nextUid = Math.max(toInt(p.nextUid), maxUid + 1);
    game.floor = sanitizeSurface(p.floor, FLOOR_PATTERNS, 'wood');
    game.wall = sanitizeSurface(p.wall, WALL_PATTERNS, 'plain');
    if (Array.isArray(p.recentColors)) game.recentColors = [...new Set(p.recentColors.map(normHex).filter(Boolean))].slice(0, MAX_RECENT);
    if (Array.isArray(p.presets)) {
        const ids = new Set();
        game.presets = p.presets
            .filter(ps => ps && Number.isInteger(ps.id) && !ids.has(ps.id) && ids.add(ps.id))
            .map(ps => ({
                id: ps.id, name: String(ps.name || 'プリセット').slice(0, 30), savedAt: Number(ps.savedAt) || 0,
                items: sanitizeItems(ps.items),
                floor: sanitizeSurface(ps.floor, FLOOR_PATTERNS, 'wood'),
                wall: sanitizeSurface(ps.wall, WALL_PATTERNS, 'plain'),
            }))
            .slice(0, MAX_PRESETS);
    }
    const maxPreset = game.presets.reduce((m, ps) => Math.max(m, ps.id), 0);
    game.nextPresetId = Math.max(toInt(p.nextPresetId), maxPreset + 1);
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

// 床（柄は canvas に描いて貼る）
const floorMat = new THREE.MeshStandardMaterial({ roughness: 0.9 });
const floor = new THREE.Mesh(new THREE.BoxGeometry(N * CELL, 0.1, N * CELL), floorMat);
floor.position.y = -0.05;
floor.receiveShadow = true;
scene.add(floor);

// 色を明るく・暗くする（dl は明るさの % の差）
function tone(hex, dl) {
    const [h, s, l] = hexToHslFloat(hex);
    return hslToHex(h, s, Math.min(100, Math.max(0, l + dl)));
}
// 決まった乱数（毎回同じ柄になるように）
function seeded(seed) {
    let x = seed >>> 0 || 1;
    return () => { x ^= x << 13; x >>>= 0; x ^= x >>> 17; x ^= x << 5; x >>>= 0; return x / 4294967296; };
}
function canvasTexture(cv) {
    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    return tex;
}

// 床の柄。canvas の 1 辺 = 部屋の 1 辺（6m）
function drawFloor(pattern, color) {
    const size = 1024, cv = document.createElement('canvas');
    cv.width = cv.height = size;
    const ctx = cv.getContext('2d');
    const rnd = seeded(7);
    const px = size / (N * CELL); // 1m あたりのピクセル
    if (pattern === 'wood') {
        const boards = 24; // 幅 25cm の板
        const bh = size / boards;
        for (let i = 0; i < boards; i++) {
            let x = -rnd() * size * 0.5;
            while (x < size) {
                const len = px * (1.2 + rnd() * 0.8);
                ctx.fillStyle = tone(color, (rnd() - 0.5) * 8);
                ctx.fillRect(x, i * bh, len, bh);
                ctx.fillStyle = tone(color, -22);
                ctx.fillRect(x, i * bh, 2, bh);
                x += len;
            }
            ctx.fillStyle = tone(color, -22);
            ctx.fillRect(0, i * bh, size, 2);
        }
    } else if (pattern === 'tile') {
        const n = N; // 50cm のタイル
        const t = size / n;
        ctx.fillStyle = tone(color, -18);
        ctx.fillRect(0, 0, size, size);
        for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
            ctx.fillStyle = tone(color, (rnd() - 0.5) * 4);
            ctx.fillRect(i * t + 2, j * t + 2, t - 4, t - 4);
        }
    } else if (pattern === 'carpet') {
        ctx.fillStyle = color;
        ctx.fillRect(0, 0, size, size);
        for (let k = 0; k < 26000; k++) {
            ctx.fillStyle = tone(color, (rnd() - 0.5) * 14);
            ctx.fillRect(rnd() * size, rnd() * size, 2, 2);
        }
    } else if (pattern === 'tatami') {
        // 1.5m 四方のかたまりに 2 枚ずつ。かたまりごとに向きを変える
        const blk = size / 4;
        const edge = tone(color, -45);
        const drawMat = (x, y, w, h, vertical) => {
            ctx.fillStyle = color;
            ctx.fillRect(x, y, w, h);
            ctx.fillStyle = tone(color, -6);
            if (vertical) for (let yy = y; yy < y + h; yy += 4) ctx.fillRect(x, yy, w, 1);
            else for (let xx = x; xx < x + w; xx += 4) ctx.fillRect(xx, y, 1, h);
            ctx.fillStyle = edge; // 縁（へり）
            if (vertical) { ctx.fillRect(x, y, 5, h); ctx.fillRect(x + w - 5, y, 5, h); }
            else { ctx.fillRect(x, y, w, 5); ctx.fillRect(x, y + h - 5, w, 5); }
            ctx.fillStyle = tone(color, -25);
            ctx.strokeStyle = tone(color, -25);
            ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
        };
        for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) {
            const x = i * blk, y = j * blk;
            if ((i + j) % 2) { drawMat(x, y, blk, blk / 2, false); drawMat(x, y + blk / 2, blk, blk / 2, false); }
            else { drawMat(x, y, blk / 2, blk, true); drawMat(x + blk / 2, y, blk / 2, blk, true); }
        }
    }
    return canvasTexture(cv);
}

// 壁の柄。横 = 6m、縦 = 2.6m
function drawWall(pattern, color) {
    const w = 1024, h = Math.round(1024 * WALL_H / (N * CELL));
    const cv = document.createElement('canvas');
    cv.width = w; cv.height = h;
    const ctx = cv.getContext('2d');
    const rnd = seeded(11);
    const px = w / (N * CELL);
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, w, h);
    if (pattern === 'plain') {
        for (let k = 0; k < 6000; k++) {
            ctx.fillStyle = tone(color, (rnd() - 0.5) * 3);
            ctx.fillRect(rnd() * w, rnd() * h, 2, 2);
        }
    } else if (pattern === 'stripe') {
        const sw = px * 0.12;
        ctx.fillStyle = tone(color, -7);
        for (let x = 0; x < w; x += sw * 3) ctx.fillRect(x, 0, sw, h);
    } else if (pattern === 'brick') {
        const bw = px * 0.24, bh = px * 0.075, gap = 2;
        ctx.fillStyle = tone(color, 25);
        ctx.fillRect(0, 0, w, h);
        for (let row = 0, y = h; y > -bh; row++, y -= bh) {
            for (let x = row % 2 ? -bw / 2 : 0; x < w; x += bw) {
                ctx.fillStyle = tone(color, (rnd() - 0.5) * 12);
                ctx.fillRect(x + gap / 2, y - bh + gap / 2, bw - gap, bh - gap);
            }
        }
    } else if (pattern === 'wainscot') {
        const ph = px * 0.9; // 床から 90cm の腰板
        const panel = tone(color, -10);
        ctx.fillStyle = panel;
        ctx.fillRect(0, h - ph, w, ph);
        ctx.fillStyle = tone(color, -22);
        for (let x = 0; x < w; x += px * 0.6) ctx.fillRect(x, h - ph, 2, ph);
        ctx.fillStyle = tone(color, 4);
        ctx.fillRect(0, h - ph - 6, w, 6);
        ctx.fillStyle = tone(color, -25);
        ctx.fillRect(0, h - ph, w, 2);
    }
    return canvasTexture(cv);
}

function applySurfaces() {
    if (floorMat.map) floorMat.map.dispose();
    floorMat.map = drawFloor(game.floor.pattern, surfaceColor('floor'));
    floorMat.needsUpdate = true;
    if (wallMat.map) wallMat.map.dispose();
    wallMat.map = drawWall(game.wall.pattern, surfaceColor('wall'));
    wallMat.needsUpdate = true;
    requestRender();
}

// マス目（家具を選んでいる間だけ見せる）
const grid = new THREE.GridHelper(N * CELL, N, '#000000', '#000000');
grid.material.transparent = true;
grid.material.opacity = 0.12;
grid.position.y = 0.003;
grid.visible = false;
scene.add(grid);

// 壁: カメラ側の壁は隠す
const wallMat = new THREE.MeshStandardMaterial({ roughness: 0.95 });
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
    def.build(g, colorsFor(item));
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
function rebuildObject(item) {
    removeObject(item.uid);
    buildObject(item);
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
    if (viewShift) camera.setViewOffset(w, h, 0, viewShift, w, h);
    else camera.clearViewOffset();
    camera.updateProjectionMatrix();
    requestRender();
}
let viewShift = 0; // 画面の下が隠れているとき、映す範囲を下にずらす量（px）
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
    const item = { uid: game.nextUid++, type, gx: 0, gz: 0, rot: 0, colors: {} };
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
    toast(`${FURNITURE[item.type].name}をしまいました（↶ で戻せます）`);
    saveGame();
}

document.getElementById('rotate-btn').addEventListener('click', rotateSelected);
document.getElementById('remove-btn').addEventListener('click', removeSelected);
document.getElementById('done-btn').addEventListener('click', () => select(null));
window.addEventListener('keydown', (e) => {
    if (document.querySelector('dialog[open]')) return;
    if (e.target.closest && e.target.closest('input, textarea')) return;
    if (e.key === 'r' || e.key === 'R') rotateSelected();
    else if (e.key === 'Delete' || e.key === 'Backspace') removeSelected();
    else if (e.key === 'Escape') select(null);
});

// ---------- 指・マウスの操作 ----------
const raycaster = new THREE.Raycaster();
const floorPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const pointers = new Map(); // pointerId → {x, y}
let gesture = null;
const DOUBLE_TAP_MS = 350;
let lastTap = null; // { uid, time, x, y }

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
        if (Math.hypot(e.clientX - gesture.startX, e.clientY - gesture.startY) > (e.pointerType === 'touch' ? 8 : 4)) gesture.moved = true;
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
        if (gesture.moved) {
            saveGame();
            lastTap = null;
        } else if (e.type === 'pointerup') {
            // 同じ家具を素早く 2 回タップしたら回す
            const now = performance.now();
            if (lastTap && lastTap.uid === gesture.uid && now - lastTap.time < DOUBLE_TAP_MS && Math.hypot(e.clientX - lastTap.x, e.clientY - lastTap.y) < 30) {
                rotateSelected();
                lastTap = null;
            } else {
                lastTap = { uid: gesture.uid, time: now, x: e.clientX, y: e.clientY };
            }
        }
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
// 絞り込み: 名前・タグの文字で探す ＋ タグを 1 つ選ぶ
const filter = { text: '', tag: null };
const ALL_TAGS = [...new Set(Object.values(FURNITURE).flatMap(d => d.tags))];
const searchBox = document.getElementById('search');

function normText(s) {
    // ひらがなとカタカナを同じに扱う
    return s.trim().toLowerCase().replace(/[ァ-ヶ]/g, ch => String.fromCharCode(ch.charCodeAt(0) - 0x60));
}
function matchesFilter(def) {
    if (filter.tag && !def.tags.includes(filter.tag)) return false;
    const q = normText(filter.text);
    if (!q) return true;
    return [def.name, ...def.tags].some(s => normText(s).includes(q));
}
function renderTags() {
    const wrap = document.getElementById('tags');
    wrap.innerHTML = '';
    for (const tag of [null, ...ALL_TAGS]) {
        const b = document.createElement('button');
        b.className = 'tag';
        b.textContent = tag ?? 'すべて';
        b.setAttribute('aria-pressed', String(filter.tag === tag));
        b.addEventListener('click', () => {
            filter.tag = filter.tag === tag ? null : tag;
            renderTags();
            renderCatalog();
        });
        wrap.appendChild(b);
    }
}
function renderCatalog() {
    const wrap = document.getElementById('items');
    wrap.innerHTML = '';
    let shown = 0;
    for (const [type, def] of Object.entries(FURNITURE)) {
        if (!matchesFilter(def)) continue;
        const b = document.createElement('button');
        b.className = 'item';
        b.dataset.type = type;
        b.innerHTML = `<span class="swatch"></span><span class="label"></span>`;
        b.querySelector('.swatch').textContent = def.icon;
        b.querySelector('.swatch').style.background = def.color + '55';
        b.querySelector('.label').textContent = def.name;
        b.title = def.tags.join('・');
        b.addEventListener('click', () => addItem(type));
        wrap.appendChild(b);
        shown++;
    }
    if (!shown) {
        const p = document.createElement('p');
        p.className = 'empty';
        p.textContent = '見つかりません';
        wrap.appendChild(p);
    }
}
searchBox.addEventListener('input', () => { filter.text = searchBox.value; renderCatalog(); });
searchBox.addEventListener('keydown', (e) => { if (e.key === 'Enter') searchBox.blur(); });

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

// ---------- 色 ----------
// 家具の色の候補（ナチュラル・パステル・はっきりした色・モノトーン）
const PALETTE = [
    '#f4f1ea', '#e5dccd', '#c89a6a', '#9c7350', '#6f5a48', '#3a3633',
    '#f2c4c4', '#f6dfa8', '#c9e2bf', '#bcd7ea', '#d4c6e8', '#f3d1b5',
    '#d9534f', '#e8a33d', '#5f9e5a', '#4a7cc4', '#8a6bb8', '#2f6f6a',
];

function hslToHex(h, s, l) {
    s /= 100; l /= 100;
    const k = n => (n + h / 30) % 12;
    const a = s * Math.min(l, 1 - l);
    const f = n => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
    const to = x => Math.round(x * 255).toString(16).padStart(2, '0');
    return `#${to(f(0))}${to(f(8))}${to(f(4))}`;
}
function hexToHslFloat(hex) {
    const r = parseInt(hex.slice(1, 3), 16) / 255, g = parseInt(hex.slice(3, 5), 16) / 255, b = parseInt(hex.slice(5, 7), 16) / 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2, d = max - min;
    let h = 0, s = 0;
    if (d) {
        s = d / (1 - Math.abs(2 * l - 1));
        if (max === r) h = 60 * (((g - b) / d) % 6);
        else if (max === g) h = 60 * ((b - r) / d + 2);
        else h = 60 * ((r - g) / d + 4);
    }
    return [(h + 360) % 360, s * 100, l * 100];
}
// スライダーで作った色と数値の組を覚えておく（開き直したとき数値がずれないように）
const hslMemo = new Map();
function hslOf(hex) {
    if (hslMemo.has(hex)) return hslMemo.get(hex);
    const [hf, sf, lf] = hexToHslFloat(hex);
    let best = null, bestD = Infinity;
    const tryHsl = (h, s, l) => {
        h = ((h % 360) + 360) % 360;
        if (s < 0 || s > 100 || l < 0 || l > 100 || hslToHex(h, s, l) !== hex) return;
        const dh = Math.min(Math.abs(h - hf), 360 - Math.abs(h - hf));
        const d = dh * dh + (s - sf) ** 2 + (l - lf) ** 2;
        if (d < bestD) { bestD = d; best = [h, s, l]; }
    };
    const H = Math.round(hf), S = Math.round(sf), Lr = Math.round(lf);
    for (let dh = -2; dh <= 2; dh++) for (let ds = -2; ds <= 2; ds++) for (let dl = -2; dl <= 2; dl++) tryHsl(H + dh, S + ds, Lr + dl);
    if (!best) for (let dh = -2; dh <= 2; dh++) for (let s = 0; s <= 100; s++) for (let dl = -2; dl <= 2; dl++) tryHsl(H + dh, s, Lr + dl);
    return best || [H % 360, S, Lr];
}

// 色を変える対象: { kind: 'item', uid, slot } / { kind: 'floor' } / { kind: 'wall' }
function targetGet(t) {
    if (t.kind === 'item') { const it = findItem(t.uid); return it ? it.colors[t.slot] || null : null; }
    return game[t.kind].color;
}
function targetDefault(t) {
    if (t.kind === 'item') { const it = findItem(t.uid); return FURNITURE[it.type].slots.find(s => s.key === t.slot).color; }
    return (t.kind === 'floor' ? FLOOR_PATTERNS : WALL_PATTERNS)[game[t.kind].pattern].color;
}
function targetShown(t) { return targetGet(t) || targetDefault(t); }
function targetSnapshot(t) {
    if (t.kind === 'item') return JSON.stringify(findItem(t.uid).colors);
    return JSON.stringify(game[t.kind].color);
}
let surfaceQueued = false;
function targetSet(t, hex, commit) {
    if (t.kind === 'item') {
        const it = findItem(t.uid);
        if (!it) return;
        if (hex) it.colors[t.slot] = hex; else delete it.colors[t.slot];
        rebuildObject(it);
    } else {
        game[t.kind].color = hex;
        // 柄を描き直すのは重いので、1 フレームに 1 回にまとめる
        if (!surfaceQueued) {
            surfaceQueued = true;
            requestAnimationFrame(() => { surfaceQueued = false; applySurfaces(); renderSurfacePanel(); });
        }
    }
    if (commit) saveGame();
}

const colorDialog = document.getElementById('color-dialog');
const cd = { target: null, snapshot: null, openColors: null, hsl: [0, 0, 0] };
const HSL_KEYS = [
    { key: 'h', name: '色合い', max: 359, unit: '°', wrap: true },
    { key: 's', name: '鮮やかさ', max: 100, unit: '%' },
    { key: 'l', name: '明るさ', max: 100, unit: '%' },
];

function swatchButton(hex, label, current) {
    const b = document.createElement('button');
    b.className = 'cswatch';
    b.style.setProperty('--c', hex);
    b.dataset.hex = hex;
    b.title = label || hex;
    b.setAttribute('aria-label', label || hex);
    b.setAttribute('aria-pressed', String(current === hex));
    b.addEventListener('click', () => { targetSet(cd.target, hex, true); renderColorDialog(); });
    return b;
}
// 部屋の中で使われている色（色を変えている対象そのものは除く）
function usedColors() {
    const t = cd.target, list = [], seen = new Set();
    const push = (hex, label) => { if (!seen.has(hex)) { seen.add(hex); list.push([hex, label]); } };
    for (const it of game.items) {
        const def = FURNITURE[it.type];
        for (const s of def.slots) {
            if (t.kind === 'item' && t.uid === it.uid && t.slot === s.key) continue;
            push(slotColor(it, s.key), def.slots.length > 1 ? `${def.name}（${s.name}）` : def.name);
        }
    }
    if (t.kind !== 'floor') push(surfaceColor('floor'), '床');
    if (t.kind !== 'wall') push(surfaceColor('wall'), '壁');
    return list.slice(0, 8);
}
function renderColorDialog() {
    const t = cd.target;
    if (!t) return;
    const cur = targetGet(t); // null は元の色
    const shown = targetShown(t);
    let title = t.kind === 'floor' ? '床の色' : t.kind === 'wall' ? '壁の色' : '';
    const partsWrap = colorDialog.querySelector('.cd-parts');
    partsWrap.innerHTML = '';
    if (t.kind === 'item') {
        const it = findItem(t.uid);
        const def = FURNITURE[it.type];
        title = `${def.name}の色`;
        // 部位のタブ
        if (def.slots.length > 1) {
            for (const s of def.slots) {
                const b = document.createElement('button');
                b.className = 'cd-part';
                b.setAttribute('aria-pressed', String(s.key === t.slot));
                b.innerHTML = '<span class="dot"></span><span></span>';
                b.querySelector('.dot').style.background = slotColor(it, s.key);
                b.lastChild.textContent = s.name;
                b.addEventListener('click', () => { cd.target = { ...t, slot: s.key }; renderColorDialog(); });
                partsWrap.appendChild(b);
            }
        }
    }
    partsWrap.hidden = !partsWrap.children.length;
    colorDialog.querySelector('.cd-preview').style.background = shown;
    colorDialog.querySelector('.cd-title').textContent = title;
    colorDialog.querySelector('.cd-hex').textContent = cur ? shown : `${shown}（元の色）`;

    const recentWrap = colorDialog.querySelector('.cd-recent');
    recentWrap.innerHTML = '';
    game.recentColors.forEach(c => recentWrap.appendChild(swatchButton(c, null, cur)));
    colorDialog.querySelector('.cd-recent-sec').hidden = !game.recentColors.length;

    const sameWrap = colorDialog.querySelector('.cd-same');
    sameWrap.innerHTML = '';
    const used = usedColors();
    for (const [hex, label] of used) {
        const row = document.createElement('div');
        row.className = 'cd-same-item';
        row.appendChild(swatchButton(hex, label, cur));
        const name = document.createElement('span');
        name.textContent = label;
        row.appendChild(name);
        sameWrap.appendChild(row);
    }
    colorDialog.querySelector('.cd-same-sec').hidden = !used.length;

    const palWrap = colorDialog.querySelector('.cd-palette');
    palWrap.innerHTML = '';
    PALETTE.forEach(c => palWrap.appendChild(swatchButton(c, null, cur)));

    colorDialog.querySelector('.cd-picker').value = shown;
    colorDialog.querySelector('.cd-auto').disabled = cur === null;
    updateRevertButton();
    cd.hsl = hslOf(shown);
    renderSliders();
}
function updateRevertButton() {
    colorDialog.querySelector('.cd-revert').disabled = targetSnapshot(cd.target) === cd.snapshot;
}
function renderSliders() {
    const [h, s, l] = cd.hsl;
    const cur = hslToHex(h, s, l);
    const tracks = {
        h: `linear-gradient(to right, ${[0, 60, 120, 180, 240, 300, 360].map(x => `hsl(${x} ${s}% ${l}%)`).join(', ')})`,
        s: `linear-gradient(to right, hsl(${h} 0% ${l}%), hsl(${h} 100% ${l}%))`,
        l: `linear-gradient(to right, hsl(${h} ${s}% 0%), hsl(${h} ${s}% 50%), hsl(${h} ${s}% 100%))`,
    };
    HSL_KEYS.forEach((k, i) => {
        const row = colorDialog.querySelector(`.cd-row[data-key="${k.key}"]`);
        const slider = row.querySelector('.cd-slider');
        slider.style.setProperty('--track', tracks[k.key]);
        slider.style.setProperty('--cur', cur);
        row.querySelector('input[type="range"]').value = cd.hsl[i];
        const num = row.querySelector('input[type="number"]');
        if (document.activeElement !== num) num.value = cd.hsl[i];
    });
}
// スライダー・数値・− / ＋ から色を変える（ダイアログは作り直さず、変わる所だけ直す）
function setHsl(i, value, commit) {
    const k = HSL_KEYS[i];
    if (k.wrap) value = ((value % 360) + 360) % 360;
    else value = Math.min(Math.max(value, 0), k.max);
    cd.hsl = [...cd.hsl];
    cd.hsl[i] = value;
    const hex = hslToHex(...cd.hsl);
    hslMemo.set(hex, [...cd.hsl]);
    targetSet(cd.target, hex, commit);
    colorDialog.querySelector('.cd-preview').style.background = hex;
    colorDialog.querySelector('.cd-hex').textContent = hex;
    colorDialog.querySelector('.cd-auto').disabled = false;
    updateRevertButton();
    colorDialog.querySelectorAll('.cswatch').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.hex === hex)));
    const dot = colorDialog.querySelector('.cd-part[aria-pressed="true"] .dot');
    if (dot) dot.style.background = hex;
    renderSliders();
}
function addRecentColor(hex) {
    if (!hex) return;
    game.recentColors = [hex, ...game.recentColors.filter(c => c !== hex)].slice(0, MAX_RECENT);
}
// 開いたときの色（部位ごと）。閉じたときに、変わった色を「最近使った色」に足すのに使う
function currentColorList(t) {
    if (t.kind === 'item') { const it = findItem(t.uid); return FURNITURE[it.type].slots.map(s => it.colors[s.key] || null); }
    return [game[t.kind].color];
}
function openColorDialog(target) {
    if (!target) {
        const item = findItem(selectedUid);
        if (!item) return;
        target = { kind: 'item', uid: item.uid, slot: FURNITURE[item.type].slots[0].key };
    }
    cd.target = target;
    cd.snapshot = targetSnapshot(target);
    cd.openColors = currentColorList(target);
    renderColorDialog();
    if (colorDialog.showModal) {
        colorDialog.showModal();
        if (target.kind === 'item') focusOn(findItem(target.uid), colorDialog);
    } else colorDialog.querySelector('.cd-picker').click();
}
// 下から出る画面で隠れないよう、家具を画面の上側の真ん中に映す
let savedTarget = null;
function focusOn(item, sheet) {
    savedTarget = cam.target.clone();
    const c = itemCenter(item);
    cam.target.set(c.x, 0.4, c.z);
    const covered = Math.max(0, view.getBoundingClientRect().bottom - sheet.getBoundingClientRect().top);
    viewShift = Math.min(covered / 2, view.clientHeight * 0.4);
    resize();
    updateCamera();
}
function unfocus() {
    if (savedTarget) cam.target.copy(savedTarget);
    savedTarget = null;
    viewShift = 0;
    resize();
    updateCamera();
}
colorDialog.addEventListener('close', () => {
    unfocus();
    const t = cd.target;
    if (t && (t.kind !== 'item' || findItem(t.uid))) {
        const now = currentColorList(t);
        now.forEach((c, i) => { if (c && c !== cd.openColors[i]) addRecentColor(c); });
    }
    saveGame();
    cd.target = null;
});
colorDialog.addEventListener('click', (e) => { if (e.target === colorDialog) colorDialog.close(); });
colorDialog.querySelector('.cd-close').addEventListener('click', () => colorDialog.close());
colorDialog.querySelector('.cd-auto').addEventListener('click', () => { targetSet(cd.target, null, true); renderColorDialog(); });
colorDialog.querySelector('.cd-revert').addEventListener('click', () => {
    const t = cd.target, snap = JSON.parse(cd.snapshot);
    if (t.kind === 'item') {
        const it = findItem(t.uid);
        it.colors = snap;
        rebuildObject(it);
        saveGame();
    } else targetSet(t, snap, true);
    renderColorDialog();
});
const picker = colorDialog.querySelector('.cd-picker');
picker.addEventListener('input', () => {
    const hex = normHex(picker.value);
    if (!hex) return;
    targetSet(cd.target, hex, false);
    colorDialog.querySelector('.cd-preview').style.background = hex;
});
picker.addEventListener('change', () => {
    const hex = normHex(picker.value);
    if (!hex) return;
    targetSet(cd.target, hex, true);
    addRecentColor(hex);
    renderColorDialog();
});

// 微調整の行を作る
(function buildSliderRows() {
    const wrap = colorDialog.querySelector('.cd-sliders');
    HSL_KEYS.forEach((k, i) => {
        const row = document.createElement('div');
        row.className = 'cd-row';
        row.dataset.key = k.key;
        row.innerHTML = `
            <div class="cd-row-top">
                <span class="cd-name">${k.name}</span>
                <span class="cd-num">
                    <button class="cd-step" data-d="-1" aria-label="${k.name}を下げる">−</button>
                    <input type="number" min="0" max="${k.max}" step="1" inputmode="numeric" aria-label="${k.name}">
                    <span class="cd-unit">${k.unit}</span>
                    <button class="cd-step" data-d="1" aria-label="${k.name}を上げる">＋</button>
                </span>
            </div>
            <div class="cd-slider"><input type="range" min="0" max="${k.max}" step="1" aria-label="${k.name}"></div>`;
        const range = row.querySelector('input[type="range"]');
        range.addEventListener('input', () => setHsl(i, Number(range.value), false));
        range.addEventListener('change', () => setHsl(i, Number(range.value), true));
        const num = row.querySelector('input[type="number"]');
        num.addEventListener('focus', () => num.select());
        num.addEventListener('input', () => {
            const v = Number(num.value);
            if (num.value !== '' && Number.isInteger(v) && v >= 0 && v <= k.max) setHsl(i, v, false);
        });
        num.addEventListener('change', () => {
            const v = Math.round(Number(num.value));
            setHsl(i, Number.isFinite(v) ? v : cd.hsl[i], true);
            num.value = cd.hsl[i];
        });
        num.addEventListener('keydown', (e) => { if (e.key === 'Enter') num.blur(); });
        row.querySelectorAll('.cd-step').forEach(b => {
            let timer = 0;
            const d = Number(b.dataset.d);
            const stopRepeat = () => {
                if (!timer) return;
                clearTimeout(timer);
                timer = 0;
                saveGame();
            };
            b.addEventListener('pointerdown', (e) => {
                if (e.pointerType === 'mouse' && e.button !== 0) return;
                e.preventDefault();
                setHsl(i, cd.hsl[i] + d, false);
                const repeat = (delay) => { timer = setTimeout(() => { setHsl(i, cd.hsl[i] + d, false); repeat(60); }, delay); };
                repeat(400);
            });
            ['pointerup', 'pointerleave', 'pointercancel'].forEach(t => b.addEventListener(t, stopRepeat));
            b.addEventListener('click', (e) => { if (e.detail === 0) setHsl(i, cd.hsl[i] + d, true); }); // キーボード
        });
        wrap.appendChild(row);
    });
})();
document.getElementById('color-btn').addEventListener('click', () => openColorDialog());

// ---------- 床・壁 ----------
const SURFACES = [
    { kind: 'floor', name: '床', patterns: FLOOR_PATTERNS, draw: drawFloor },
    { kind: 'wall', name: '壁', patterns: WALL_PATTERNS, draw: drawWall },
];
// 柄の見本（大きな柄の一部を切り出す）
function patternThumb(draw, pattern, color) {
    const src = draw(pattern, color).image;
    const cv = document.createElement('canvas');
    cv.width = cv.height = 72;
    const crop = Math.min(src.width, src.height) / 2.5;
    cv.getContext('2d').drawImage(src, 0, src.height - crop, crop, crop, 0, 0, 72, 72);
    return cv.toDataURL();
}
function renderSurfacePanel() {
    const panel = document.getElementById('surface-panel');
    if (panel.hidden) return;
    panel.innerHTML = '';
    for (const sf of SURFACES) {
        const sec = document.createElement('section');
        sec.className = 'surface';
        sec.dataset.kind = sf.kind;
        const head = document.createElement('div');
        head.className = 'surface-head';
        head.innerHTML = `<h3>${sf.name}</h3><button class="surface-color"><span class="dot"></span>色を変える</button>`;
        head.querySelector('.dot').style.background = surfaceColor(sf.kind);
        head.querySelector('.surface-color').addEventListener('click', () => openColorDialog({ kind: sf.kind }));
        sec.appendChild(head);
        const list = document.createElement('div');
        list.className = 'patterns';
        for (const [key, pat] of Object.entries(sf.patterns)) {
            const b = document.createElement('button');
            b.className = 'pattern';
            b.dataset.pattern = key;
            b.setAttribute('aria-pressed', String(game[sf.kind].pattern === key));
            // 色を決めていればその色で、決めていなければ柄の元の色で見本を描く
            const img = document.createElement('img');
            img.alt = '';
            img.src = patternThumb(sf.draw, key, game[sf.kind].color || pat.color);
            const label = document.createElement('span');
            label.textContent = pat.name;
            b.append(img, label);
            b.addEventListener('click', () => {
                if (game[sf.kind].pattern === key) return;
                game[sf.kind].pattern = key;
                applySurfaces();
                saveGame();
                renderSurfacePanel();
            });
            list.appendChild(b);
        }
        sec.appendChild(list);
        panel.appendChild(sec);
    }
}
// 一覧の上のタブ（家具 / 床・壁）
function showTab(name) {
    document.querySelectorAll('.tab').forEach(b => b.setAttribute('aria-selected', String(b.dataset.tab === name)));
    document.getElementById('furniture-panel').hidden = name !== 'furniture';
    document.getElementById('surface-panel').hidden = name !== 'surface';
    if (name === 'surface') { select(null); renderSurfacePanel(); }
}
document.querySelectorAll('.tab').forEach(b => b.addEventListener('click', () => showTab(b.dataset.tab)));

// ---------- 元に戻す・やり直す ----------
const MAX_HISTORY = 100;
const undoStack = [], redoStack = [];
let lastRoom = null; // 最後に記録した部屋の状態（JSON）
function roomSnapshot() { return JSON.stringify({ items: game.items, floor: game.floor, wall: game.wall }); }
// 部屋が前の記録から変わっていたら、前の状態を「元に戻す」に積む（saveGame から呼ぶ）
function recordHistory() {
    const now = roomSnapshot();
    if (lastRoom === null || now === lastRoom) { lastRoom = now; return; }
    undoStack.push(lastRoom);
    if (undoStack.length > MAX_HISTORY) undoStack.shift();
    redoStack.length = 0;
    lastRoom = now;
    updateHistoryButtons();
}
function restoreRoom(json) {
    const r = JSON.parse(json);
    game.items = r.items;
    game.floor = r.floor;
    game.wall = r.wall;
    lastRoom = json;
    rebuildAll();
    applySurfaces();
    select(findItem(selectedUid) ? selectedUid : null);
    renderSurfacePanel();
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(game)); } catch (err) { console.error(err); }
    updateHistoryButtons();
}
function undo() {
    recordHistory(); // まだ記録していない変更があれば先に記録
    if (!undoStack.length) return;
    redoStack.push(lastRoom);
    restoreRoom(undoStack.pop());
}
function redo() {
    recordHistory();
    if (!redoStack.length) return;
    undoStack.push(lastRoom);
    restoreRoom(redoStack.pop());
}
function updateHistoryButtons() {
    document.getElementById('undo-btn').disabled = !undoStack.length;
    document.getElementById('redo-btn').disabled = !redoStack.length;
}
document.getElementById('undo-btn').addEventListener('click', undo);
document.getElementById('redo-btn').addEventListener('click', redo);
window.addEventListener('keydown', (e) => {
    if (!(e.ctrlKey || e.metaKey) || document.querySelector('dialog[open]')) return;
    if (e.target.closest && e.target.closest('input, textarea')) return;
    const k = e.key.toLowerCase();
    if (k === 'z' && !e.shiftKey) { e.preventDefault(); undo(); }
    else if (k === 'y' || (k === 'z' && e.shiftKey)) { e.preventDefault(); redo(); }
});

// ---------- 部屋のプリセット ----------
const presetDialog = document.getElementById('preset-dialog');
const presetName = document.getElementById('preset-name');

function cloneItems(items) { return items.map(it => ({ ...it, colors: { ...it.colors } })); }
function formatDate(t) {
    if (!t) return '';
    const d = new Date(t);
    return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}
function renderPresets() {
    const list = document.getElementById('preset-list');
    list.innerHTML = '';
    if (!game.presets.length) {
        const p = document.createElement('p');
        p.className = 'empty';
        p.textContent = 'まだありません。今の部屋に名前を付けて保存できます。';
        list.appendChild(p);
    }
    for (const ps of game.presets) {
        const row = document.createElement('div');
        row.className = 'preset';
        row.innerHTML = `<div class="preset-info"><b></b><small></small></div>
            <button class="preset-load">呼び出す</button>
            <button class="preset-del" aria-label="削除">🗑</button>`;
        row.querySelector('b').textContent = ps.name;
        row.querySelector('small').textContent = `家具 ${ps.items.length} 個・${FLOOR_PATTERNS[ps.floor.pattern].name}・${formatDate(ps.savedAt)}`;
        row.querySelector('.preset-load').addEventListener('click', () => loadPreset(ps.id));
        row.querySelector('.preset-del').addEventListener('click', () => {
            if (!confirm(`「${ps.name}」を削除しますか？`)) return;
            game.presets = game.presets.filter(p => p.id !== ps.id);
            saveGame();
            renderPresets();
        });
        list.appendChild(row);
    }
    document.getElementById('preset-save').disabled = game.presets.length >= MAX_PRESETS;
}
function savePreset(name) {
    name = (name || '').trim().slice(0, 30) || `部屋 ${game.nextPresetId}`;
    const data = { items: cloneItems(game.items), floor: { ...game.floor }, wall: { ...game.wall }, savedAt: Date.now() };
    const same = game.presets.find(p => p.name === name);
    if (same) {
        if (!confirm(`「${name}」はもうあります。上書きしますか？`)) return false;
        Object.assign(same, data);
    } else {
        if (game.presets.length >= MAX_PRESETS) { toast(`プリセットは ${MAX_PRESETS} 個までです`); return false; }
        game.presets.unshift({ id: game.nextPresetId++, name, ...data });
    }
    saveGame();
    toast(`「${name}」を保存しました`);
    return true;
}
function loadPreset(id) {
    const ps = game.presets.find(p => p.id === id);
    if (!ps) return;
    // 「元に戻す」で戻せるので、確認は出さない
    // 部屋の家具には新しい番号を振る（プリセットと部屋で番号が混ざらないように）
    game.items = cloneItems(ps.items).map(it => ({ ...it, uid: game.nextUid++ }));
    game.floor = { ...ps.floor };
    game.wall = { ...ps.wall };
    select(null);
    rebuildAll();
    applySurfaces();
    renderSurfacePanel();
    saveGame();
    presetDialog.close();
    toast(`「${ps.name}」を呼び出しました（↶ で戻せます）`);
}
document.getElementById('preset-btn').addEventListener('click', () => {
    presetName.value = '';
    renderPresets();
    if (presetDialog.showModal) presetDialog.showModal();
});
document.getElementById('preset-save').addEventListener('click', () => {
    if (savePreset(presetName.value)) { presetName.value = ''; renderPresets(); }
});
presetName.addEventListener('keydown', (e) => { if (e.key === 'Enter') document.getElementById('preset-save').click(); });
document.getElementById('preset-close').addEventListener('click', () => presetDialog.close());
presetDialog.addEventListener('click', (e) => { if (e.target === presetDialog) presetDialog.close(); });

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
renderTags();
renderCatalog();
rebuildAll();
applySurfaces();
recordHistory(); // 起動したときの部屋を「元に戻す」の起点にする
updateHistoryButtons();
updateCamera();
resize();
document.getElementById('version').textContent = `v${APP_VERSION}`;

setInterval(saveGame, 10000);
window.addEventListener('beforeunload', saveGame);
document.addEventListener('visibilitychange', () => { if (document.hidden) saveGame(); });

if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
    navigator.serviceWorker.register('sw.js').catch(err => console.error(err));
}

// 面がぴったり重なってチラつく箇所を探す（テスト用）。同じ向きの面が同じ平面にあり、重なる広さがあるものを返す
function findCoplanarFaces() {
    const issues = [], E = 1e-4, axes = ['x', 'y', 'z'];
    for (const [type, def] of Object.entries(FURNITURE)) {
        const g = new THREE.Group();
        def.build(g, colorsFor({ type, colors: {} }));
        g.updateMatrixWorld(true);
        const boxes = [];
        g.traverse(o => { if (o.isMesh && o.geometry.type === 'BoxGeometry') boxes.push(new THREE.Box3().setFromObject(o)); });
        for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
            const a = boxes[i], b = boxes[j];
            for (const ax of axes) for (const side of ['min', 'max']) {
                if (Math.abs(a[side][ax] - b[side][ax]) > E) continue;
                if (ax === 'y' && side === 'min' && a.min.y < E) continue; // 床に付いた底面は見えない
                const others = axes.filter(o => o !== ax);
                const overlap = others.every(o => Math.min(a.max[o], b.max[o]) - Math.max(a.min[o], b.min[o]) > E);
                if (overlap) issues.push(`${type}: 部品 ${i} と ${j} の ${ax} ${side} 面`);
            }
        }
        g.traverse(o => { if (o.isMesh) o.geometry.dispose(); });
    }
    return issues;
}

// テストから使う
window.__lifemaker = {
    findCoplanarFaces, testBox: box, save: saveGame,
    game: () => game, selected: () => selectedUid, cam, addItem, savePreset, loadPreset, openColorDialog, setHsl, hslOf, undo, redo, showTab, history: () => ({ undo: undoStack.length, redo: redoStack.length }), hslToHex, filter, rotateSelected, removeSelected, select, isBlocked, footprint, APP_VERSION, FURNITURE,
    // 家具の中心が画面のどこに映るか（クライアント座標）
    screenOf(uid, height = 0.3) {
        const item = findItem(uid);
        const p = itemCenter(item);
        p.y = height;
        p.project(camera);
        const r = canvas.getBoundingClientRect();
        return { x: r.left + (p.x + 1) / 2 * r.width, y: r.top + (1 - p.y) / 2 * r.height };
    },
};
