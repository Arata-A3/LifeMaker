import * as THREE from '../lib/three.module.min.js';

const APP_VERSION = '0.5.0';
const SAVE_KEY = 'lifemaker_save';
const SAVE_VERSION = 3; // 2: 家具の色を部位ごとに、床と壁を追加 / 3: テレビをテレビ台から分けた

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
        top: 0.73,
        build(g, c) {
            box(g, 1.4, 0.05, 0.9, c.main, 0, 0.68, 0);
            for (const x of [-0.62, 0.62]) for (const z of [-0.37, 0.37]) box(g, 0.06, 0.68, 0.06, c.legs, x, 0, z);
        },
    },
    lowtable: {
        name: 'ローテーブル', icon: '☕', size: [2, 2], tags: ['テーブル', 'リビング', 'シンプル'],
        slots: [['main', '天板', '#e8e1d5'], ['base', '脚', '#6b5847']],
        top: 0.38,
        build(g, c) {
            cyl(g, 0.42, 0.42, 0.04, c.main, 0, 0.34, 0, 32);
            cyl(g, 0.05, 0.05, 0.335, c.base, 0, 0.005, 0, 12);
            cyl(g, 0.22, 0.22, 0.02, c.base, 0, 0, 0, 24);
        },
    },
    bookshelf: {
        name: '本棚（きっちり）', icon: '📚', size: [2, 1], tags: ['収納', '書斎', 'ナチュラル', '木'],
        slots: [['main', '本棚', '#9c7350'], ['back', '背板', '#7c5a3e'], ['books1', '本 1', '#c45c4a'], ['books2', '本 2', '#4a7cc4'], ['books3', '本 3', '#e3b34c']],
        top: 1.83,
        build(g, c) {
            const { W, z } = bookshelfFrame(g, c);
            // 段ごとに 1 色。同じ高さ・同じ厚さの本をすき間なく並べる
            const rows = [c.books1, c.books2, c.books3, c.books1];
            for (let i = 0; i < 4; i++) {
                const y = i * 0.44 + 0.03;
                let k = 0;
                for (let x = -W / 2 + 0.035; x + 0.045 < W / 2 - 0.035; x += 0.049, k++) {
                    box(g, 0.045, 0.3, 0.28, shade(rows[i], k % 2 ? 0.025 : 0), x + 0.0225, y, z + 0.02);
                }
            }
        },
    },
    bookshelf2: {
        name: '本棚（ばらばら）', icon: '📖', size: [2, 1], tags: ['収納', '書斎', 'ナチュラル', '木'],
        slots: [['main', '本棚', '#9c7350'], ['back', '背板', '#7c5a3e'], ['books1', '本 1', '#c45c4a'], ['books2', '本 2', '#4a7cc4'], ['books3', '本 3', '#e3b34c'], ['books4', '本 4', '#5d9c6a']],
        top: 1.83,
        build(g, c) {
            const { W, z } = bookshelfFrame(g, c);
            // 色・高さ・厚さ・奥行きがばらばらの本。ところどころすき間や、寝かせて積んだ本がある
            const groups = [c.books1, c.books2, c.books3, c.books4];
            const rnd = seeded(23);
            const pick = () => shade(groups[Math.floor(rnd() * 4)], (rnd() - 0.5) * 0.22);
            for (let i = 0; i < 4; i++) {
                const y = i * 0.44 + 0.03;
                const end = W / 2 - 0.035;
                let x = -W / 2 + 0.035;
                while (x < end - 0.08) {
                    const r = rnd();
                    if (r < 0.08) { x += 0.04 + rnd() * 0.08; continue; }
                    if (r < 0.18 && end - x > 0.26) {
                        const w = 0.2 + rnd() * 0.03, n = 2 + Math.floor(rnd() * 3);
                        let yy = y;
                        for (let k = 0; k < n; k++) {
                            const bh = 0.03 + rnd() * 0.02;
                            box(g, w - k * 0.012, bh, 0.25 - k * 0.011, pick(), x + w / 2, yy, z + 0.02 - k * 0.003);
                            yy += bh;
                        }
                        x += w + 0.01;
                        continue;
                    }
                    const bw = 0.028 + rnd() * 0.035, bh = 0.2 + rnd() * 0.14, bd = 0.22 + rnd() * 0.07;
                    if (x + bw > end) break;
                    box(g, bw, bh, bd, pick(), x + bw / 2, y, z - 0.18 + bd / 2 + 0.012);
                    x += bw + 0.003;
                }
            }
        },
    },
    wardrobe: {
        name: 'クローゼット', icon: '🚪', size: [2, 1], tags: ['収納', '寝室', 'シンプル'],
        slots: [['main', '本体', '#e5dccd'], ['handle', '取っ手', '#8a7a66'], ['plinth', '台座', '#bfae93']],
        top: 1.9,
        build(g, c) {
            box(g, 0.9, 0.08, 0.42, c.plinth, 0, 0, -0.02);           // 台座は本体より少し内側
            box(g, 0.94, 1.82, 0.46, c.main, 0, 0.08, -0.01);         // 本体は台座の上に載せる
            box(g, 0.006, 1.66, 0.006, shade(c.main, -0.25), 0, 0.16, 0.223);
            box(g, 0.02, 0.18, 0.03, c.handle, -0.05, 0.95, 0.235);
            box(g, 0.02, 0.18, 0.03, c.handle, 0.05, 0.95, 0.235);
        },
    },
    tvstand: {
        name: 'テレビ台', icon: '🗄', size: [3, 1], tags: ['収納', 'リビング', 'シンプル'],
        slots: [['main', '台', '#6f5a48'], ['front', '引き出し', '#7d6753'], ['handle', '取っ手', '#d8c8b0']],
        top: 0.42,
        build(g, c) {
            box(g, 1.4, 0.42, 0.42, c.main, 0, 0, 0);
            for (const x of [-0.35, 0.35]) {
                box(g, 0.66, 0.3, 0.008, c.front, x, 0.06, 0.214);
                box(g, 0.12, 0.02, 0.02, c.handle, x, 0.18, 0.226);
            }
        },
    },
    plant: {
        name: '観葉植物', icon: '🪴', size: [1, 1], tags: ['植物', 'ナチュラル'],
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

    // ---- 小物（small）: 1 マス。上に物を置ける家具（top: 天面の高さ m）の上に載る ----
    mug: {
        name: 'マグカップ', icon: '🍵', size: [1, 1], small: true, tags: ['小物', 'キッチン', 'シンプル'],
        slots: [['main', 'カップ', '#e8e1d5'], ['drink', '中身', '#6b4a35']],
        build(g, c) {
            cyl(g, 0.06, 0.055, 0.13, c.main, 0, 0, 0, 20);
            cyl(g, 0.052, 0.052, 0.004, c.drink, 0, 0.13, 0, 20);
            const handle = addMesh(g, new THREE.TorusGeometry(0.035, 0.011, 8, 16, Math.PI), c.main, 0.058, 0.065, 0);
            handle.rotation.z = -Math.PI / 2;
        },
    },
    tv: {
        name: 'テレビ', icon: '📺', size: [2, 1], small: true, prefer: 'tvstand', tags: ['小物', '家電', 'リビング'],
        slots: [['main', '本体', '#2b2b2e']],
        build(g, c) {
            box(g, 0.3, 0.03, 0.18, c.main, 0, 0, 0);
            box(g, 0.05, 0.12, 0.03, c.main, 0, 0.03, -0.02);
            box(g, 0.96, 0.58, 0.04, c.main, 0, 0.13, -0.02);
            box(g, 0.92, 0.54, 0.005, '#16181d', 0, 0.15, 0.0025);
        },
    },
    bookstack: {
        name: '積んだ本', icon: '📕', size: [1, 1], small: true, tags: ['小物', '書斎'],
        slots: [['main', '本 1', '#4a7cc4'], ['book2', '本 2', '#c45c4a'], ['book3', '本 3', '#5d9c6a']],
        build(g, c) {
            box(g, 0.26, 0.05, 0.19, c.main, 0, 0, 0);
            box(g, 0.24, 0.045, 0.17, c.book2, 0.012, 0.05, -0.008);
            box(g, 0.21, 0.04, 0.15, c.book3, -0.01, 0.095, 0.006);
        },
    },
    vase: {
        name: '花びん', icon: '💐', size: [1, 1], small: true, tags: ['小物', '植物', 'ナチュラル'],
        slots: [['main', '花', '#e88a9a'], ['vase', '花びん', '#7fa7c9'], ['leaf', '茎と葉', '#5f9e5a']],
        build(g, c) {
            cyl(g, 0.05, 0.07, 0.2, c.vase, 0, 0, 0, 16);
            for (const [x, z, h, d] of [[-0.03, 0, 0.17, 0], [0.035, 0.015, 0.13, 0.08], [0.005, -0.03, 0.2, -0.06]]) {
                cyl(g, 0.006, 0.006, h, c.leaf, x, 0.2, z, 6);
                ball(g, 0.042, shade(c.main, d), x, 0.2 + h + 0.02, z);
            }
            ball(g, 0.03, c.leaf, 0.04, 0.24, -0.02);
        },
    },
    deskclock: {
        name: '置き時計', icon: '⏰', size: [1, 1], small: true, tags: ['小物', 'シンプル'],
        slots: [['main', '本体', '#c45c4a'], ['face', '文字盤', '#f4f1ea']],
        build(g, c) {
            box(g, 0.025, 0.02, 0.04, c.main, -0.05, 0, 0);
            box(g, 0.025, 0.02, 0.04, c.main, 0.05, 0, 0);
            const body = cyl(g, 0.09, 0.09, 0.06, c.main, 0, 0, 0, 24);
            body.rotation.x = Math.PI / 2;
            body.position.set(0, 0.105, 0);
            const face = cyl(g, 0.075, 0.075, 0.01, c.face, 0, 0, 0, 24);
            face.rotation.x = Math.PI / 2;
            face.position.set(0, 0.105, 0.034);
            box(g, 0.008, 0.055, 0.004, '#2b2b2e', 0, 0.105, 0.041);
            box(g, 0.04, 0.008, 0.004, '#2b2b2e', 0.02, 0.101, 0.042);
        },
    },
    desklamp: {
        name: '卓上ライト', icon: '🔆', size: [1, 1], small: true, tags: ['小物', '照明', '書斎'],
        slots: [['main', 'かさ', '#f3e3b8'], ['base', '台と柱', '#3a3633']],
        build(g, c) {
            cyl(g, 0.08, 0.09, 0.02, c.base, 0, 0, 0, 20);
            cyl(g, 0.01, 0.01, 0.26, c.base, 0, 0.02, 0, 8);
            const s = cyl(g, 0.06, 0.11, 0.12, c.main, 0, 0.26, 0, 20);
            s.material.emissive = new THREE.Color(c.main);
            s.material.emissiveIntensity = 0.35;
        },
    },
    succulent: {
        name: '小さな鉢植え', icon: '🌵', size: [1, 1], small: true, tags: ['小物', '植物', 'ナチュラル'],
        slots: [['main', '葉', '#7fb07a'], ['pot', '鉢', '#e8e1d5']],
        build(g, c) {
            cyl(g, 0.08, 0.06, 0.1, c.pot, 0, 0, 0, 16);
            ball(g, 0.07, c.main, 0, 0.13, 0);
            ball(g, 0.05, shade(c.main, 0.08), 0.045, 0.17, 0.02);
            ball(g, 0.045, shade(c.main, -0.08), -0.04, 0.16, -0.02);
        },
    },

    // ---- 壁掛け（wall）: 壁に掛ける。size[0] は横のマス数、height は縦の長さ（m）、y は最初に掛ける高さ（m）----
    // build は、壁の面の上の下端の真ん中を原点に、正面（+z）を部屋の内側に向けて作る
    picture: {
        name: '絵', icon: '🖼', size: [2, 1], wall: true, height: 0.7, y: 1.1, tags: ['壁掛け', 'ナチュラル'],
        slots: [['main', '額縁', '#8a6a4a'], ['canvas', '絵の地', '#cfe0e8'], ['art', '丘', '#6f9e6a'], ['sun', '太陽', '#e3b34c']],
        build(g, c) {
            box(g, 0.9, 0.7, 0.04, c.main, 0, 0, 0.022);
            box(g, 0.78, 0.58, 0.01, c.canvas, 0, 0.06, 0.04);
            box(g, 0.5, 0.2, 0.008, c.art, -0.1, 0.07, 0.048);
            box(g, 0.3, 0.12, 0.008, shade(c.art, -0.08), 0.2, 0.072, 0.05);
            const sun = cyl(g, 0.06, 0.06, 0.006, c.sun, 0, 0, 0, 20);
            sun.rotation.x = Math.PI / 2;
            sun.position.set(0.2, 0.46, 0.048);
        },
    },
    wallclock: {
        name: '壁掛け時計', icon: '🕰', size: [1, 1], wall: true, height: 0.36, y: 1.75, tags: ['壁掛け', 'シンプル'],
        slots: [['main', 'ふち', '#3a3633'], ['face', '文字盤', '#f4f1ea'], ['hands', '針と目盛り', '#2b2b2e']],
        build(g, c) {
            const rim = cyl(g, 0.18, 0.18, 0.04, c.main, 0, 0, 0, 32);
            rim.rotation.x = Math.PI / 2;
            rim.position.set(0, 0.18, 0.022);
            const face = cyl(g, 0.155, 0.155, 0.01, c.face, 0, 0, 0, 32);
            face.rotation.x = Math.PI / 2;
            face.position.set(0, 0.18, 0.045);
            box(g, 0.012, 0.11, 0.004, c.hands, 0, 0.18, 0.052);
            box(g, 0.08, 0.012, 0.004, c.hands, 0.04, 0.174, 0.0535);
            for (const [x, y] of [[0, 0.3], [0.125, 0.168], [0, 0.035], [-0.125, 0.168]]) box(g, 0.012, 0.024, 0.003, c.hands, x, y, 0.0515);
        },
    },
    wallshelf: {
        name: 'ウォールシェルフ', icon: '🪵', size: [2, 1], wall: true, height: 0.3, y: 1.3, tags: ['壁掛け', '収納', 'ナチュラル', '木'],
        slots: [['main', '板', '#b98b5e'], ['deco1', '飾り 1', '#5d9c6a'], ['deco2', '飾り 2', '#e8e1d5']],
        build(g, c) {
            box(g, 0.9, 0.03, 0.2, c.main, 0, 0.07, 0.102);
            box(g, 0.02, 0.07, 0.12, shade(c.main, -0.15), -0.35, 0, 0.062);
            box(g, 0.02, 0.07, 0.12, shade(c.main, -0.15), 0.35, 0, 0.062);
            cyl(g, 0.045, 0.035, 0.08, c.deco2, -0.25, 0.1, 0.1, 16);
            ball(g, 0.05, c.deco1, -0.25, 0.22, 0.1);
            [0.16, 0.13, 0.17].forEach((h, i) => box(g, 0.03, h, 0.12, shade(i === 1 ? c.deco2 : c.deco1, i * 0.06 - 0.04), 0.12 + i * 0.035, 0.1, 0.08));
        },
    },
    window: {
        name: '窓', icon: '🪟', size: [3, 1], wall: true, height: 1.15, y: 0.85, tags: ['壁掛け', 'シンプル'],
        slots: [['main', '枠', '#f4f1ea'], ['glass', '外の景色', '#bfe0f0'], ['curtain', 'カーテン', '#e3c27a']],
        build(g, c) {
            const W = 0.9, H = 1.0, y0 = 0.05;
            const glass = box(g, W, H, 0.006, c.glass, 0, y0, 0.005);
            glass.material = mat(c.glass).clone();
            glass.material.emissive = new THREE.Color(c.glass);
            glass.material.emissiveIntensity = 0.5;
            box(g, W + 0.08, 0.05, 0.05, c.main, 0, y0 + H, 0.027);
            box(g, W + 0.14, 0.05, 0.09, c.main, 0, 0, 0.047);
            box(g, 0.04, H, 0.05, c.main, -W / 2 - 0.02, y0, 0.027);
            box(g, 0.04, H, 0.05, c.main, W / 2 + 0.02, y0, 0.027);
            box(g, 0.03, H - 0.002, 0.03, c.main, 0, y0 + 0.001, 0.02);
            box(g, W - 0.002, 0.03, 0.03, c.main, 0, y0 + H / 2 - 0.015, 0.021);
            box(g, 0.2, H + 0.1, 0.04, c.curtain, -0.62, 0.01, 0.07);
            box(g, 0.2, H + 0.1, 0.04, c.curtain, 0.62, 0.01, 0.07);
            box(g, 1.46, 0.025, 0.025, shade(c.curtain, -0.3), 0, H + 0.11, 0.07);
        },
    },
    mirror: {
        name: '鏡', icon: '🪞', size: [1, 1], wall: true, height: 1.3, y: 0.5, tags: ['壁掛け', '寝室', 'シンプル'],
        slots: [['main', '枠', '#c9a96e'], ['glass', '鏡', '#dfe8ec']],
        build(g, c) {
            box(g, 0.42, 1.3, 0.03, c.main, 0, 0, 0.017);
            const m = box(g, 0.36, 1.24, 0.008, c.glass, 0, 0.03, 0.034);
            m.material = new THREE.MeshStandardMaterial({ color: c.glass, roughness: 0.15, metalness: 0.3, emissive: new THREE.Color(c.glass), emissiveIntensity: 0.25 });
        },
    },
};
// 部位を { key, name, color } の形にし、見本の色（最初の部位）を color に置く
for (const def of Object.values(FURNITURE)) {
    def.slots = def.slots.map(([key, name, color]) => ({ key, name, color }));
    def.color = def.slots[0].color;
}

// ---------- 形を作る小さな関数 ----------
// 本棚の枠・背板・棚板。本を並べる幅などを返す
function bookshelfFrame(g, c) {
    const W = 0.94, D = 0.4, H = 1.8, z = -0.04;
    box(g, 0.03, H, D, c.main, -W / 2 + 0.015, 0, z);
    box(g, 0.03, H, D, c.main, W / 2 - 0.015, 0, z);
    box(g, W + 0.01, 0.03, D + 0.01, c.main, 0, H, z);
    box(g, W - 0.064, H - 0.01, 0.02, c.back, 0, 0.005, z - D / 2 + 0.012);
    for (let i = 0; i < 4; i++) box(g, W - 0.062, 0.03, D - 0.004, c.main, 0, i * 0.44, z + 0.002);
    return { W, D, z };
}
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
        snap: true, // true: マス目にそろえる、false: 自由に置く
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
            const item = { uid: it.uid, type: it.type, gx: toNum(it.gx), gz: toNum(it.gz), rot: ((toInt(it.rot) % 4) + 4) % 4, colors: sanitizeColors(it.type, it.colors, it.color) };
            clampItem(item);
            return item;
        });
}
// v0.4.0 まではテレビ台にテレビが付いていた。テレビを小物として台の真ん中に載せる
function splitTv(list) {
    if (!Array.isArray(list)) return list;
    let next = list.reduce((m, it) => Math.max(m, Number.isInteger(it?.uid) ? it.uid : 0), 0) + 1;
    const out = [];
    for (const it of list) {
        out.push(it);
        if (!it || it.type !== 'tvstand') continue;
        const rot = ((toInt(it.rot) % 4) + 4) % 4;
        const [fw, fd] = rot % 2 ? [1, 3] : [3, 1], [tw, td] = rot % 2 ? [1, 2] : [2, 1];
        const tv = { uid: next++, type: 'tv', gx: toNum(it.gx) + (fw - tw) / 2, gz: toNum(it.gz) + (fd - td) / 2, rot, colors: {} };
        const old = normHex(it.colors?.tv);
        if (old) tv.colors.main = old;
        out.push(tv);
    }
    return out;
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
    const oldTv = !(Number(p.saveVersion) >= 3);
    if (Array.isArray(p.items)) game.items = sanitizeItems(oldTv ? splitTv(p.items) : p.items);
    game.snap = p.snap !== false;
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
                items: sanitizeItems(oldTv ? splitTv(ps.items) : ps.items),
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
function toNum(v) { const n = Number(v); return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0; } // 自由に置いた位置（1/100 マスまで）

// ---------- 配置の計算 ----------
// 壁掛けは rot = 掛けている壁（walls の番号）、gx = 壁に沿った位置（マス）、gz = 下端の高さ（WALL_STEP 単位）
const WALL_STEP = 0.1;
const WALL_MIN = 2; // 幅木より上に掛ける
// 壁ごとの内側の面: along は壁に沿う軸、at はその面の位置、rotY は正面を部屋に向ける回転
const WALL_SIDES = [
    { along: 'x', at: -HALF, rotY: 0 },
    { along: 'x', at: HALF, rotY: Math.PI },
    { along: 'z', at: -HALF, rotY: Math.PI / 2 },
    { along: 'z', at: HALF, rotY: -Math.PI / 2 },
];
function kindOf(item) {
    const d = FURNITURE[item.type];
    return d.wall ? 'wall' : d.small ? 'small' : d.flat ? 'flat' : 'floor';
}
function wallPlacement(item) {
    const def = FURNITURE[item.type], s = WALL_SIDES[item.rot];
    const a = (item.gx + def.size[0] / 2) * CELL - HALF, y = item.gz * WALL_STEP;
    return { p: s.along === 'x' ? new THREE.Vector3(a, y, s.at) : new THREE.Vector3(s.at, y, a), rotY: s.rotY };
}
function wallOverlaps(a, b) {
    const da = FURNITURE[a.type], db = FURNITURE[b.type];
    return a.rot === b.rot && a.gx < b.gx + db.size[0] && b.gx < a.gx + da.size[0]
        && a.gz * WALL_STEP < b.gz * WALL_STEP + db.height && b.gz * WALL_STEP < a.gz * WALL_STEP + da.height;
}
// マス目にそろえるか、自由（1cm 刻み）に置くか
function snapCell(v) { return game.snap ? Math.round(v) : Math.round(v * 50) / 50; }
function snapWallY(v) { return game.snap ? Math.round(v) : Math.round(v * 10) / 10; }
function footprint(item) {
    const [w, d] = FURNITURE[item.type].size;
    return item.rot % 2 ? [d, w] : [w, d];
}
function clampItem(item) {
    const def = FURNITURE[item.type];
    if (def.wall) {
        item.gx = Math.min(Math.max(item.gx, 0), N - def.size[0]);
        item.gz = Math.min(Math.max(item.gz, WALL_MIN), Math.floor((WALL_H - def.height) / WALL_STEP * 10 + 1e-6) / 10);
        return;
    }
    const [fw, fd] = footprint(item);
    item.gx = Math.min(Math.max(item.gx, 0), N - fw);
    item.gz = Math.min(Math.max(item.gz, 0), N - fd);
}
function itemCenter(item) {
    const [fw, fd] = footprint(item);
    return new THREE.Vector3((item.gx + fw / 2) * CELL - HALF, 0, (item.gz + fd / 2) * CELL - HALF);
}
// shrink: それぞれ内側に縮めて比べる（小物どうしは、少しなら重なってよい）
function overlaps(a, b, shrink = 0) {
    const [aw, ad] = footprint(a), [bw, bd] = footprint(b);
    const E = 1e-6 + shrink * 2;
    return a.gx + E < b.gx + bw && b.gx + E < a.gx + aw && a.gz + E < b.gz + bd && b.gz + E < a.gz + ad;
}
function centerCell(item) {
    const [w, d] = footprint(item);
    return [item.gx + w / 2, item.gz + d / 2];
}
// 小物の下にある、上に物を置ける家具（いちばん高いもの）
function supportOf(item) {
    let best = null;
    for (const o of game.items) {
        const d = FURNITURE[o.type];
        if (o.uid === item.uid || !d.top || kindOf(o) !== 'floor') continue;
        // 小物の真ん中が天面の上にあれば載る
        const [cx, cz] = centerCell(item), [w, dd] = footprint(o);
        if (!(cx > o.gx && cx < o.gx + w && cz > o.gz && cz < o.gz + dd)) continue;
        if (!best || d.top > FURNITURE[best.type].top) best = o;
    }
    return best;
}
function smallBase(item) {
    const s = supportOf(item);
    return s ? FURNITURE[s.type].top + 0.002 : 0;
}
// 上に載っている小物
function ridersOf(item) {
    if (!FURNITURE[item.type].top) return [];
    return game.items.filter(o => kindOf(o) === 'small' && supportOf(o) === item);
}
function isBlocked(item) {
    const kind = kindOf(item);
    if (kind === 'flat') return false;
    if (kind === 'wall') return game.items.some(o => o.uid !== item.uid && kindOf(o) === 'wall' && wallOverlaps(item, o));
    const support = kind === 'small' ? supportOf(item) : null;
    return game.items.some(o => {
        if (o.uid === item.uid) return false;
        const k = kindOf(o);
        if (k === 'flat' || k === 'wall') return false;
        if (kind === 'floor') return k === 'floor' && overlaps(item, o);
        // 小物: ほかの小物と大きく重なる、または載っていない家具にめり込む
        if (k === 'small') return overlaps(item, o, 0.2);
        return o !== support && overlaps(item, o);
    });
}
// 部屋の中心に近い、空いている場所を探す
function findFreeSpot(item) {
    const def = FURNITURE[item.type];
    if (def.wall) return findWallSpot(item);
    const [fw, fd] = footprint(item);
    let best = null, bestDist = Infinity;
    for (let gz = 0; gz <= N - fd; gz++) {
        for (let gx = 0; gx <= N - fw; gx++) {
            const cand = { ...item, gx, gz };
            if (isBlocked(cand)) continue;
            let dist = (gx + fw / 2 - N / 2) ** 2 + (gz + fd / 2 - N / 2) ** 2;
            if (def.small) {
                // 小物は、手の届く高さの家具の上を先に探す
                const s = supportOf(cand);
                if (!s) dist += 500;
                else if (FURNITURE[s.type].top > 1.2) dist += 1000;
                else if (def.prefer === s.type) dist -= 2000; // テレビはテレビ台の上を先に
            }
            if (dist < bestDist) { bestDist = dist; best = { gx, gz }; }
        }
    }
    return best || { gx: Math.floor((N - fw) / 2), gz: Math.floor((N - fd) / 2) };
}
// 壁掛けは、見えている壁のうち正面に近い壁の、真ん中に近い所に掛ける
function findWallSpot(item) {
    const def = FURNITURE[item.type];
    const look = new THREE.Vector3();
    camera.getWorldDirection(look);
    const sides = [0, 1, 2, 3].filter(i => !walls[i].hidden).sort((a, b) => look.dot(walls[b].normal) - look.dot(walls[a].normal));
    const gz0 = Math.round(def.y / WALL_STEP);
    for (const rot of sides) {
        let best = null, bestDist = Infinity;
        for (const dz of [0, -4, 4, -8, 8]) {
            for (let gx = 0; gx <= N - def.size[0]; gx++) {
                const cand = { ...item, rot, gx, gz: gz0 + dz };
                clampItem(cand);
                if (isBlocked(cand)) continue;
                const dist = Math.abs(gx + def.size[0] / 2 - N / 2) + Math.abs(dz);
                if (dist < bestDist) { bestDist = dist; best = { rot, gx: cand.gx, gz: cand.gz }; }
            }
        }
        if (best) return best;
    }
    return { rot: sides[0] ?? 0, gx: Math.floor((N - def.size[0]) / 2), gz: gz0 };
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
    const kind = kindOf(item);
    if (kind === 'wall') {
        const { p, rotY } = wallPlacement(item);
        g.position.copy(p);
        g.rotation.y = rotY;
        g.visible = !walls[item.rot].hidden;
    } else {
        const c = itemCenter(item);
        g.position.set(c.x, kind === 'small' ? smallBase(item) : 0, c.z);
        g.rotation.y = -item.rot * Math.PI / 2;
        if (FURNITURE[item.type].top) liftSmallItems();
    }
    if (selectedUid === item.uid) updateMarker();
    requestRender();
}
// 家具が動いたり消えたりしたあと、小物の高さを合わせる
function liftSmallItems() {
    for (const it of game.items) {
        if (kindOf(it) !== 'small') continue;
        const g = objects.get(it.uid);
        if (g) g.position.y = smallBase(it);
    }
    if (findItem(selectedUid)) updateMarker();
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
        w.hidden = outside;
        w.mesh.visible = !outside;
        w.base.visible = !outside;
    }
    // 隠した壁の壁掛けも隠す
    for (const it of game.items) {
        if (kindOf(it) !== 'wall') continue;
        const g = objects.get(it.uid);
        if (g) g.visible = !walls[it.rot].hidden;
    }
    if (findItem(selectedUid)) updateMarker();
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
    grid.visible = !!item && game.snap;
    if (item) {
        selName.textContent = FURNITURE[item.type].name;
        document.getElementById('rotate-btn').hidden = kindOf(item) === 'wall';
        hint.classList.add('hidden');
    }
    updateMarker();
    requestRender();
}
function updateMarker() {
    const item = findItem(selectedUid);
    const kind = item && kindOf(item);
    marker.visible = !!item && !(kind === 'wall' && walls[item.rot].hidden);
    if (!item) return;
    const def = FURNITURE[item.type];
    if (kind === 'wall') {
        // 壁の上に、掛けた物より少し大きい印
        const { p, rotY } = wallPlacement(item);
        marker.rotation.set(0, rotY, 0);
        marker.scale.set(def.size[0] * CELL, def.height + 0.1, 1);
        marker.position.copy(p).addScaledVector(walls[item.rot].normal, -0.004);
        marker.position.y += def.height / 2;
    } else {
        const [fw, fd] = footprint(item);
        const c = itemCenter(item);
        marker.rotation.set(-Math.PI / 2, 0, 0);
        marker.scale.set(fw * CELL, fd * CELL, 1);
        marker.position.set(c.x, kind === 'small' ? smallBase(item) + 0.006 : kind === 'flat' ? 0.02 : 0.006, c.z);
    }
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
    if (!item || kindOf(item) === 'wall') return;
    const riders = ridersOf(item);
    const [fw, fd] = footprint(item);
    const cx = item.gx + fw / 2, cz = item.gz + fd / 2;
    item.rot = (item.rot + 1) % 4;
    const [nw, nd] = footprint(item);
    item.gx = snapCell(cx - nw / 2);
    item.gz = snapCell(cz - nd / 2);
    clampItem(item);
    // 上の小物もいっしょに回す（中心のまわりに 90°）。真ん中が天面から外れないようにする
    const ncx = item.gx + nw / 2, ncz = item.gz + nd / 2;
    const inside = (v, lo, len) => Math.min(Math.max(v, lo + 0.05), lo + len - 0.05);
    for (const r of riders) {
        const [rcx, rcz] = centerCell(r);
        const rx = rcx - cx, rz = rcz - cz;
        r.rot = (r.rot + 1) % 4;
        const [rw, rd] = footprint(r);
        r.gx = snapCell(inside(ncx - rz, item.gx, nw) - rw / 2);
        r.gz = snapCell(inside(ncz + rx, item.gz, nd) - rd / 2);
        if (!(supportOf(r) === item)) { // マス目にそろえたら外れたとき
            r.gx = inside(ncx - rz, item.gx, nw) - rw / 2;
            r.gz = inside(ncz + rx, item.gz, nd) - rd / 2;
        }
        clampItem(r);
        placeObject(r);
    }
    placeObject(item);
    updateMarker();
    saveGame();
}
function removeSelected() {
    const item = findItem(selectedUid);
    if (!item) return;
    game.items = game.items.filter(it => it.uid !== item.uid);
    removeObject(item.uid);
    liftSmallItems();
    select(null);
    toast(`${FURNITURE[item.type].name}をしまいました（↶ で戻せます）`);
    saveGame();
}

document.getElementById('rotate-btn').addEventListener('click', rotateSelected);
// マス目にそろえる／自由に置く
const snapBtn = document.getElementById('snap-btn');
function updateSnapButton() {
    snapBtn.textContent = game.snap ? '▦ マス目' : '✥ 自由';
    snapBtn.setAttribute('aria-pressed', String(!game.snap));
    snapBtn.title = game.snap ? 'いまはマス目にそろえて置きます（押すと自由に置けます）' : 'いまは自由に置けます（押すとマス目にそろえます）';
}
snapBtn.addEventListener('click', () => {
    game.snap = !game.snap;
    updateSnapButton();
    grid.visible = !!findItem(selectedUid) && game.snap;
    requestRender();
    saveGame();
    toast(game.snap ? 'マス目にそろえて置きます' : '自由に置けます（1cm 刻み）');
});
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
        if (!o || !o.visible) continue; // 隠した壁の壁掛け
        const item = findItem(o.userData.uid);
        if (!item) continue;
        if (!FURNITURE[item.type].flat) return item; // 敷物より上の家具を優先
        flatHit = flatHit || item;
    }
    return flatHit;
}
function floorPoint(x, y, height = 0) {
    raycaster.setFromCamera(ndc(x, y), camera);
    floorPlane.constant = -height;
    return raycaster.ray.intersectPlane(floorPlane, new THREE.Vector3());
}
// 壁の内側の面のどこを指しているか。side を省くと、見えている壁のうち指の先にあるもの
const wallPlanes = walls.map(w => new THREE.Plane(w.normal.clone(), -HALF));
function wallPoint(x, y, side) {
    raycaster.setFromCamera(ndc(x, y), camera);
    if (side === undefined) {
        const hits = raycaster.intersectObjects(walls.filter(w => !w.hidden).map(w => w.mesh), false);
        if (!hits.length) return null;
        side = walls.findIndex(w => w.mesh === hits[0].object);
    }
    const p = raycaster.ray.intersectPlane(wallPlanes[side], new THREE.Vector3());
    return p ? { side, p, a: WALL_SIDES[side].along === 'x' ? p.x : p.z } : null;
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
    const kind = item && kindOf(item);
    const base = { type: 'drag', uid: item?.uid, startX: e.clientX, startY: e.clientY, moved: false };
    let p = null;
    if (kind === 'wall') {
        p = wallPoint(e.clientX, e.clientY, item.rot);
        if (p) {
            const w = wallPlacement(item);
            const a = WALL_SIDES[item.rot].along === 'x' ? w.p.x : w.p.z;
            gesture = { ...base, offA: a - p.a, offY: w.p.y - p.p.y };
        }
    } else if (item) {
        // 小物は載っている高さの面で動かす
        const h = kind === 'small' ? smallBase(item) : 0;
        p = floorPoint(e.clientX, e.clientY, h);
        if (p) {
            const c = itemCenter(item);
            gesture = { ...base, height: h, offX: c.x - p.x, offZ: c.z - p.z, riders: ridersOf(item).map(r => ({ uid: r.uid, dx: r.gx - item.gx, dz: r.gz - item.gz })) };
        }
    }
    if (item && p) {
        select(item.uid);
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
        if (!item) return;
        if (kindOf(item) === 'wall') { dragOnWall(item, e); return; }
        const p = floorPoint(e.clientX, e.clientY, gesture.height);
        if (!p) return;
        const [fw, fd] = footprint(item);
        const gx = snapCell((p.x + gesture.offX + HALF) / CELL - fw / 2);
        const gz = snapCell((p.z + gesture.offZ + HALF) / CELL - fd / 2);
        if (gx !== item.gx || gz !== item.gz) {
            item.gx = gx; item.gz = gz;
            clampItem(item);
            // 上に載った小物もいっしょに動かす
            for (const r of gesture.riders) {
                const it = findItem(r.uid);
                if (!it) continue;
                it.gx = item.gx + r.dx; it.gz = item.gz + r.dz;
                placeObject(it);
            }
            placeObject(item);
        }
    }
});

// 壁掛けを動かす。指の先が別の壁に移ったら、その壁に掛け替える
function dragOnWall(item, e) {
    let h = wallPoint(e.clientX, e.clientY);
    if (h && h.side !== item.rot) {
        item.rot = h.side;
        gesture.offA = 0;
    } else h = wallPoint(e.clientX, e.clientY, item.rot);
    if (!h) return;
    const w = FURNITURE[item.type].size[0];
    const gx = snapCell((h.a + gesture.offA + HALF) / CELL - w / 2);
    const gz = snapWallY((h.p.y + gesture.offY) / WALL_STEP);
    item.gx = gx; item.gz = gz;
    clampItem(item);
    placeObject(item);
}

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
// 下から出る画面で家具が隠れるときだけ、隠れない分だけ映す範囲を静かにずらす（カメラの向きは変えない）
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');
let shiftAnim = 0;
function animateShift(to) {
    cancelAnimationFrame(shiftAnim);
    const from = viewShift;
    if (Math.abs(to - from) < 1 || reduceMotion.matches) { viewShift = to; resize(); return; }
    const t0 = performance.now(), dur = 260;
    const step = (now) => {
        const k = Math.min(1, (now - t0) / dur);
        viewShift = from + (to - from) * (1 - (1 - k) ** 3);
        resize();
        if (k < 1) shiftAnim = requestAnimationFrame(step);
    };
    shiftAnim = requestAnimationFrame(step);
}
function focusOn(item, sheet) {
    const g = objects.get(item.uid);
    if (!g) return;
    // 家具のいちばん下に映る位置（ずらしていないときの、view の中の y）
    const box = new THREE.Box3().setFromObject(g);
    const r = view.getBoundingClientRect(), h = view.clientHeight;
    let lowest = -Infinity;
    for (const x of [box.min.x, box.max.x]) for (const y of [box.min.y, box.max.y]) for (const z of [box.min.z, box.max.z]) {
        const p = new THREE.Vector3(x, y, z).project(camera);
        lowest = Math.max(lowest, (1 - p.y) / 2 * h + viewShift);
    }
    const limit = sheet.getBoundingClientRect().top - r.top - 16;
    animateShift(Math.min(Math.max(0, lowest - limit), h * 0.45));
}
function unfocus() {
    animateShift(0);
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
updateSnapButton();
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
    findCoplanarFaces, testBox: box, supportOf, splitTv, save: saveGame, smallBase, kindOf, walls: () => walls.map(w => !w.hidden), updateCamera, rebuildAll,
    viewShift: () => viewShift, visibleOf: (uid) => objects.get(uid).visible,
    meshColors: (uid) => { const s = new Set(); objects.get(uid).traverse(o => { if (o.isMesh) s.add('#' + o.material.color.getHexString()); }); return [...s]; },
    game: () => game, selected: () => selectedUid, cam, addItem, savePreset, loadPreset, openColorDialog, setHsl, hslOf, undo, redo, showTab, history: () => ({ undo: undoStack.length, redo: redoStack.length }), hslToHex, filter, rotateSelected, removeSelected, select, isBlocked, footprint, APP_VERSION, FURNITURE,
    // 家具の中心が画面のどこに映るか（クライアント座標）
    screenOf(uid, height = 0.3) {
        const item = findItem(uid);
        const kind = kindOf(item);
        const p = kind === 'wall' ? wallPlacement(item).p.addScaledVector(walls[item.rot].normal, -0.03) : itemCenter(item);
        p.y += height + (kind === 'small' ? smallBase(item) : 0);
        p.project(camera);
        const r = canvas.getBoundingClientRect();
        return { x: r.left + (p.x + 1) / 2 * r.width, y: r.top + (1 - p.y) / 2 * r.height };
    },
};
