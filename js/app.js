// LifeMaker（2D 版）: 斜め上から見た部屋に家具を置き、住人が暮らす。
// 絵は画像生成AIで作り、tools/cut_sprites.py で img/ に書き出したものを使う（作り方は art/README.md）。

const APP_VERSION = '0.8.2';
const SAVE_KEY = 'lifemaker2d_save';
const SAVE_VERSION = 1;

// ---------- 部屋の大きさと見え方 ----------
// 1 マス 0.5m、N×N マス。gx は右下へ、gz は左下へ伸びる（奥の角が原点）。y は高さ（m）
const N = 10;
const CELL_W = 64, CELL_H = 32; // 1 マスの、画面での横幅・高さ（px、拡大 1 のとき）
const PX_PER_M = 80;            // 高さ 1m の画面での長さ
const WALL_H = 2.5;
function P(gx, gz, y = 0) { return [(gx - gz) * CELL_W / 2, (gx + gz) * CELL_H / 2 - y * PX_PER_M]; }
// 画面の点 → 床（高さ y）の上のマス目の位置
function unP(x, yy, y = 0) {
    const a = x / (CELL_W / 2), b = (yy + y * PX_PER_M) / (CELL_H / 2);
    return [(a + b) / 2, (b - a) / 2];
}

// ---------- 家具の定義 ----------
// size: [gx 方向, gz 方向]（マス）。絵は「正面が左下（+gz）」で描く。rot 1 は左右反転（正面が右下、大きさも入れ替わる）
// art: img/ の絵。絵は足元の四角の横幅に合わせて縮める。fitHeight（m）があれば、その高さに合わせる
// draw: 絵がまだない家具をコードで描く（仮の絵）
// use: 住人の使い方（sit 座る / lie 寝る / look 眺める）。seats: 座る席の位置（横幅の割合）
const FURNITURE = {
    bed: { name: 'ベッド', size: [2, 4], art: 'bed', use: 'lie', lines: ['おやすみ…', 'すやすや'] },
    sofa: { name: 'ソファ', size: [4, 2], art: 'sofa', use: 'sit', seats: [0.3, 0.7], lines: ['ふう、ひと休み', 'このソファ、ふかふか', 'のんびりしよう'] },
    chair: { name: 'いす', size: [1, 1], art: 'chair', use: 'sit', seats: [0.5], lines: ['ちょっと座ろう', 'いすがちょうどいい'] },
    table: { name: 'テーブル', size: [3, 2], art: 'table', use: 'look', lines: ['ごはん、何にしよう', 'お茶にしよう'] },
    lowtable: { name: 'ローテーブル', size: [2, 2], art: 'lowtable', fitHeight: 0.45, use: 'look', lines: ['いい香り', 'ひと息つこう'] },
    desk: { name: '机', size: [2, 1], art: 'desk', use: 'look', lines: ['ちょっと調べもの', 'がんばるぞ'] },
    bookshelf: { name: '本棚', size: [2, 1], art: 'bookshelf', use: 'look', lines: ['何を読もうかな', 'この本、おもしろそう'] },
    wardrobe: { name: 'クローゼット', size: [2, 1], art: 'wardrobe', use: 'look', lines: ['今日は何を着よう', 'おしゃれしたいな'] },
    chest: { name: 'チェスト', size: [2, 1], art: 'chest', use: 'look', lines: ['何をしまったっけ'] },
    nightstand: { name: 'サイドテーブル', size: [1, 1], art: 'nightstand' },
    tvstand: { name: 'テレビ台', size: [3, 1], art: 'tvstand', use: 'look', lines: ['テレビ、置きたいな'] },
    lamp: { name: 'スタンドライト', size: [1, 1], art: 'lamp' },
    lamp2: { name: 'スタンドライト（フリンジ）', size: [1, 1], art: 'lamp2' },
    plant: { name: '観葉植物', size: [1, 1], art: 'plant', use: 'look', lines: ['水やりしなきゃ', '葉っぱがきれい'] },
    plant2: { name: '観葉植物（小）', size: [1, 1], art: 'plant2', use: 'look', lines: ['すくすく育ってる', '葉っぱがきれい'] },
    rug: { name: 'ラグ', icon: '🟥', size: [4, 3], draw: drawRug, flat: true },
};

// ---------- 色と線 ----------
const INK = '#2f2b40';
function mix(a, b, t) {
    const pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16);
    return '#' + [16, 8, 0].map(s => Math.round(((pa >> s) & 255) + (((pb >> s) & 255) - ((pa >> s) & 255)) * t).toString(16).padStart(2, '0')).join('');
}

// ---------- 状態とセーブ ----------
function makeDefaultGame() {
    return {
        saveVersion: SAVE_VERSION,
        appearance: 'auto',
        nextUid: 6,
        items: [
            { uid: 1, type: 'rug', gx: 3, gz: 4, rot: 0 },
            { uid: 2, type: 'bed', gx: 6, gz: 0, rot: 0 },
            { uid: 3, type: 'plant', gx: 9, gz: 0, rot: 0 },
            { uid: 4, type: 'sofa', gx: 0, gz: 5, rot: 1 },
            { uid: 5, type: 'lowtable', gx: 4, gz: 5, rot: 0 },
        ],
        resident: { show: true, name: 'ヴァンプ子' },
        presets: [], // { id, name, savedAt, items }
        nextPresetId: 1,
    };
}
const MAX_PRESETS = 30;
let game = makeDefaultGame();
let resetting = false;

function toInt(v) { const n = Math.round(Number(v)); return Number.isFinite(n) ? n : 0; }
function footprint(item) {
    const [w, d] = FURNITURE[item.type].size;
    return item.rot ? [d, w] : [w, d];
}
function clampItem(item) {
    const [w, d] = footprint(item);
    item.gx = Math.min(Math.max(item.gx, 0), N - w);
    item.gz = Math.min(Math.max(item.gz, 0), N - d);
}
// 家具の一覧の形をそろえる。重複・知らない家具を除き、部屋からはみ出すものは中に入れる
function sanitizeItems(list) {
    if (!Array.isArray(list)) return [];
    const seen = new Set();
    return list
        .filter(it => it && FURNITURE[it.type] && Number.isInteger(it.uid) && !seen.has(it.uid) && seen.add(it.uid))
        .map(it => {
            const item = { uid: it.uid, type: it.type, gx: toInt(it.gx), gz: toInt(it.gz), rot: it.rot ? 1 : 0 };
            clampItem(item);
            return item;
        });
}
function saveGame() {
    if (resetting) return;
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(game)); } catch (err) { console.error(err); }
    recordHistory();
    requestRender();
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
    game.nextUid = Math.max(toInt(p.nextUid), game.items.reduce((m, it) => Math.max(m, it.uid), 0) + 1);
    if (p.resident && typeof p.resident === 'object') {
        game.resident.show = p.resident.show !== false;
        if (typeof p.resident.name === 'string') game.resident.name = p.resident.name.trim().slice(0, 12);
    }
    if (Array.isArray(p.presets)) {
        const ids = new Set();
        game.presets = p.presets
            .filter(ps => ps && Number.isInteger(ps.id) && !ids.has(ps.id) && ids.add(ps.id))
            .map(ps => ({ id: ps.id, name: String(ps.name || 'プリセット').slice(0, 30), savedAt: Number(ps.savedAt) || 0, items: sanitizeItems(ps.items) }))
            .slice(0, MAX_PRESETS);
    }
    game.nextPresetId = Math.max(toInt(p.nextPresetId), game.presets.reduce((m, ps) => Math.max(m, ps.id), 0) + 1);
}

// ---------- 配置の計算 ----------
function findItem(uid) { return game.items.find(it => it.uid === uid); }
function overlaps(a, b) {
    const [aw, ad] = footprint(a), [bw, bd] = footprint(b);
    return a.gx < b.gx + bw && b.gx < a.gx + aw && a.gz < b.gz + bd && b.gz < a.gz + ad;
}
function isBlocked(item) {
    if (FURNITURE[item.type].flat) return false;
    return game.items.some(o => o.uid !== item.uid && !FURNITURE[o.type].flat && overlaps(item, o));
}
// 部屋の中心に近い、空いている場所
function findFreeSpot(item) {
    const [w, d] = footprint(item);
    let best = null, bestDist = Infinity;
    for (let gz = 0; gz <= N - d; gz++) for (let gx = 0; gx <= N - w; gx++) {
        if (isBlocked({ ...item, gx, gz })) continue;
        const dist = (gx + w / 2 - N / 2) ** 2 + (gz + d / 2 - N / 2) ** 2;
        if (dist < bestDist) { bestDist = dist; best = { gx, gz }; }
    }
    return best || { gx: Math.floor((N - w) / 2), gz: Math.floor((N - d) / 2) };
}

// ---------- 絵 ----------
// 絵ごとに、当たり判定用の不透明の地図も作る
const images = new Map(); // name → { img, w, h, alpha }
function loadImage(name) {
    return new Promise((resolve) => {
        const img = new Image();
        img.onload = () => {
            const c = document.createElement('canvas');
            c.width = img.naturalWidth; c.height = img.naturalHeight;
            const g = c.getContext('2d');
            g.drawImage(img, 0, 0);
            let alpha = null;
            try {
                const d = g.getImageData(0, 0, c.width, c.height).data;
                alpha = new Uint8Array(c.width * c.height);
                for (let i = 0; i < alpha.length; i++) alpha[i] = d[i * 4 + 3];
            } catch (e) { /* file:// などで読めないときは四角で判定する */ }
            images.set(name, { img, w: img.naturalWidth, h: img.naturalHeight, alpha });
            resolve();
        };
        img.onerror = () => { console.error('絵を読めません: ' + name); resolve(); };
        img.src = `img/${name}.webp?v=${APP_VERSION}`;
    });
}
const RESIDENT_FRAMES = { stand: 1, walkA: 2, walkB: 3, back: 4, sit: 5, lie: 6, happy: 7, wave: 8 };
function loadAll() {
    const names = Object.values(FURNITURE).filter(d => d.art).map(d => d.art);
    for (const n of Object.values(RESIDENT_FRAMES)) names.push(`resident_${n}`);
    return Promise.all(names.map(loadImage));
}
// 家具の絵を置く四角（部屋の座標）。足元の四角の左端・右端・下端に合わせる
function artRect(item) {
    const def = FURNITURE[item.type], im = images.get(def.art);
    const [w, d] = footprint(item);
    const left = P(item.gx, item.gz + d)[0], right = P(item.gx + w, item.gz)[0], bottom = P(item.gx + w, item.gz + d)[1];
    if (!im) return { x: left, y: bottom - 100, w: right - left, h: 100, flip: !!item.rot, im: null };
    if (def.fitHeight) {
        // 高さに合わせて縮め、足元の四角の真ん中にそろえる
        const k = (def.fitHeight * PX_PER_M + (w + d) * CELL_H / 2) / im.h, cx = (left + right) / 2;
        return { x: cx - im.w * k / 2, y: bottom - im.h * k, w: im.w * k, h: im.h * k, flip: !!item.rot, im };
    }
    const k = (right - left) / im.w;
    return { x: left, y: bottom - im.h * k, w: right - left, h: im.h * k, flip: !!item.rot, im };
}
function drawImageRect(g, r) {
    if (!r.im) return;
    if (r.flip) {
        g.save();
        g.translate(r.x + r.w, r.y);
        g.scale(-1, 1);
        g.drawImage(r.im.img, 0, 0, r.w, r.h);
        g.restore();
    } else g.drawImage(r.im.img, r.x, r.y, r.w, r.h);
}
// 部屋の点 (x, y) が絵の不透明な所に当たるか
function hitRect(r, x, y) {
    if (x < r.x || x > r.x + r.w || y < r.y || y > r.y + r.h) return false;
    if (!r.im || !r.im.alpha) return true;
    let u = (x - r.x) / r.w;
    if (r.flip) u = 1 - u;
    const px = Math.min(r.im.w - 1, Math.floor(u * r.im.w)), py = Math.min(r.im.h - 1, Math.floor((y - r.y) / r.h * r.im.h));
    return r.im.alpha[py * r.im.w + px] > 60;
}

// ---- 形を描く小さな関数（仮の絵・部屋） ----
function path(g, pts) { g.beginPath(); g.moveTo(...pts[0]); for (let i = 1; i < pts.length; i++) g.lineTo(...pts[i]); g.closePath(); }
function fillLine(g, fill, w = 1.3, line = mix(fill, INK, 0.72)) {
    g.fillStyle = fill; g.fill();
    if (w) { g.strokeStyle = line; g.lineWidth = w; g.lineJoin = 'round'; g.stroke(); }
}
function quad(g, a, b, c, d, fill, w) { path(g, [a, b, c, d]); fillLine(g, fill, w); }
function ellipseAt(g, x, y, rx, ry, fill, w = 1.3) { g.beginPath(); g.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2); fillLine(g, fill, w); }
// ぼかした形（影・光）。ぼかしは shadowBlur で作る（ctx.filter が使えないブラウザでも動く）
function softShape(g, pts, color, blur) {
    const off = 10000;
    g.save();
    g.translate(-off, 0);
    g.shadowColor = color;
    g.shadowBlur = blur * view.scale * view.dpr;
    g.shadowOffsetX = off * view.scale * view.dpr;
    path(g, pts);
    g.fillStyle = '#000';
    g.fill();
    g.restore();
}
function floorShadow(g, gx, gz, w, d, alpha = 0.22) {
    softShape(g, [P(gx - 0.05, gz - 0.05), P(gx + w + 0.3, gz - 0.05), P(gx + w + 0.3, gz + d + 0.2), P(gx - 0.05, gz + d + 0.2)], `rgba(40, 28, 50, ${alpha})`, 10);
}

// 仮の絵: ラグ
function drawRug(g, item) {
    const [w, d] = footprint(item), { gx, gz } = item;
    quad(g, P(gx, gz), P(gx + w, gz), P(gx + w, gz + d), P(gx, gz + d), '#7d4a52');
    quad(g, P(gx + 0.25, gz + 0.25), P(gx + w - 0.25, gz + 0.25), P(gx + w - 0.25, gz + d - 0.25), P(gx + 0.25, gz + d - 0.25), '#a35e62', 0.8);
    for (let i = 0.9; i < w - 0.4; i += 1.1) for (let j = 0.8; j < d - 0.4; j += 0.9) {
        quad(g, P(gx + i, gz + j - 0.28), P(gx + i + 0.28, gz + j), P(gx + i, gz + j + 0.28), P(gx + i - 0.28, gz + j), '#d6a07a', 0.7);
    }
    g.strokeStyle = '#cfb9a0'; g.lineWidth = 1.2;
    for (let t = 0.1; t < w; t += 0.18) { g.beginPath(); g.moveTo(...P(gx + t, gz + d)); g.lineTo(...P(gx + t, gz + d + 0.14)); g.stroke(); }
}
// 仮の絵の当たり判定: 足元の四角を、高さの分だけ上に伸ばした形
function drawHit(item, x, y) {
    const [w, d] = footprint(item), h = FURNITURE[item.type].height || 0;
    const inside = ([a, b]) => a >= item.gx && a <= item.gx + w && b >= item.gz && b <= item.gz + d;
    for (let t = 0; t <= h + 1e-6; t += 0.1) if (inside(unP(x, y, t))) return true;
    return false;
}

// ---------- 部屋を描く ----------
const WIN = { x: 2.4, w: 2.8, y: 1.0, h: 1.2 }; // 右奥の壁の窓
function drawRoom(g) {
    quad(g, P(0, 0, 0), P(0, N, 0), P(0, N, WALL_H), P(0, 0, WALL_H), '#e4ddd2');
    quad(g, P(0, 0, 0), P(N, 0, 0), P(N, 0, WALL_H), P(0, 0, WALL_H), '#d8cfc2');
    // 腰壁（板張り）
    quad(g, P(0, 0, 0), P(0, N, 0), P(0, N, 0.85), P(0, 0, 0.85), '#cdbba5');
    quad(g, P(0, 0, 0), P(N, 0, 0), P(N, 0, 0.85), P(0, 0, 0.85), '#bfac95');
    g.lineWidth = 0.8;
    for (let i = 0.5; i < N; i += 0.5) {
        g.strokeStyle = '#a89580'; g.beginPath(); g.moveTo(...P(0, i, 0.08)); g.lineTo(...P(0, i, 0.8)); g.stroke();
        g.strokeStyle = '#9c8a75'; g.beginPath(); g.moveTo(...P(i, 0, 0.08)); g.lineTo(...P(i, 0, 0.8)); g.stroke();
    }
    quad(g, P(0, 0, 0.85), P(0, N, 0.85), P(0, N, 0.92), P(0, 0, 0.92), '#a88d72');
    quad(g, P(0, 0, 0.85), P(N, 0, 0.85), P(N, 0, 0.92), P(0, 0, 0.92), '#977d64');
    // 床（板と木目、色むら）
    const floor = [P(0, 0), P(N, 0), P(N, N), P(0, N)];
    path(g, floor); fillLine(g, '#b68b65', 0);
    g.save();
    path(g, floor);
    g.clip();
    g.strokeStyle = 'rgba(143,106,76,0.55)'; g.lineWidth = 0.9;
    for (let k = 1; k < N * 3; k++) { g.beginPath(); g.moveTo(...P(k / 3, 0)); g.lineTo(...P(k / 3, N)); g.stroke(); }
    for (let k = 0; k < N * 3; k++) for (let j = 0; j < 3; j++) {
        const z = ((k * 7 + j * 13) % 29) / 29 * (N - 1) + 0.4;
        g.beginPath(); g.moveTo(...P(k / 3, z)); g.lineTo(...P(k / 3 + 1 / 3, z)); g.stroke();
    }
    for (let k = 0; k < 40; k++) {
        const [x, y] = P((k * 37 % 97) / 97 * N, (k * 53 % 89) / 89 * N);
        g.fillStyle = k % 2 ? 'rgba(201,157,118,0.25)' : 'rgba(160,119,82,0.25)';
        g.beginPath(); g.ellipse(x, y, 18 + k % 5 * 4, 7 + k % 3 * 2, 0, 0, Math.PI * 2); g.fill();
    }
    // 窓から差す光
    softShape(g, [P(WIN.x + 0.2, 0.2), P(WIN.x + WIN.w, 0.2), P(WIN.x + WIN.w + 1.6, 2.6), P(WIN.x + 1.8, 2.6)], 'rgba(255, 244, 220, 0.3)', 14);
    g.restore();
    path(g, floor);
    g.strokeStyle = INK; g.lineWidth = 1.4; g.stroke();
    drawWindow(g);
    drawPicture(g);
}
function drawWindow(g) {
    const { x: wx, w: ww, y: wy, h: wh } = WIN;
    quad(g, P(wx, 0.02, wy), P(wx + ww, 0.02, wy), P(wx + ww, 0.02, wy + wh), P(wx, 0.02, wy + wh), '#efe9df');
    quad(g, P(wx + 0.14, 0.03, wy + 0.1), P(wx + ww - 0.14, 0.03, wy + 0.1), P(wx + ww - 0.14, 0.03, wy + wh - 0.1), P(wx + 0.14, 0.03, wy + wh - 0.1), '#a9c4d6');
    path(g, [P(wx + 0.3, 0.04, wy + wh - 0.15), P(wx + 1.1, 0.04, wy + wh - 0.15), P(wx + 0.5, 0.04, wy + 0.15), P(wx + 0.2, 0.04, wy + 0.15)]);
    g.fillStyle = 'rgba(255,255,255,0.35)'; g.fill();
    g.strokeStyle = '#efe9df'; g.lineWidth = 3.5;
    g.beginPath(); g.moveTo(...P(wx + ww / 2, 0.03, wy + 0.1)); g.lineTo(...P(wx + ww / 2, 0.03, wy + wh - 0.1)); g.stroke();
    g.lineWidth = 3; g.beginPath(); g.moveTo(...P(wx + 0.14, 0.03, wy + wh / 2)); g.lineTo(...P(wx + ww - 0.14, 0.03, wy + wh / 2)); g.stroke();
    for (const [x0, x1] of [[wx - 0.45, wx + 0.2], [wx + ww - 0.2, wx + ww + 0.45]]) {
        quad(g, P(x0, 0.08, wy + wh + 0.3), P(x1, 0.08, wy + wh + 0.3), P(x1 + 0.08, 0.08, wy - 0.25), P(x0 - 0.08, 0.08, wy - 0.25), '#8e4a52');
        g.strokeStyle = '#6e3640'; g.lineWidth = 0.9;
        for (let t = 0.25; t < 1; t += 0.25) {
            const xm = x0 + (x1 - x0) * t;
            g.beginPath(); g.moveTo(...P(xm, 0.09, wy + wh + 0.28)); g.lineTo(...P(xm + (t - 0.5) * 0.12, 0.09, wy - 0.22)); g.stroke();
        }
    }
    g.strokeStyle = '#4a3a3a'; g.lineWidth = 2.2;
    g.beginPath(); g.moveTo(...P(wx - 0.6, 0.1, wy + wh + 0.32)); g.lineTo(...P(wx + ww + 0.6, 0.1, wy + wh + 0.32)); g.stroke();
}
function drawPicture(g) {
    quad(g, P(0.03, 2.0, 1.25), P(0.03, 3.9, 1.25), P(0.03, 3.9, 2.05), P(0.03, 2.0, 2.05), '#3f3438');
    quad(g, P(0.04, 2.12, 1.33), P(0.04, 3.78, 1.33), P(0.04, 3.78, 1.97), P(0.04, 2.12, 1.97), '#7a8a8e');
    path(g, [P(0.05, 2.2, 1.36), P(0.05, 3.0, 1.36), P(0.05, 2.6, 1.75)]); fillLine(g, '#5d6e6a', 0.8);
    path(g, [P(0.05, 2.7, 1.36), P(0.05, 3.7, 1.36), P(0.05, 3.25, 1.85)]); fillLine(g, '#4e5e5c', 0.8);
}

// ---------- 画面とカメラ ----------
const canvas = document.getElementById('scene');
const viewEl = document.getElementById('view');
const ctx = canvas.getContext('2d');
// scale: 拡大率（1 で 1 マス 64px）。cx, cy: 画面の真ん中に映す部屋の点。fit: 部屋全体が入る拡大率
const view = { scale: 1, cx: 0, cy: 120, fit: 1, w: 1, h: 1, dpr: 1 };
const ROOM_BOX = { x0: -N * CELL_W / 2 - 10, x1: N * CELL_W / 2 + 10, y0: -WALL_H * PX_PER_M - 10, y1: N * CELL_H + 16 };
function fitView() {
    const bw = ROOM_BOX.x1 - ROOM_BOX.x0, bh = ROOM_BOX.y1 - ROOM_BOX.y0;
    view.fit = Math.min(view.w / bw, view.h / bh) * 0.96;
    view.scale = view.fit;
    view.cx = (ROOM_BOX.x0 + ROOM_BOX.x1) / 2;
    view.cy = (ROOM_BOX.y0 + ROOM_BOX.y1) / 2;
}
function clampView() {
    view.scale = Math.min(Math.max(view.scale, view.fit * 0.8), view.fit * 4);
    // 部屋が画面から出ていかないように
    view.cx = Math.min(Math.max(view.cx, ROOM_BOX.x0), ROOM_BOX.x1);
    view.cy = Math.min(Math.max(view.cy, ROOM_BOX.y0), ROOM_BOX.y1);
}
// 部屋の座標 ⇔ 画面（view の左上が 0）の座標
function toScreen(x, y) { return [(x - view.cx) * view.scale + view.w / 2, (y - view.cy) * view.scale + view.h / 2]; }
function toWorld(clientX, clientY) {
    const r = canvas.getBoundingClientRect();
    return [(clientX - r.left - view.w / 2) / view.scale + view.cx, (clientY - r.top - view.h / 2) / view.scale + view.cy];
}
// 画面の点 (clientX, clientY) を動かさずに拡大率を変える
function zoomAt(clientX, clientY, scale) {
    const [wx, wy] = toWorld(clientX, clientY);
    view.scale = scale;
    clampView();
    const r = canvas.getBoundingClientRect();
    view.cx = wx - (clientX - r.left - view.w / 2) / view.scale;
    view.cy = wy - (clientY - r.top - view.h / 2) / view.scale;
    clampView();
    requestRender();
}
let firstResize = true;
function resize() {
    const w = viewEl.clientWidth, h = viewEl.clientHeight;
    if (!w || !h) return;
    const keep = view.scale / view.fit, { cx, cy } = view;
    Object.assign(view, { w, h, dpr: Math.min(window.devicePixelRatio || 1, 2) });
    canvas.width = Math.round(w * view.dpr); canvas.height = Math.round(h * view.dpr);
    fitView();
    if (!firstResize) { view.scale = view.fit * keep; view.cx = cx; view.cy = cy; clampView(); }
    firstResize = false;
    render();
}
new ResizeObserver(resize).observe(viewEl);

let renderQueued = false;
function requestRender() {
    if (renderQueued) return;
    renderQueued = true;
    requestAnimationFrame(() => { renderQueued = false; render(); });
}

// 奥から手前の順に並べる。箱 [x0, x1] × [z0, z1] が重ならなければ、小さい側が奥
function behind(a, b) {
    if (a.x1 <= b.x0 + 1e-6 || a.z1 <= b.z0 + 1e-6) return true;
    if (b.x1 <= a.x0 + 1e-6 || b.z1 <= a.z0 + 1e-6) return false;
    return a.x0 + a.x1 + a.z0 + a.z1 < b.x0 + b.x1 + b.z0 + b.z1;
}
function sortForDraw(list) {
    // 数が少ないので、「まだ描いていない物の中に、自分より奥の物がない」物から順に取り出す
    const rest = [...list], out = [];
    while (rest.length) {
        let idx = rest.findIndex(a => !rest.some(b => b !== a && behind(b, a) && !behind(a, b)));
        if (idx < 0) idx = 0; // 輪になったときは、そのまま出す
        out.push(rest.splice(idx, 1)[0]);
    }
    return out;
}
let drawList = []; // 最後に描いた順
// 家具と住人を、奥から描く順に並べる
function buildDrawList() {
    const objs = game.items.filter(it => !FURNITURE[it.type].flat).map(it => {
        const [w, d] = footprint(it);
        return { item: it, x0: it.gx, x1: it.gx + w, z0: it.gz, z1: it.gz + d };
    });
    const r = resident;
    let resObj = null;
    if (r.visible) {
        resObj = { resident: true, x0: r.x - 0.2, x1: r.x + 0.2, z0: r.z - 0.2, z1: r.z + 0.2 };
        // 座っている・寝ている間は、その家具のすぐ後に描く
        if (!seated()) objs.push(resObj);
    }
    const list = sortForDraw(objs);
    if (resObj && !list.includes(resObj)) list.splice(list.findIndex(o => o.item?.uid === r.use.plan.uid) + 1, 0, resObj);
    return list;
}
function render() {
    const g = ctx;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, canvas.width, canvas.height);
    const s = view.scale * view.dpr;
    g.setTransform(s, 0, 0, s, (view.w / 2 - view.cx * view.scale) * view.dpr, (view.h / 2 - view.cy * view.scale) * view.dpr);
    g.imageSmoothingQuality = 'high';
    drawRoom(g);
    // 敷物 → 選んだ印 → 家具と住人（奥から）
    for (const it of game.items) if (FURNITURE[it.type].flat) FURNITURE[it.type].draw(g, it);
    drawMarker(g);
    drawList = buildDrawList();
    for (const o of drawList) {
        if (o.resident) { drawResident(g); continue; }
        const def = FURNITURE[o.item.type];
        if (def.draw) { def.draw(g, o.item); continue; }
        const [w, d] = footprint(o.item);
        floorShadow(g, o.item.gx, o.item.gz, w, d);
        drawImageRect(g, artRect(o.item));
    }
    updateBubble();
}
// 選んだ家具の足元の印（重なっていれば赤）とマス目
function drawMarker(g) {
    const it = findItem(selectedUid);
    if (!it) return;
    g.strokeStyle = 'rgba(60, 40, 30, 0.12)'; g.lineWidth = 1;
    for (let k = 1; k < N; k++) {
        g.beginPath(); g.moveTo(...P(k, 0)); g.lineTo(...P(k, N)); g.stroke();
        g.beginPath(); g.moveTo(...P(0, k)); g.lineTo(...P(N, k)); g.stroke();
    }
    const [w, d] = footprint(it);
    path(g, [P(it.gx, it.gz), P(it.gx + w, it.gz), P(it.gx + w, it.gz + d), P(it.gx, it.gz + d)]);
    const red = isBlocked(it);
    g.fillStyle = red ? 'rgba(217, 83, 79, 0.35)' : 'rgba(217, 119, 75, 0.25)';
    g.fill();
    g.setLineDash([6, 4]);
    g.strokeStyle = red ? '#d9534f' : '#d9774b'; g.lineWidth = 2;
    g.stroke();
    g.setLineDash([]);
}

// ---------- 選択と操作 ----------
let selectedUid = null;
const toolbar = document.getElementById('toolbar');
const selName = document.getElementById('sel-name');
const hint = document.getElementById('hint');
function select(uid) {
    selectedUid = findItem(uid) ? uid : null;
    toolbar.hidden = selectedUid === null;
    if (selectedUid !== null) {
        selName.textContent = FURNITURE[findItem(uid).type].name;
        hint.classList.add('hidden');
    }
    requestRender();
}
function addItem(type) {
    const item = { uid: game.nextUid++, type, gx: 0, gz: 0, rot: 0 };
    Object.assign(item, findFreeSpot(item));
    game.items.push(item);
    select(item.uid);
    saveGame();
    residentNotice(item);
}
// 向きを変える（左右反転）。足元の真ん中はなるべく動かさない
function rotateSelected() {
    const it = findItem(selectedUid);
    if (!it) return;
    const [w, d] = footprint(it);
    const cx = it.gx + w / 2, cz = it.gz + d / 2;
    it.rot = it.rot ? 0 : 1;
    const [w2, d2] = footprint(it);
    it.gx = Math.round(cx - w2 / 2); it.gz = Math.round(cz - d2 / 2);
    clampItem(it);
    saveGame();
}
function removeSelected() {
    const it = findItem(selectedUid);
    if (!it) return;
    game.items = game.items.filter(o => o !== it);
    select(null);
    saveGame();
}
document.getElementById('rotate-btn').addEventListener('click', rotateSelected);
document.getElementById('remove-btn').addEventListener('click', removeSelected);
document.getElementById('done-btn').addEventListener('click', () => select(null));
window.addEventListener('keydown', (e) => {
    if (e.target.closest('input, textarea') || document.querySelector('dialog[open]')) return;
    const mod = e.ctrlKey || e.metaKey, key = e.key.toLowerCase();
    if (mod && key === 'z' && !e.shiftKey) { e.preventDefault(); undo(); return; }
    if (mod && (key === 'y' || (key === 'z' && e.shiftKey))) { e.preventDefault(); redo(); return; }
    if (selectedUid === null) return;
    if (key === 'r') rotateSelected();
    else if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); removeSelected(); }
    else if (e.key === 'Escape') select(null);
});

// ---------- 指・マウスの操作 ----------
const pointers = new Map();
let gesture = null;
const DOUBLE_TAP_MS = 350;
let lastTap = null;
function hitItem(item, x, y) {
    const def = FURNITURE[item.type];
    if (def.flat) { const [w, d] = footprint(item), [a, b] = unP(x, y); return a >= item.gx && a <= item.gx + w && b >= item.gz && b <= item.gz + d; }
    return def.draw ? drawHit(item, x, y) : hitRect(artRect(item), x, y);
}
// 押した所にある家具（手前から。敷物は最後）
function pickItem(clientX, clientY) {
    const [x, y] = toWorld(clientX, clientY);
    const list = buildDrawList();
    for (let i = list.length - 1; i >= 0; i--) {
        const o = list[i];
        if (!o.resident && hitItem(o.item, x, y)) return o.item;
    }
    for (let i = game.items.length - 1; i >= 0; i--) {
        const it = game.items[i];
        if (FURNITURE[it.type].flat && hitItem(it, x, y)) return it;
    }
    return null;
}
// 住人を押したか（住人より手前の家具に隠れていないとき）
function residentHit(clientX, clientY) {
    if (!resident.visible) return false;
    const [x, y] = toWorld(clientX, clientY);
    if (!hitRect(residentRect(), x, y)) return false;
    const list = buildDrawList(), ri = list.findIndex(o => o.resident);
    for (let i = list.length - 1; i > ri; i--) if (hitItem(list[i].item, x, y)) return false;
    return true;
}
function pinchInfo() {
    const [a, b] = [...pointers.values()];
    return { dist: Math.hypot(a.x - b.x, a.y - b.y), mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2 };
}
canvas.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    e.preventDefault();
    canvas.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 2) {
        if (gesture?.type === 'drag' && gesture.moved) saveGame();
        gesture = { type: 'pinch', ...pinchInfo() };
        return;
    }
    if (pointers.size > 2) return;
    const base = { startX: e.clientX, startY: e.clientY, lastX: e.clientX, lastY: e.clientY, moved: false };
    if (residentHit(e.clientX, e.clientY)) { gesture = { type: 'pan', resident: true, ...base }; return; }
    const item = pickItem(e.clientX, e.clientY);
    if (item) {
        const [gx, gz] = unP(...toWorld(e.clientX, e.clientY));
        gesture = { type: 'drag', uid: item.uid, offX: item.gx - gx, offZ: item.gz - gz, ...base };
        select(item.uid);
    } else gesture = { type: 'pan', ...base };
});
canvas.addEventListener('pointermove', (e) => {
    if (!pointers.has(e.pointerId)) return;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (!gesture) return;
    if (gesture.type === 'pinch') {
        if (pointers.size < 2) return;
        const now = pinchInfo();
        // 指の真ん中の点が、指といっしょに動くように
        const [wx, wy] = toWorld(gesture.mx, gesture.my);
        if (now.dist > 0 && gesture.dist > 0) view.scale *= now.dist / gesture.dist;
        clampView();
        const r = canvas.getBoundingClientRect();
        view.cx = wx - (now.mx - r.left - view.w / 2) / view.scale;
        view.cy = wy - (now.my - r.top - view.h / 2) / view.scale;
        clampView();
        Object.assign(gesture, now);
        requestRender();
        return;
    }
    if (!gesture.moved && Math.hypot(e.clientX - gesture.startX, e.clientY - gesture.startY) > (e.pointerType === 'touch' ? 8 : 4)) {
        gesture.moved = true;
        hint.classList.add('hidden');
    }
    if (!gesture.moved) return;
    if (gesture.type === 'pan') {
        view.cx -= (e.clientX - gesture.lastX) / view.scale;
        view.cy -= (e.clientY - gesture.lastY) / view.scale;
        gesture.lastX = e.clientX; gesture.lastY = e.clientY;
        clampView();
        requestRender();
    } else if (gesture.type === 'drag') {
        const it = findItem(gesture.uid);
        if (!it) return;
        const [gx, gz] = unP(...toWorld(e.clientX, e.clientY));
        const nx = Math.round(gx + gesture.offX), nz = Math.round(gz + gesture.offZ);
        if (nx !== it.gx || nz !== it.gz) {
            it.gx = nx; it.gz = nz;
            clampItem(it);
            requestRender();
        }
    }
});
function endPointer(e) {
    if (!pointers.has(e.pointerId)) return;
    pointers.delete(e.pointerId);
    if (!gesture) return;
    if (gesture.type === 'drag') {
        if (gesture.moved) { saveGame(); lastTap = null; }
        else if (e.type === 'pointerup') {
            // 同じ家具を素早く 2 回タップしたら向きを変える
            const now = performance.now();
            if (lastTap && lastTap.uid === gesture.uid && now - lastTap.time < DOUBLE_TAP_MS && Math.hypot(e.clientX - lastTap.x, e.clientY - lastTap.y) < 30) {
                rotateSelected();
                lastTap = null;
            } else lastTap = { uid: gesture.uid, time: now, x: e.clientX, y: e.clientY };
        }
        gesture = null;
    } else if (gesture.type === 'pan') {
        if (!gesture.moved && e.type === 'pointerup') {
            if (gesture.resident) talkToResident();
            else select(null); // 何もない所をタップしたら選択をやめる
        }
        gesture = null;
    } else if (gesture.type === 'pinch') {
        // 1 本残ったら、そこから動かし続ける（飛ばないように位置を取り直す）
        const rest = [...pointers.values()][0];
        gesture = rest ? { type: 'pan', startX: rest.x, startY: rest.y, lastX: rest.x, lastY: rest.y, moved: true } : null;
    }
}
canvas.addEventListener('pointerup', endPointer);
canvas.addEventListener('pointercancel', endPointer);
canvas.addEventListener('contextmenu', (e) => e.preventDefault());
window.addEventListener('blur', () => { pointers.clear(); if (gesture?.type === 'drag' && gesture.moved) saveGame(); gesture = null; });
canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    zoomAt(e.clientX, e.clientY, view.scale * Math.exp(-e.deltaY * 0.0015));
}, { passive: false });

// ---------- 家具の一覧 ----------
function renderCatalog() {
    const wrap = document.getElementById('items');
    wrap.innerHTML = '';
    for (const [type, def] of Object.entries(FURNITURE)) {
        const b = document.createElement('button');
        b.className = 'item';
        b.dataset.type = type;
        b.innerHTML = def.art ? `<img src="img/${def.art}.webp?v=${APP_VERSION}" alt="">` : `<span class="swatch">${def.icon}</span>`;
        b.append(def.name);
        b.addEventListener('click', () => addItem(type));
        wrap.appendChild(b);
    }
}

// ---------- 住人 ----------
// 部屋を歩き回り、家具を使う。位置は保存しない（開くたびに部屋の真ん中近くから始まる）
const RES = {
    speed: 1.7,     // 歩く速さ（マス/秒）
    radius: 0.3,    // 家具とぶつからないための体の半径（マス）
    nav: 0.5,       // 道を探すマス目の大きさ（マス）
    height: 1.25,   // 立ったときの絵の高さ（m）
    fps: 30,        // 住人が動いている間の描き直しの回数（電池のため 30 回/秒まで）
};
const RES_GREETINGS = ['こんにちは！', 'いい部屋だね', '模様替え、たのしいね', 'なになに？', 'ふふっ'];
const RES_IDLE_LINES = ['♪', 'ふんふん♪', 'お散歩', 'ひろびろ'];
const resident = {
    x: 5, z: 5, dirX: 0, dirZ: 1,      // 位置と向き（マス）
    mode: 'idle',                       // idle 立ち止まる / walk 歩く / use 家具を使う
    path: [], plan: null, use: null,
    timer: 2, t: 0, hop: 0, step: 0, pose: null, poseUntil: 0,
    visible: false, frozen: false, last: 0, lastDraw: 0, recentUid: null,
    bubbleText: '', bubbleUntil: 0,
};
function screenDir() { const r = resident; return { sx: r.dirX - r.dirZ, sy: r.dirX + r.dirZ }; }
function seated() { const r = resident; return r.mode === 'use' && r.use.k > 0.5 && !!r.use.plan.anchor; }
// 向きと動きから絵を選ぶ。絵は左下向き。右下向きは反転。後ろ姿は右上向きで、左上は反転
function residentFrame() {
    const r = resident;
    if (r.pose && r.t < r.poseUntil) return { n: RESIDENT_FRAMES[r.pose], flip: screenDir().sx > 0 };
    if (seated()) return { n: RESIDENT_FRAMES[r.use.plan.act], flip: r.use.plan.flip };
    const { sx, sy } = screenDir();
    if (sy < -0.01) return { n: RESIDENT_FRAMES.back, flip: sx < 0 };
    const n = r.mode === 'walk' ? (Math.floor(r.step * 2) % 2 ? RESIDENT_FRAMES.walkA : RESIDENT_FRAMES.walkB) : RESIDENT_FRAMES.stand;
    return { n, flip: sx > 0 };
}
// 住人の絵を置く四角（部屋の座標）。足元の点に下端中央を合わせる
function residentRect() {
    const r = resident, f = residentFrame(), im = images.get(`resident_${f.n}`);
    const a = seated() ? r.use.plan.anchor : { x: r.x, z: r.z, lift: 0 };
    const [sx, sy] = P(a.x, a.z, a.lift);
    // 絵の高さはどれも同じ（足元をそろえて切り出している）
    const h = RES.height * PX_PER_M, w = im ? h * im.w / im.h : h * 0.8;
    const bob = r.mode === 'walk' ? Math.abs(Math.sin(r.step * Math.PI)) * 2 : 0;
    const hop = Math.sin(r.hop * Math.PI) * 10;
    return { x: sx - w / 2, y: sy - h + 3 - bob - hop, w, h, flip: f.flip, im };
}
function drawResident(g) {
    const r = resident;
    if (!seated()) {
        const [x, y] = P(r.x, r.z);
        g.fillStyle = 'rgba(58, 42, 64, 0.22)';
        g.beginPath(); g.ellipse(x, y, 16, 6, 0, 0, Math.PI * 2); g.fill();
    }
    drawImageRect(g, residentRect());
}

// ---- 歩ける場所（0.5 マスごと） ----
const NAV_N = Math.round(N / RES.nav);
function navCenter(i) { return (i + 0.5) * RES.nav; }
function navIndex(v) { return Math.min(NAV_N - 1, Math.max(0, Math.floor(v / RES.nav))); }
function buildNavGrid() {
    const g = new Uint8Array(NAV_N * NAV_N);
    const rects = game.items.filter(it => !FURNITURE[it.type].flat).map(it => { const [w, d] = footprint(it); return [it.gx, it.gz, it.gx + w, it.gz + d]; });
    const R = RES.radius;
    for (let j = 0; j < NAV_N; j++) for (let i = 0; i < NAV_N; i++) {
        const x = navCenter(i), z = navCenter(j);
        let b = x < R || z < R || x > N - R || z > N - R;
        for (const [x0, z0, x1, z1] of rects) { if (b) break; if (x > x0 - R && x < x1 + R && z > z0 - R && z < z1 + R) b = true; }
        g[j * NAV_N + i] = b ? 1 : 0;
    }
    return g;
}
function navFree(g, x, z) {
    if (x < 0 || z < 0 || x > N || z > N) return false;
    return !g[navIndex(z) * NAV_N + navIndex(x)];
}
// 2 点の間をまっすぐ歩けるか
function navLine(g, ax, az, bx, bz) {
    const n = Math.ceil(Math.hypot(bx - ax, bz - az) / 0.12);
    for (let k = 1; k <= n; k++) if (!navFree(g, ax + (bx - ax) * k / n, az + (bz - az) * k / n)) return false;
    return true;
}
function navNearestFree(g, x, z) {
    let best = null, bd = Infinity;
    for (let j = 0; j < NAV_N; j++) for (let i = 0; i < NAV_N; i++) {
        if (g[j * NAV_N + i]) continue;
        const d = (navCenter(i) - x) ** 2 + (navCenter(j) - z) ** 2;
        if (d < bd) { bd = d; best = { x: navCenter(i), z: navCenter(j) }; }
    }
    return best;
}
// A* で道を探し、まっすぐ歩ける所は間を省く。見つからなければ null
function findPath(g, sx, sz, tx, tz) {
    if (!navFree(g, tx, tz)) return null;
    const start = navIndex(sz) * NAV_N + navIndex(sx), goal = navIndex(tz) * NAV_N + navIndex(tx);
    const ti = goal % NAV_N, tj = Math.floor(goal / NAV_N);
    const cost = new Float32Array(NAV_N * NAV_N).fill(Infinity), from = new Int32Array(NAV_N * NAV_N).fill(-1);
    const open = [[0, start]];
    cost[start] = 0;
    while (open.length) {
        let bi = 0;
        for (let k = 1; k < open.length; k++) if (open[k][0] < open[bi][0]) bi = k;
        const [, cur] = open.splice(bi, 1)[0];
        if (cur === goal) break;
        const ci = cur % NAV_N, cj = Math.floor(cur / NAV_N);
        for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
            if (!di && !dj) continue;
            const ni = ci + di, nj = cj + dj;
            if (ni < 0 || nj < 0 || ni >= NAV_N || nj >= NAV_N) continue;
            const nk = nj * NAV_N + ni;
            if (g[nk]) continue;
            if (di && dj && (g[cj * NAV_N + ni] || g[nj * NAV_N + ci])) continue; // 角をすり抜けない
            const c = cost[cur] + (di && dj ? Math.SQRT2 : 1);
            if (c >= cost[nk]) continue;
            cost[nk] = c; from[nk] = cur;
            open.push([c + Math.hypot(ni - ti, nj - tj), nk]);
        }
    }
    if (goal !== start && from[goal] < 0) return null;
    const cells = [];
    for (let k = goal; k !== start && k >= 0; k = from[k]) cells.unshift(k);
    const pts = cells.map(k => ({ x: navCenter(k % NAV_N), z: navCenter(Math.floor(k / NAV_N)) }));
    if (pts.length) pts[pts.length - 1] = { x: tx, z: tz }; else pts.push({ x: tx, z: tz });
    // 見通せる点まで飛ばす
    const out = [];
    let ax = sx, az = sz, k = 0;
    while (k < pts.length) {
        let far = k;
        for (let m = pts.length - 1; m > k; m--) if (navLine(g, ax, az, pts[m].x, pts[m].z)) { far = m; break; }
        out.push(pts[far]);
        ax = pts[far].x; az = pts[far].z; k = far + 1;
    }
    return out;
}

// ---- これからすることを決める ----
function itemSig(item) { return item ? `${item.gx},${item.gz},${item.rot}` : ''; }
// 家具を使うときの「近づく位置（to）・向き（face）・絵を置く足元（anchor）」の候補。
// L(a, b): 家具の向きでの位置。a は横、b は奥行き（正面が大きい方）
function plansFor(item) {
    const def = FURNITURE[item.type];
    if (!def.use) return [];
    const [w, d] = footprint(item);
    const L = (a, b) => item.rot ? { x: item.gx + b, z: item.gz + a } : { x: item.gx + a, z: item.gz + b };
    const [len, dep] = item.rot ? [d, w] : [w, d];
    const front = item.rot ? { x: 1, z: 0 } : { x: 0, z: 1 };
    const base = { uid: item.uid, sig: itemSig(item), act: def.use, lines: def.lines || [], flip: !!item.rot };
    const G = 0.75; // 家具から離れて立つ距離（歩けるマス目の真ん中に来るように）
    if (def.use === 'look') {
        // 正面から眺める。ふさがっていれば横や後ろから（向きは家具の方へ）
        const sides = [[L(len / 2, dep + G), front], [L(-G, dep / 2), item.rot ? { x: 0, z: -1 } : { x: -1, z: 0 }],
            [L(len + G, dep / 2), item.rot ? { x: 0, z: 1 } : { x: 1, z: 0 }], [L(len / 2, -G), { x: -front.x, z: -front.z }]];
        return sides.map(([to, f], i) => ({ ...base, to, face: { x: -f.x, z: -f.z }, pref: i === 0 }));
    }
    if (def.use === 'sit') {
        // 横に並んだ席。絵の足元は座面の手前
        return def.seats.map(f => len * f).map(a => ({ ...base, to: L(a, dep + G), anchor: { ...L(a, dep - 0.55), lift: 0 }, face: front }));
    }
    // 寝る: ベッドの横から入る。寝た絵は頭が左上なので、rot 0（頭が右上）では反転する
    const anchor = { ...L(len / 2 - 0.05, 1.8), lift: 0.32 };
    return [-G, len + G].map(a => ({ ...base, flip: !item.rot, to: L(a, 2), anchor, face: front }));
}
function randIn(a, b) { return a + Math.random() * (b - a); }
function pickOne(list) { return list[Math.floor(Math.random() * list.length)]; }
// 次にすることを選ぶ。prefer を渡すと、その家具を先に使う（置いたばかりの家具を見に行く）
function chooseNext(prefer) {
    const r = resident, g = buildNavGrid();
    const tryPlans = (plans) => {
        for (const p of plans.sort((a, b) => (b.pref ? 1 : 0) - (a.pref ? 1 : 0) || Math.random() - 0.5)) {
            const path = findPath(g, r.x, r.z, p.to.x, p.to.z);
            if (path) return { plan: p, path };
        }
        return null;
    };
    let got = prefer ? tryPlans(plansFor(prefer)) : null;
    if (!got && Math.random() < 0.72) {
        const cands = game.items.filter(it => it.uid !== r.recentUid && plansFor(it).length);
        const weighted = cands.flatMap(it => (FURNITURE[it.type].use !== 'look' ? [it, it] : [it])); // 座る・寝る家具は選ばれやすく
        for (let n = 0; n < 4 && !got && weighted.length; n++) got = tryPlans(plansFor(pickOne(weighted)));
    }
    for (let n = 0; n < 20 && !got; n++) {
        // ぶらぶら歩く
        const x = randIn(0.8, N - 0.8), z = randIn(0.8, N - 0.8);
        if (Math.hypot(x - r.x, z - r.z) < 2) continue;
        const path = findPath(g, r.x, r.z, x, z);
        if (path) got = { plan: { act: 'wander', to: { x, z } }, path };
    }
    if (!got) { r.mode = 'idle'; r.timer = 2; return; }
    r.plan = got.plan; r.path = got.path; r.mode = 'walk';
    if (got.plan.uid) r.recentUid = got.plan.uid;
}
function planValid(plan) { return !plan || !plan.uid || itemSig(findItem(plan.uid)) === plan.sig; }
// 立っている所に家具が置かれたら、近くの空いている所へよける
function stepAside(say) {
    const r = resident, g = buildNavGrid();
    if (navFree(g, r.x, r.z)) return;
    const p = navNearestFree(g, r.x, r.z);
    if (p) { r.x = p.x; r.z = p.z; r.hop = 1; }
    if (say) residentSay(pickOne(['わっ', 'おっと', 'びっくりした']));
}
function stopUsing(say) {
    const r = resident;
    if (r.use) { r.x = r.use.plan.to.x; r.z = r.use.plan.to.z; }
    r.use = null; r.plan = null; r.path = []; r.mode = 'idle'; r.timer = 0.6;
    if (r.bubbleText === '💤') r.bubbleText = '';
    stepAside(say);
}
// 吹き出しの時間は住人の時間で数える（テストで時間を進めても合うように）
function residentSay(text, sec = 2.6) { resident.bubbleText = text; resident.bubbleUntil = resident.t + sec; }
function setPose(name, sec) { resident.pose = name; resident.poseUntil = resident.t + sec; }

let navCheck = 0;
function updateResident(dt) {
    const r = resident;
    r.t += dt;
    r.hop = Math.max(0, r.hop - dt * 2.5);
    // 家具が動かされたら、やめる・よける（0.25 秒ごと）
    navCheck -= dt;
    if (navCheck <= 0) {
        navCheck = 0.25;
        if (!planValid(r.plan)) stopUsing(r.mode === 'use');
        else if (r.mode !== 'use') {
            const g = buildNavGrid();
            if (!navFree(g, r.x, r.z)) stepAside(true);
            else if (r.mode === 'walk' && r.path.length && !navLine(g, r.x, r.z, r.path[0].x, r.path[0].z)) {
                const path = findPath(g, r.x, r.z, r.plan.to.x, r.plan.to.z);
                if (path) r.path = path; else { r.plan = null; r.mode = 'idle'; r.timer = 0.5; }
            }
        }
    }
    if (r.pose && r.t < r.poseUntil) return; // 笑う・手を振る間は止まる
    if (r.mode === 'idle') {
        r.timer -= dt;
        if (r.timer <= 0) { r.plan = null; chooseNext(); }
    } else if (r.mode === 'walk') {
        const wp = r.path[0];
        if (!wp) { arrive(); return; }
        const dx = wp.x - r.x, dz = wp.z - r.z, d = Math.hypot(dx, dz);
        if (d > 1e-3) { r.dirX = dx / d; r.dirZ = dz / d; }
        const step = RES.speed * dt;
        r.step += dt * 2.2;
        if (d <= step) { r.x = wp.x; r.z = wp.z; r.path.shift(); if (!r.path.length) arrive(); }
        else { r.x += dx / d * step; r.z += dz / d * step; }
    } else if (r.mode === 'use') {
        const u = r.use, p = u.plan;
        if (p.face) { r.dirX = p.face.x; r.dirZ = p.face.z; }
        if (p.act === 'look') {
            u.time -= dt;
            if (u.time <= 0) { r.mode = 'idle'; r.use = null; r.plan = null; r.timer = randIn(0.5, 1.5); }
            return;
        }
        // 座る・寝る: 少し間をおいて腰を下ろし、時間が来たら立つ
        u.k = u.leaving ? Math.max(0, u.k - dt / 0.4) : Math.min(1, u.k + dt / 0.4);
        if (u.k >= 1) u.time -= dt;
        if (u.time <= 0 && !u.leaving) u.leaving = true;
        if (u.k >= 1 && p.act === 'lie' && r.bubbleUntil < r.t) r.bubbleText = '💤';
        if (u.leaving && u.k <= 0) {
            r.mode = 'idle'; r.use = null; r.plan = null; r.timer = randIn(0.5, 1.2);
            if (r.bubbleText === '💤') r.bubbleText = '';
        }
    }
}
function arrive() {
    const r = resident, p = r.plan;
    r.path = [];
    if (!p || p.act === 'wander') {
        r.mode = 'idle'; r.timer = randIn(1.5, 4);
        if (Math.random() < 0.15) residentSay(pickOne(RES_IDLE_LINES), 1.8);
        return;
    }
    r.mode = 'use';
    const time = p.act === 'lie' ? randIn(14, 24) : p.act === 'sit' ? randIn(8, 15) : randIn(3, 6);
    r.use = { plan: p, k: 0, time, leaving: false };
    if (Math.random() < 0.6 && p.lines.length) residentSay(pickOne(p.lines));
}

// ---- 吹き出し ----
const bubble = document.getElementById('bubble');
function updateBubble() {
    const r = resident;
    const sleeping = r.bubbleText === '💤' && r.use?.plan.act === 'lie';
    const show = r.visible && r.bubbleText && (r.t < r.bubbleUntil || sleeping);
    if (!show) {
        if (!bubble.hidden) bubble.hidden = true;
        return;
    }
    const rr = residentRect();
    const [sx, sy] = toScreen(rr.x + rr.w / 2, rr.y + (seated() && r.use.plan.act === 'lie' ? rr.h * 0.4 : 4));
    bubble.style.left = `${sx}px`;
    bubble.style.top = `${sy}px`;
    if (bubble.textContent !== r.bubbleText) bubble.textContent = r.bubbleText;
    bubble.hidden = false;
}

// ---- 動かし続ける ----
let residentLoop = 0;
function residentTick(now) {
    residentLoop = 0;
    const r = resident;
    if (!r.visible) return;
    residentLoop = requestAnimationFrame(residentTick);
    if (now - r.lastDraw < 1000 / RES.fps - 2) return;
    const dt = Math.min(0.1, (now - (r.last || now)) / 1000);
    r.last = now; r.lastDraw = now;
    if (!r.frozen) updateResident(dt);
    render();
}
function setResidentShown(on) {
    const r = resident;
    r.visible = on;
    if (!on) { bubble.hidden = true; cancelAnimationFrame(residentLoop); residentLoop = 0; requestRender(); return; }
    if (!residentLoop) { r.last = 0; residentLoop = requestAnimationFrame(residentTick); }
}
function spawnResident() {
    const p = navNearestFree(buildNavGrid(), N / 2 + 1, N / 2 + 2) || { x: N / 2, z: N / 2 };
    Object.assign(resident, { x: p.x, z: p.z, dirX: 0, dirZ: 1, mode: 'idle', timer: 1.5, plan: null, use: null, path: [] });
}
function residentName() { return game.resident.name || '住人'; }
// 住人を押したら、話して笑う
function talkToResident() {
    const r = resident;
    r.hop = 1;
    const p = r.use?.plan;
    if (seated() && p.act === 'lie') { residentSay(pickOne(['むにゃ…', 'あと 5 分…', 'Zzz…'])); return; }
    residentSay(p && p.lines.length && Math.random() < 0.5 ? pickOne(p.lines) : pickOne([...RES_GREETINGS, `${residentName()}だよ`]));
    if (r.mode === 'walk' || r.mode === 'idle') {
        // 立ち止まって、こちら（手前）を向いて笑う
        r.dirX = 0.6; r.dirZ = 0.8;
        r.path = []; r.plan = null; r.mode = 'idle'; r.timer = 2.2;
        setPose('happy', 1.6);
    }
    requestRender();
}
// 新しく置いた家具に気づいて、手を振ってから見に行く
function residentNotice(item) {
    const r = resident;
    if (!r.visible || r.frozen || r.mode === 'use' || !plansFor(item).length) return;
    setTimeout(() => {
        if (r.mode === 'use' || !findItem(item.uid)) return;
        chooseNext(findItem(item.uid));
        if (r.plan?.uid === item.uid) {
            residentSay(`${FURNITURE[item.type].name}だ！`);
            setPose('wave', 0.9);
        }
    }, 600);
}

// ---------- 明るさ ----------
const darkQuery = matchMedia('(prefers-color-scheme: dark)');
function applyAppearance() {
    const a = game.appearance;
    if (a === 'light' || a === 'dark') document.documentElement.dataset.theme = a;
    else delete document.documentElement.dataset.theme;
    const isDark = a === 'dark' || (a === 'auto' && darkQuery.matches);
    document.querySelector('meta[name="theme-color"]').content = isDark ? '#1a1714' : '#f3efe8';
}
darkQuery.addEventListener('change', applyAppearance);

// ---------- 設定 ----------
const menu = document.getElementById('menu');
const nameInput = document.getElementById('resident-name');
document.getElementById('menu-btn').addEventListener('click', () => {
    menu.querySelectorAll('input[name="appearance"]').forEach(r => { r.checked = r.value === game.appearance; });
    document.getElementById('resident-toggle').checked = game.resident.show;
    nameInput.value = game.resident.name;
    menu.showModal();
});
document.getElementById('menu-close').addEventListener('click', () => menu.close());
menu.addEventListener('click', (e) => { if (e.target === menu) menu.close(); });
menu.querySelectorAll('input[name="appearance"]').forEach(r => r.addEventListener('change', () => {
    game.appearance = r.value;
    applyAppearance();
    saveGame();
}));
nameInput.addEventListener('change', () => {
    game.resident.name = nameInput.value.trim().slice(0, 12);
    nameInput.value = game.resident.name;
    saveGame();
});
document.getElementById('resident-toggle').addEventListener('change', (e) => {
    game.resident.show = e.target.checked;
    setResidentShown(game.resident.show);
    saveGame();
});
document.getElementById('clear-room-btn').addEventListener('click', () => {
    if (!confirm('部屋の家具を全部しまいますか？')) return;
    game.items = [];
    select(null);
    saveGame();
    menu.close();
});
document.getElementById('reset-btn').addEventListener('click', () => {
    if (!confirm('全てのデータを消しますか？（元に戻せません）')) return;
    resetting = true;
    [SAVE_KEY, SAVE_KEY + '_corrupted'].forEach(k => { try { localStorage.removeItem(k); } catch (e) { } });
    location.reload();
});

// ---------- 元に戻す・やり直す ----------
const MAX_HISTORY = 100;
const undoStack = [], redoStack = [];
let lastRoom = null; // 最後に記録した部屋の状態（JSON）
function roomSnapshot() { return JSON.stringify(game.items); }
// 部屋が前の記録から変わっていたら、前の状態を「元に戻す」に積む（saveGame から呼ぶ）
function recordHistory() {
    const now = roomSnapshot();
    if (lastRoom !== null && now !== lastRoom) {
        undoStack.push(lastRoom);
        if (undoStack.length > MAX_HISTORY) undoStack.shift();
        redoStack.length = 0;
    }
    lastRoom = now;
    updateHistoryButtons();
}
function restoreRoom(json) {
    game.items = sanitizeItems(JSON.parse(json));
    lastRoom = roomSnapshot();
    if (!findItem(selectedUid)) select(null);
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(game)); } catch (e) { }
    updateHistoryButtons();
    requestRender();
}
function undo() { if (!undoStack.length) return; redoStack.push(roomSnapshot()); restoreRoom(undoStack.pop()); }
function redo() { if (!redoStack.length) return; undoStack.push(roomSnapshot()); restoreRoom(redoStack.pop()); }
function updateHistoryButtons() {
    document.getElementById('undo-btn').disabled = !undoStack.length;
    document.getElementById('redo-btn').disabled = !redoStack.length;
}
document.getElementById('undo-btn').addEventListener('click', undo);
document.getElementById('redo-btn').addEventListener('click', redo);

// ---------- 部屋のプリセット ----------
const presetDialog = document.getElementById('preset-dialog');
const presetName = document.getElementById('preset-name');
function formatDate(t) {
    const d = new Date(t);
    return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}
function renderPresets() {
    const list = document.getElementById('preset-list');
    list.innerHTML = '';
    if (!game.presets.length) { list.innerHTML = '<div class="empty">まだありません</div>'; return; }
    for (const ps of [...game.presets].sort((a, b) => b.savedAt - a.savedAt)) {
        const row = document.createElement('div');
        row.className = 'preset';
        row.innerHTML = `<div class="preset-info"><b></b><small>${formatDate(ps.savedAt)}・家具 ${ps.items.length} 個</small></div><button class="preset-load primary">呼び出す</button><button class="preset-del" aria-label="消す">🗑</button>`;
        row.querySelector('b').textContent = ps.name;
        row.querySelector('.preset-load').addEventListener('click', () => loadPreset(ps.id));
        row.querySelector('.preset-del').addEventListener('click', () => {
            if (!confirm(`「${ps.name}」を消しますか？`)) return;
            game.presets = game.presets.filter(p => p.id !== ps.id);
            saveGame();
            renderPresets();
        });
        list.appendChild(row);
    }
}
function savePreset(name) {
    name = (name || '').trim().slice(0, 30) || `部屋 ${game.nextPresetId}`;
    const items = game.items.map(it => ({ ...it }));
    const same = game.presets.find(p => p.name === name);
    if (same) Object.assign(same, { items, savedAt: Date.now() });
    else {
        if (game.presets.length >= MAX_PRESETS) { toast(`プリセットは ${MAX_PRESETS} 個までです`); return false; }
        game.presets.push({ id: game.nextPresetId++, name, savedAt: Date.now(), items });
    }
    saveGame();
    toast(`「${name}」を保存しました`);
    return true;
}
function loadPreset(id) {
    const ps = game.presets.find(p => p.id === id);
    if (!ps) return;
    game.items = sanitizeItems(ps.items);
    game.nextUid = Math.max(game.nextUid, game.items.reduce((m, it) => Math.max(m, it.uid), 0) + 1);
    select(null);
    saveGame();
    if (presetDialog.open) presetDialog.close();
    toast(`「${ps.name}」を呼び出しました`);
}
document.getElementById('preset-btn').addEventListener('click', () => { presetName.value = ''; renderPresets(); presetDialog.showModal(); });
document.getElementById('preset-save').addEventListener('click', () => { if (savePreset(presetName.value)) { presetName.value = ''; renderPresets(); } });
document.getElementById('preset-close').addEventListener('click', () => presetDialog.close());
presetDialog.addEventListener('click', (e) => { if (e.target === presetDialog) presetDialog.close(); });

// ---------- 通知 ----------
let toastTimer = 0;
function toast(msg) {
    const el = document.getElementById('toast');
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), 2200);
}

// ---------- 起動 ----------
loadGame();
applyAppearance();
renderCatalog();
recordHistory(); // 起動したときの部屋を「元に戻す」の起点にする
document.getElementById('version').textContent = `v${APP_VERSION}`;
resize();
const ready = loadAll().then(() => {
    spawnResident();
    setResidentShown(game.resident.show);
    render();
});
setInterval(saveGame, 10000);
window.addEventListener('beforeunload', saveGame);
document.addEventListener('visibilitychange', () => { if (document.hidden) saveGame(); });
if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
    navigator.serviceWorker.register('sw.js').catch(err => console.error(err));
}

// テストから使う
window.__lifemaker = {
    APP_VERSION, FURNITURE, ready, game: () => game, selected: () => selectedUid, view,
    addItem, select, rotateSelected, removeSelected, isBlocked, footprint, undo, redo, savePreset, loadPreset, zoomAt,
    history: () => ({ undo: undoStack.length, redo: redoStack.length }), save: saveGame, render,
    drawOrder: () => drawList.map(o => o.resident ? 'resident' : o.item.uid),
    // 家具の真ん中が画面のどこに映るか（クライアント座標）。height は床からの高さ（m）
    screenOf(uid, height = 0.3) {
        const it = findItem(uid), [w, d] = footprint(it);
        const [x, y] = toScreen(...P(it.gx + w / 2, it.gz + d / 2, height));
        const r = canvas.getBoundingClientRect();
        return { x: r.left + x, y: r.top + y };
    },
    pickAt: (x, y) => pickItem(x, y)?.uid ?? null,
    resident: {
        state: () => { const r = resident; return { x: r.x, z: r.z, mode: r.mode, act: r.plan?.act ?? null, uid: r.plan?.uid ?? null, k: r.use?.k ?? 0, visible: r.visible, frame: residentFrame(), bubble: bubble.hidden ? null : bubble.textContent, path: r.path.map(p => ({ ...p })) }; },
        // テストで住人を止める（hide: ほかのテストの指の操作に当たらないよう隠す）
        freeze(on = true, hide = on) { resident.frozen = on; setResidentShown(game.resident.show && !hide); render(); },
        place(x, z) { Object.assign(resident, { x, z, mode: 'idle', timer: 99, plan: null, use: null, path: [], pose: null }); render(); },
        go(uid) { chooseNext(uid ? findItem(uid) : null); return resident.plan?.uid === uid; },
        walkTo(x, z) { const p = findPath(buildNavGrid(), resident.x, resident.z, x, z); if (p) Object.assign(resident, { plan: { act: 'wander', to: { x, z } }, path: p, mode: 'walk' }); return !!p; },
        step(sec) { for (let t = 0; t < sec; t += 0.05) updateResident(0.05); render(); },
        free: (x, z) => navFree(buildNavGrid(), x, z),
        line: (ax, az, bx, bz) => navLine(buildNavGrid(), ax, az, bx, bz),
        // 住人の胸のあたりが画面のどこに映るか（クライアント座標）
        screen() { const rr = residentRect(); const [x, y] = toScreen(rr.x + rr.w / 2, rr.y + rr.h * 0.55); const c = canvas.getBoundingClientRect(); return { x: c.left + x, y: c.top + y }; },
    },
};
