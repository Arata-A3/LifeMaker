// LifeMaker（2D 版）: 斜め上から見た部屋に家具を置き、住人が暮らす。
// 絵は画像生成AIで作り、tools/cut_sprites.py で img/ に書き出したものを使う（作り方は art/README.md）。

const APP_VERSION = '0.12.0';
const SAVE_KEY = 'lifemaker2d_save';
const SAVE_VERSION = 4; // 2: 小物・壁掛け・色合いを追加 / 3: 色合いを部分ごとに / 4: お金・持ち物・ゲームの中の日・お店

// ---------- 部屋の大きさと見え方 ----------
// 1 マス 0.5m、N×N マス。gx は右下へ、gz は左下へ伸びる（奥の角が原点）。y は高さ（m）
const N = 10;
// 床の傾きは 30 度（AIの絵がこの角度で描かれているため。横 2 に対して縦 1.15）
const CELL_W = 64, CELL_H = 37; // 1 マスの、画面での横幅・高さ（px、拡大 1 のとき）
const PX_PER_M = 80;            // 高さ 1m の画面での長さ
const WALL_H = 2.5;
function P(gx, gz, y = 0) { return [(gx - gz) * CELL_W / 2, (gx + gz) * CELL_H / 2 - y * PX_PER_M]; }
// 画面の点 → 床（高さ y）の上のマス目の位置
function unP(x, yy, y = 0) {
    const a = x / (CELL_W / 2), b = (yy + y * PX_PER_M) / (CELL_H / 2);
    return [(a + b) / 2, (b - a) / 2];
}

// ---------- 家具の定義 ----------
// 絵は「正面が左下（+gz）」で描く。rot 1 は左右反転（正面が右下）。斜め上からの見た目では、左右反転は gx と gz の入れ替えになる
// size: [gx 方向, gz 方向]（マス）。壁掛けは [壁に沿った幅, 0]
// art: img/ の絵（置き方は artMatrix）。fitHeight（m）: 丸い物・細い物の高さ（底の真ん中を足元の四角の真ん中に置く）。
// legInset: 脚が天板より内側にある家具（丸いテーブル）で、脚の広がりを足元の四角の幅の何割にするか
// small: 小物（上に物を置ける家具 = top のある家具の上に載る。prefer の家具の上を先に探す）
// wall: 壁掛け（rot 0 は右奥の壁、rot 1 は左奥の壁。y は下端の高さ m）
// flat: 敷物（上に家具を重ねて置ける）。top: 天面の高さ（m）
// use: 住人の使い方（sit 座る / lie 寝る / look 眺める）。seats: 座る席の位置（横幅の割合）
const FURNITURE = {
    bed: { name: 'ベッド', size: [2, 4], art: 'bed', use: 'lie', lines: ['おやすみ…', 'すやすや'] },
    sofa: { name: 'ソファ', size: [4, 2], art: 'sofa', use: 'sit', seats: [0.3, 0.7], lines: ['ふう、ひと休み', 'このソファ、ふかふか', 'のんびりしよう'] },
    chair: { name: 'いす', size: [1, 1], art: 'chair', use: 'sit', seats: [0.5], lines: ['ちょっと座ろう', 'いすがちょうどいい'] },
    table: { name: 'テーブル', size: [2, 3], art: 'table', top: 0.78, use: 'look', lines: ['ごはん、何にしよう', 'お茶にしよう'] },
    lowtable: { name: 'ローテーブル', size: [2, 2], art: 'lowtable', legInset: 0.75, top: 0.42, use: 'look', lines: ['いい香り', 'ひと息つこう'] },
    desk: { name: '机', size: [2, 1], art: 'desk', top: 0.72, use: 'look', lines: ['ちょっと調べもの', 'がんばるぞ'] },
    bookshelf: { name: '本棚', size: [2, 1], art: 'bookshelf', use: 'look', lines: ['何を読もうかな', 'この本、おもしろそう'] },
    wardrobe: { name: 'クローゼット', size: [2, 1], art: 'wardrobe', use: 'look', lines: ['今日は何を着よう', 'おしゃれしたいな'] },
    chest: { name: 'チェスト', size: [2, 1], art: 'chest', top: 0.88, use: 'look', lines: ['何をしまったっけ'] },
    nightstand: { name: 'サイドテーブル', size: [1, 1], art: 'nightstand', top: 0.6 },
    tvstand: { name: 'テレビ台', size: [3, 1], art: 'tvstand', top: 0.5, use: 'look', lines: ['なに見ようかな'] },
    lamp: { name: 'スタンドライト', size: [1, 1], art: 'lamp', fitHeight: 1.65 },
    lamp2: { name: 'スタンドライト（フリンジ）', size: [1, 1], art: 'lamp2', fitHeight: 1.65 },
    plant: { name: '観葉植物', size: [1, 1], art: 'plant', fitHeight: 1.1, use: 'look', lines: ['水やりしなきゃ', '葉っぱがきれい'] },
    plant2: { name: '観葉植物（小）', size: [1, 1], art: 'plant2', fitHeight: 0.75, use: 'look', lines: ['すくすく育ってる', '葉っぱがきれい'] },
    vase2: { name: '花びん（大）', size: [1, 1], art: 'vase2', fitHeight: 0.75, use: 'look', lines: ['いい香り', 'きれいに咲いてる'] },
    rug: { name: 'ラグ', size: [3, 4], art: 'rug', flat: true },
    tv: { name: 'テレビ', size: [2, 1], art: 'tv', small: true, fitHeight: 0.5, prefer: 'tvstand', use: 'look', lines: ['テレビ見よう', 'この番組すき'] },
    vase: { name: '花びん', size: [1, 1], art: 'vase', small: true, fitHeight: 0.5, use: 'look', lines: ['お花、かわいい'] },
    window: { name: '窓', size: [3, 0], art: 'window', wall: true, y: 0.85, use: 'look', lines: ['いい天気', '外はどうかな'] },
    window2: { name: '窓（アーチ）', size: [2, 0], art: 'window2', wall: true, y: 0.8, use: 'look', lines: ['月がきれい', '外はどうかな'] },
    picture: { name: '絵', size: [2, 0], art: 'picture', wall: true, y: 1.25, use: 'look', lines: ['すてきな絵', 'この絵、すき'] },
};
// お店の値段（コイン）
const PRICES = {
    bed: 1200, sofa: 1500, chair: 300, table: 900, lowtable: 600, desk: 800, bookshelf: 1000, wardrobe: 1100, chest: 800,
    nightstand: 400, tvstand: 700, lamp: 500, lamp2: 550, plant: 400, plant2: 250, vase2: 350, rug: 700, tv: 1200, vase: 200,
    window: 900, window2: 1000, picture: 600,
};
for (const [type, def] of Object.entries(FURNITURE)) def.price = PRICES[type] || 500;
function kindOf(item) {
    const d = FURNITURE[item.type];
    return d.wall ? 'wall' : d.small ? 'small' : d.flat ? 'flat' : 'floor';
}

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
        nextUid: 8,
        items: [
            { uid: 1, type: 'rug', gx: 3, gz: 4, rot: 0 },
            { uid: 2, type: 'bed', gx: 6, gz: 0, rot: 0 },
            { uid: 3, type: 'plant', gx: 9, gz: 0, rot: 0 },
            { uid: 4, type: 'sofa', gx: 0, gz: 5, rot: 1 },
            { uid: 5, type: 'lowtable', gx: 4, gz: 5, rot: 0 },
            { uid: 6, type: 'window', gx: 2, gz: 0, rot: 0, y: 0.85 },
            { uid: 7, type: 'picture', gx: 2.5, gz: 0, rot: 1, y: 1.25 },
        ],
        resident: { show: true, name: 'ヴァンプ子' },
        presets: [], // { id, name, savedAt, items }
        nextPresetId: 1,
        coins: START_COINS,
        owned: { rug: 1, bed: 1, plant: 1, sofa: 1, lowtable: 1, window: 1, picture: 1 }, // 持っている家具の数（置いた分も含む）
        day: 1, clock: 0, // ゲームの中の日と、その日の経った秒数
        shop: { day: 0, items: [], sold: [] }, // その日の品ぞろえ（sold: 売れた品物の番号）
    };
}
const START_COINS = 600;
const MAX_PRESETS = 30;
let game = makeDefaultGame();
let resetting = false;

function num(v) { const n = Number(v); return Number.isFinite(n) ? n : 0; }
function footprint(item) {
    const [w, d] = FURNITURE[item.type].size;
    return item.rot ? [d, w] : [w, d];
}
// 壁掛けの本体の高さ（m）。本体の四角（img/sprites.json の wall.face）、なければ絵を囲む平行四辺形の高さを、壁に沿った幅に合わせて縮めた長さ
function wallHeight(def) {
    const im = images.get(def.art), wb = metaOf(def.art).wall;
    if (!im || !wb) return 1;
    if (wb.face) {
        const [tl, tr, bl, br] = wb.face;
        const k = def.size[0] * CELL_W / 2 / ((tr[0] - tl[0] + br[0] - bl[0]) / 2);
        return ((bl[1] - tl[1]) + (br[1] - tr[1])) / 2 * k / PX_PER_M;
    }
    return (wb.b - wb.a) * (def.size[0] * CELL_W / 2 / im.w) / PX_PER_M;
}
function clampItem(item) {
    const def = FURNITURE[item.type];
    if (def.wall) {
        // gx: 壁に沿った位置（マス、0.5 刻み）、y: 下端の高さ（m、0.05 刻み）
        item.gx = Math.min(Math.max(Math.round(item.gx * 2) / 2, 0), N - def.size[0]);
        item.gz = 0;
        item.y = Math.min(Math.max(Math.round(num(item.y) * 20) / 20, 0.15), Math.max(0.15, WALL_H - wallHeight(def) - 0.05));
        return;
    }
    const [w, d] = footprint(item);
    item.gx = Math.min(Math.max(item.gx, 0), N - w);
    item.gz = Math.min(Math.max(item.gz, 0), N - d);
}
// 色合い: h 色合い（-180〜180）、s 鮮やかさ（0〜200%）、l 明るさ（50〜150%）。元の色なら持たない
const TINT_DEFAULT = { h: 0, s: 100, l: 100 };
// 色合い: 部分の番号（1, 2, …）または all（全部）ごとに { h 色合い -180〜180, s 鮮やかさ 0〜200%, l 明るさ 50〜150% }。
// 部分の色合いがなければ all を使う。元の色なら持たない。v0.9 の { h, s, l } は all として読む
function sanitizeOne(t) {
    if (!t || typeof t !== 'object') return null;
    const out = { h: Math.round(Math.min(180, Math.max(-180, num(t.h)))), s: Math.round(Math.min(200, Math.max(0, num(t.s ?? 100)))), l: Math.round(Math.min(150, Math.max(50, num(t.l ?? 100)))) };
    return out.h === 0 && out.s === 100 && out.l === 100 ? null : out;
}
function sanitizeTint(t) {
    if (!t || typeof t !== 'object') return null;
    if ('h' in t || 's' in t || 'l' in t) { const one = sanitizeOne(t); return one ? { all: one } : null; }
    const out = {};
    for (const k of Object.keys(t)) {
        if (k !== 'all' && !/^[1-9]$/.test(k)) continue;
        const one = sanitizeOne(t[k]);
        if (one) out[k] = one;
    }
    return Object.keys(out).length ? out : null;
}
// 家具の一覧の形をそろえる。重複・知らない家具を除き、部屋からはみ出すものは中に入れる
function sanitizeItems(list) {
    if (!Array.isArray(list)) return [];
    const seen = new Set();
    return list
        .filter(it => it && FURNITURE[it.type] && Number.isInteger(it.uid) && !seen.has(it.uid) && seen.add(it.uid))
        .map(it => {
            const def = FURNITURE[it.type];
            const item = { uid: it.uid, type: it.type, gx: def.wall ? num(it.gx) : Math.round(num(it.gx)), gz: Math.round(num(it.gz)), rot: it.rot ? 1 : 0 };
            if (def.wall) item.y = it.y === undefined ? def.y : num(it.y);
            const tint = sanitizeTint(it.tint);
            if (tint) item.tint = tint;
            clampItem(item);
            return item;
        });
}
function saveGame() {
    if (resetting) return;
    if (typeof updateCatalogCounts === 'function') updateCatalogCounts();
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
    if (Array.isArray(p.items)) {
        game.items = sanitizeItems(p.items);
        // v0.8 までは窓と額が部屋に描き込まれていた。壁掛けがなければ、元の場所に掛けておく
        if (!(Number(p.saveVersion) >= 2) && !game.items.some(it => kindOf(it) === 'wall')) {
            let uid = game.items.reduce((m, it) => Math.max(m, it.uid), 0);
            game.items.push({ uid: ++uid, type: 'window', gx: 2, gz: 0, rot: 0, y: 0.85 }, { uid: ++uid, type: 'picture', gx: 2.5, gz: 0, rot: 1, y: 1.25 });
        }
    }
    game.nextUid = Math.max(Math.round(num(p.nextUid)), game.items.reduce((m, it) => Math.max(m, it.uid), 0) + 1);
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
    game.nextPresetId = Math.max(Math.round(num(p.nextPresetId)), game.presets.reduce((m, ps) => Math.max(m, ps.id), 0) + 1);
    // お金・持ち物・日
    if (Number(p.saveVersion) >= 4 && p.owned && typeof p.owned === 'object') {
        game.owned = {};
        for (const [t, n] of Object.entries(p.owned)) if (FURNITURE[t] && Math.round(num(n)) > 0) game.owned[t] = Math.min(99, Math.round(num(n)));
        game.coins = Math.max(0, Math.round(num(p.coins)));
    } else {
        // v0.11 までは家具が使い放題だった。部屋とプリセットに置いていた家具は、持っていることにする
        game.owned = {};
        for (const list of [game.items, ...game.presets.map(ps => ps.items)]) {
            const n = {};
            for (const it of list) n[it.type] = (n[it.type] || 0) + 1;
            for (const [t, c] of Object.entries(n)) game.owned[t] = Math.max(game.owned[t] || 0, c);
        }
    }
    // 部屋に置いてある数は、必ず持っていることにする（壊れたセーブでも家具が消えないように）
    for (const it of game.items) game.owned[it.type] = Math.max(game.owned[it.type] || 0, placedCount(it.type));
    game.day = Math.max(1, Math.round(num(p.day)) || 1);
    game.clock = Math.min(DAY_SEC - 1, Math.max(0, num(p.clock)));
    const sh = p.shop;
    if (sh && Number(sh.day) === game.day && Array.isArray(sh.items) && sh.items.every(t => FURNITURE[t])) {
        game.shop = { day: game.day, items: sh.items.slice(0, SHOP_SIZE), sold: Array.isArray(sh.sold) ? sh.sold.filter(i => Number.isInteger(i)) : [] };
    }
}

// ---------- 配置の計算 ----------
function findItem(uid) { return game.items.find(it => it.uid === uid); }
function overlaps(a, b, shrink = 0) {
    const [aw, ad] = footprint(a), [bw, bd] = footprint(b);
    const E = 1e-6 + shrink * 2;
    return a.gx + E < b.gx + bw && b.gx + E < a.gx + aw && a.gz + E < b.gz + bd && b.gz + E < a.gz + ad;
}
function centerOf(item) { const [w, d] = footprint(item); return [item.gx + w / 2, item.gz + d / 2]; }
// 小物の下にある、上に物を置ける家具（いちばん高いもの）
function supportOf(item) {
    let best = null;
    const [cx, cz] = centerOf(item);
    for (const o of game.items) {
        const d = FURNITURE[o.type];
        if (o.uid === item.uid || !d.top || kindOf(o) !== 'floor') continue;
        const [w, dd] = footprint(o);
        if (!(cx > o.gx && cx < o.gx + w && cz > o.gz && cz < o.gz + dd)) continue;
        if (!best || d.top > FURNITURE[best.type].top) best = o;
    }
    return best;
}
function ridersOf(item) {
    if (!FURNITURE[item.type].top) return [];
    return game.items.filter(o => kindOf(o) === 'small' && supportOf(o) === item);
}
// 絵を置く場所: 足元の四角（gx, gz, w, d）と、床からの高さ（lift）
function placeOf(item) {
    const kind = kindOf(item);
    if (kind === 'wall') {
        const w = FURNITURE[item.type].size[0];
        return item.rot ? { gx: 0, gz: item.gx, w: 0, d: w, lift: item.y } : { gx: item.gx, gz: 0, w, d: 0, lift: item.y };
    }
    const [w, d] = footprint(item);
    const s = kind === 'small' ? supportOf(item) : null;
    return { gx: item.gx, gz: item.gz, w, d, lift: s ? FURNITURE[s.type].top : 0 };
}
function wallOverlaps(a, b) {
    const da = FURNITURE[a.type], db = FURNITURE[b.type];
    return a.rot === b.rot && a.gx < b.gx + db.size[0] - 1e-6 && b.gx < a.gx + da.size[0] - 1e-6
        && a.y < b.y + wallHeight(db) && b.y < a.y + wallHeight(da);
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
        // 小物: 同じ所（同じ台の上、または床）の小物と大きく重なる、または載っていない家具にめり込む
        if (k === 'small') return supportOf(o) === support && overlaps(item, o, 0.2);
        return o !== support && overlaps(item, o);
    });
}
// 空いている場所を探す。床の物は部屋の中心に近い所、小物は家具の上を先に、壁掛けは壁の真ん中に近い所
function findFreeSpot(item) {
    const def = FURNITURE[item.type];
    if (def.wall) {
        for (const rot of [0, 1]) {
            let best = null, bestDist = Infinity;
            for (let gx = 0; gx <= N - def.size[0]; gx += 0.5) {
                const cand = { ...item, rot, gx, y: def.y };
                clampItem(cand);
                if (isBlocked(cand)) continue;
                const dist = Math.abs(gx + def.size[0] / 2 - N / 2);
                if (dist < bestDist) { bestDist = dist; best = { rot, gx: cand.gx, y: cand.y }; }
            }
            if (best) return best;
        }
        return { rot: 0, gx: (N - def.size[0]) / 2, y: def.y };
    }
    const [w, d] = footprint(item);
    let best = null, bestDist = Infinity;
    for (let gz = 0; gz <= N - d; gz++) for (let gx = 0; gx <= N - w; gx++) {
        const cand = { ...item, gx, gz };
        if (isBlocked(cand)) continue;
        let dist = (gx + w / 2 - N / 2) ** 2 + (gz + d / 2 - N / 2) ** 2;
        if (def.small) {
            const s = supportOf(cand);
            if (!s) dist += 500;
            else if (def.prefer === s.type) dist -= 2000; // テレビはテレビ台の上を先に
        }
        if (dist < bestDist) { bestDist = dist; best = { gx, gz }; }
    }
    return best || { gx: Math.floor((N - w) / 2), gz: Math.floor((N - d) / 2) };
}

// ---------- 絵 ----------
// 絵ごとに、当たり判定用の不透明の地図と、色の部分の地図（img/<名前>_parts.png）も作る
const images = new Map(); // name → { img, w, h, alpha, data, parts }
let spriteMeta = {};      // img/sprites.json: 床の角（corners）と色の部分（parts: [{ name, color }]）
// 手で直した合わせ方（「📐 合わせる」）。img/fit.json（みんなの画面に出る）に、この端末で直した分（localStorage）を重ねる
// { corners: [左, 手前, 右], face: [左上, 右上, 左下, 右下], base: [x, y, 幅], legInset, fitHeight }（点は絵の上の位置）
const FIT_KEY = 'lifemaker2d_fit';
let fitBase = {}, fitLocal = {}, fitVersion = 0;
function cleanFit(v) {
    const out = {};
    if (!v || typeof v !== 'object') return out;
    const pts = (a, n) => Array.isArray(a) && a.length === n && a.every(p => Array.isArray(p) && p.length === 2 && p.every(Number.isFinite));
    for (const [art, e] of Object.entries(v)) {
        if (!e || typeof e !== 'object') continue;
        const o = {};
        if (pts(e.corners, 3)) o.corners = e.corners;
        if (pts(e.face, 4)) o.face = e.face;
        if (Array.isArray(e.base) && e.base.length === 3 && e.base.every(Number.isFinite)) o.base = e.base;
        for (const k of ['legInset', 'fitHeight']) if (Number.isFinite(e[k]) && e[k] > 0) o[k] = e[k];
        if (Object.keys(o).length) out[art] = o;
    }
    return out;
}
function loadFitLocal() { try { fitLocal = cleanFit(JSON.parse(localStorage.getItem(FIT_KEY) || '{}')); } catch (e) { fitLocal = {}; } }
function saveFitLocal() {
    try { if (Object.keys(fitLocal).length) localStorage.setItem(FIT_KEY, JSON.stringify(fitLocal)); else localStorage.removeItem(FIT_KEY); } catch (e) { }
}
// この端末で直した値のうち、img/fit.json と同じになったもの（書き出して取り込んだもの）は消す
function pruneFitLocal() {
    for (const [art, e] of Object.entries(fitLocal)) {
        for (const k of Object.keys(e)) if (JSON.stringify(e[k]) === JSON.stringify(fitBase[art]?.[k])) delete e[k];
        if (!Object.keys(e).length) delete fitLocal[art];
    }
    saveFitLocal();
}
function fitOf(art) { return { ...fitBase[art], ...fitLocal[art] }; }
// 置き方に使う値（自動で求めた img/sprites.json に、手で直した値を重ねる）
function metaOf(art) {
    const m = { ...spriteMeta[art] }, f = fitOf(art);
    if (f.corners) m.corners = f.corners;
    if (f.base) m.base = f.base;
    if (f.face) m.wall = { ...m.wall, face: f.face };
    return m;
}
function readPixels(img) {
    const c = document.createElement('canvas');
    c.width = img.naturalWidth; c.height = img.naturalHeight;
    const g = c.getContext('2d', { willReadFrequently: true });
    g.drawImage(img, 0, 0);
    try { return g.getImageData(0, 0, c.width, c.height); } catch (e) { return null; } // file:// などで読めないとき
}
function loadPicture(src) {
    return new Promise((resolve) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => { console.error('絵を読めません: ' + src); resolve(null); };
        img.src = `${src}?v=${APP_VERSION}`;
    });
}
async function loadImage(name, withParts) {
    const [img, partsImg] = await Promise.all([loadPicture(`img/${name}.webp`), withParts ? loadPicture(`img/${name}_parts.png`) : null]);
    if (!img) return;
    const data = readPixels(img);
    let alpha = null, parts = null;
    if (data) {
        alpha = new Uint8Array(img.naturalWidth * img.naturalHeight);
        for (let i = 0; i < alpha.length; i++) alpha[i] = data.data[i * 4 + 3];
    }
    const pd = partsImg && readPixels(partsImg);
    if (pd && pd.width === img.naturalWidth && pd.height === img.naturalHeight) {
        parts = new Uint8Array(pd.width * pd.height);
        for (let i = 0; i < parts.length; i++) parts[i] = pd.data[i * 4];
    }
    images.set(name, { img, w: img.naturalWidth, h: img.naturalHeight, alpha, data, parts });
}
const RESIDENT_FRAMES = { stand: 1, walkA: 2, walkB: 3, back: 4, sit: 5, lie: 6, happy: 7, wave: 8 };
async function loadAll() {
    try { spriteMeta = await (await fetch(`img/sprites.json?v=${APP_VERSION}`)).json(); } catch (e) { console.error(e); spriteMeta = {}; }
    try { fitBase = cleanFit(await (await fetch(`img/fit.json?v=${APP_VERSION}`)).json()); } catch (e) { console.error(e); fitBase = {}; }
    loadFitLocal();
    pruneFitLocal();
    const jobs = Object.values(FURNITURE).map(d => loadImage(d.art, !!spriteMeta[d.art]?.parts));
    for (const n of Object.values(RESIDENT_FRAMES)) jobs.push(loadImage(`resident_${n}`, false));
    await Promise.all(jobs);
}
function partsOf(art) { return spriteMeta[art]?.parts || []; }

// ---- 色合いを変えた絵（作ったものは覚えておく） ----
const tintCache = new Map();
const TINT_CACHE_MAX = 60;
function rgbToHsl(r, g, b) {
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2;
    if (mx === mn) return [0, 0, l];
    const d = mx - mn, s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
    const h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
    return [h / 6, s, l];
}
function hue2rgb(p, q, t) {
    if (t < 0) t += 1; if (t > 1) t -= 1;
    return t < 1 / 6 ? p + (q - p) * 6 * t : t < 1 / 2 ? q : t < 2 / 3 ? p + (q - p) * (2 / 3 - t) * 6 : p;
}
// 部分 n に当てる色合い（なければ all、それもなければ null）
function tintFor(tint, n) { return tint ? (tint[n] || tint.all || null) : null; }
function tintedSource(name, tint) {
    const im = images.get(name);
    if (!im) return null;
    if (!tint || !im.data) return im.img;
    const key = `${name}|${JSON.stringify(tint)}`;
    if (tintCache.has(key)) { const c = tintCache.get(key); tintCache.delete(key); tintCache.set(key, c); return c; }
    // 部分ごとの変え方を先に用意する（0 は線。線は all のときだけ明るさを合わせる）
    const ways = [];
    for (let n = 0; n < 10; n++) {
        const t = n === 0 ? (tint.all ? { h: 0, s: 100, l: tint.all.l } : null) : tintFor(tint, n);
        ways.push(t ? { dh: t.h / 360, ks: t.s / 100, kl: t.l / 100 } : null);
    }
    const c = document.createElement('canvas');
    c.width = im.w; c.height = im.h;
    const out = new ImageData(new Uint8ClampedArray(im.data.data), im.w, im.h), dst = out.data;
    for (let i = 0, p = 0; i < dst.length; i += 4, p++) {
        if (!dst[i + 3]) continue;
        const w = ways[im.parts ? im.parts[p] : 1];
        if (!w) continue;
        let [h, s, l] = rgbToHsl(dst[i] / 255, dst[i + 1] / 255, dst[i + 2] / 255);
        h = (h + w.dh + 1) % 1;
        s = Math.min(1, s * w.ks);
        l = w.kl <= 1 ? l * w.kl : l + (1 - l) * (w.kl - 1) * 0.8;
        let r, g, b;
        if (s === 0) r = g = b = l;
        else {
            const q = l < 0.5 ? l * (1 + s) : l + s - l * s, pp = 2 * l - q;
            r = hue2rgb(pp, q, h + 1 / 3); g = hue2rgb(pp, q, h); b = hue2rgb(pp, q, h - 1 / 3);
        }
        dst[i] = r * 255; dst[i + 1] = g * 255; dst[i + 2] = b * 255;
    }
    c.getContext('2d').putImageData(out, 0, 0);
    tintCache.set(key, c);
    if (tintCache.size > TINT_CACHE_MAX) tintCache.delete(tintCache.keys().next().value);
    return c;
}

// ---- 絵の置き方（行列） ----
// 行列 [a, b, c, d, e, f]: 絵の点 (u, v) → 部屋の点 (a u + c v + e, b u + d v + f)
function mul(m, n) { // m のあとに n ではなく、m・n（n を先に当てる）
    return [m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1], m[0] * n[2] + m[2] * n[3], m[1] * n[2] + m[3] * n[3], m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5]];
}
function invert(m) {
    const det = m[0] * m[3] - m[1] * m[2];
    return [m[3] / det, -m[1] / det, -m[2] / det, m[0] / det, (m[2] * m[5] - m[3] * m[4]) / det, (m[1] * m[4] - m[0] * m[5]) / det];
}
function apply(m, x, y) { return [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]]; }
// 3 点の対応から行列を求める（ラグ・壁掛けのような平らな物だけ。立体の家具を変形すると、引き伸ばされて見える）
function solveAffine(src, dst) {
    const [[x0, y0], [x1, y1], [x2, y2]] = src, [[X0, Y0], [X1, Y1], [X2, Y2]] = dst;
    const det = (x1 - x0) * (y2 - y0) - (x2 - x0) * (y1 - y0);
    const a = ((X1 - X0) * (y2 - y0) - (X2 - X0) * (y1 - y0)) / det;
    const c = ((X2 - X0) * (x1 - x0) - (X1 - X0) * (x2 - x0)) / det;
    const b = ((Y1 - Y0) * (y2 - y0) - (Y2 - Y0) * (y1 - y0)) / det;
    const d = ((Y2 - Y0) * (x1 - x0) - (Y1 - Y0) * (x2 - x0)) / det;
    return [a, b, c, d, X0 - a * x0 - c * y0, Y0 - b * x0 - d * y0];
}
// 4 点以上の対応から、いちばん近い行列を求める（最小二乗）。AIの絵は完全な平行四辺形ではないので、4 つの角の合い方を平均する
function fitAffine(src, dst) {
    const A = [[0, 0, 0], [0, 0, 0], [0, 0, 0]], bx = [0, 0, 0], by = [0, 0, 0];
    src.forEach(([x, y], i) => {
        const v = [x, y, 1];
        for (let r = 0; r < 3; r++) { for (let c = 0; c < 3; c++) A[r][c] += v[r] * v[c]; bx[r] += v[r] * dst[i][0]; by[r] += v[r] * dst[i][1]; }
    });
    const solve = (b) => { // 3×3 をクラメルの公式で解く
        const det = (m) => m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1]) - m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0]) + m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0]);
        const D = det(A);
        return [0, 1, 2].map(k => det(A.map((row, r) => row.map((v, c) => (c === k ? b[r] : v)))) / D);
    };
    const [a, c, e] = solve(bx), [b, d, f] = solve(by);
    return [a, b, c, d, e, f];
}
// ---- 壁掛けの遠近の変形 ----
// AIの窓の絵は、上の辺と下の辺の傾きが違う台形のことがある。平行四辺形の変形では 4 つの角がそろわないので、
// 射影変換で 4 つの角を壁の上の四角にぴったり合わせた絵を作って取っておく（絵・色合い・掛ける壁ごと。掛ける位置は平行移動だけ）
function solveHomography(src, dst) {
    const A = [], b = [];
    for (let i = 0; i < 4; i++) {
        const [x, y] = src[i], [X, Y] = dst[i];
        A.push([x, y, 1, 0, 0, 0, -X * x, -X * y]); b.push(X);
        A.push([0, 0, 0, x, y, 1, -Y * x, -Y * y]); b.push(Y);
    }
    for (let c = 0; c < 8; c++) { // ガウス・ジョルダンの消去法
        let piv = c;
        for (let r = c + 1; r < 8; r++) if (Math.abs(A[r][c]) > Math.abs(A[piv][c])) piv = r;
        if (Math.abs(A[piv][c]) < 1e-12) return null;
        [A[c], A[piv]] = [A[piv], A[c]]; [b[c], b[piv]] = [b[piv], b[c]];
        for (let r = 0; r < 8; r++) {
            if (r === c || !A[r][c]) continue;
            const f = A[r][c] / A[c][c];
            for (let k = c; k < 8; k++) A[r][k] -= f * A[c][k];
            b[r] -= f * b[c];
        }
    }
    return [...b.map((v, i) => v / A[i][i]), 1];
}
function applyH(H, x, y) { const w = H[6] * x + H[7] * y + H[8]; return [(H[0] * x + H[1] * y + H[2]) / w, (H[3] * x + H[4] * y + H[5]) / w, w]; }
function invertH(H) {
    const [a, b, c, d, e, f, g, h, i] = H;
    const A = e * i - f * h, B = -(d * i - f * g), C = d * h - e * g, det = a * A + b * B + c * C;
    return [A / det, -(b * i - c * h) / det, (b * f - c * e) / det, B / det, (a * i - c * g) / det, -(a * f - c * d) / det, C / det, -(a * h - b * g) / det, (a * e - b * d) / det];
}
const warpCache = new Map();
// 絵（色合いを当てたもの）を、src4 の 4 点が dst4（部屋の点、掛ける位置の左下が原点）に来るように変形する
function warpedWall(art, tint, src4, dst4) {
    const key = `${art}|${JSON.stringify(tint || null)}|${JSON.stringify(src4)}|${JSON.stringify(dst4)}`;
    if (warpCache.has(key)) { const v = warpCache.get(key); warpCache.delete(key); warpCache.set(key, v); return v; }
    const im = images.get(art), srcImg = tintedSource(art, tint);
    if (!im || !im.data) return null;
    const sd = srcImg === im.img ? im.data.data : srcImg.getContext('2d').getImageData(0, 0, im.w, im.h).data;
    const H = solveHomography(src4, dst4);
    if (!H) return null;
    const cs = [[0, 0], [im.w, 0], [0, im.h], [im.w, im.h]].map(([x, y]) => applyH(H, x, y));
    if (cs.some(p => !(p[2] > 0))) return null; // 絵の端が「地平線」の向こうに行く（変形が大きすぎる）
    const Hi = invertH(H);
    // 元の絵とだいたい同じ細かさで作る
    const R = Math.min(6, Math.max(1, Math.hypot(src4[1][0] - src4[0][0], src4[1][1] - src4[0][1]) / Math.hypot(dst4[1][0] - dst4[0][0], dst4[1][1] - dst4[0][1])));
    const x0 = Math.min(...cs.map(p => p[0])), y0 = Math.min(...cs.map(p => p[1]));
    const W = Math.ceil((Math.max(...cs.map(p => p[0])) - x0) * R), Hh = Math.ceil((Math.max(...cs.map(p => p[1])) - y0) * R);
    const out = new ImageData(W, Hh), od = out.data, alpha = new Uint8Array(W * Hh), sw = im.w, sh = im.h;
    for (let py = 0; py < Hh; py++) {
        const Y = y0 + (py + 0.5) / R;
        for (let px = 0; px < W; px++) {
            const X = x0 + (px + 0.5) / R;
            const w = Hi[6] * X + Hi[7] * Y + Hi[8];
            const u = (Hi[0] * X + Hi[1] * Y + Hi[2]) / w - 0.5, v = (Hi[3] * X + Hi[4] * Y + Hi[5]) / w - 0.5;
            if (u < -1 || v < -1 || u >= sw || v >= sh) continue;
            // 4 点の間をなめらかにつなぐ（透明な所の色が混ざらないよう、不透明さで重みを付ける）
            const ix = Math.floor(u), iy = Math.floor(v), fx = u - ix, fy = v - iy;
            let r = 0, g = 0, b = 0, a = 0;
            for (let k = 0; k < 4; k++) {
                const xx = ix + (k & 1), yy = iy + (k >> 1);
                if (xx < 0 || yy < 0 || xx >= sw || yy >= sh) continue;
                const wt = ((k & 1) ? fx : 1 - fx) * ((k >> 1) ? fy : 1 - fy), q = (yy * sw + xx) * 4, aa = sd[q + 3] * wt;
                r += sd[q] * aa; g += sd[q + 1] * aa; b += sd[q + 2] * aa; a += aa;
            }
            if (a < 1) continue;
            const o = (py * W + px) * 4;
            od[o] = r / a; od[o + 1] = g / a; od[o + 2] = b / a; od[o + 3] = a;
            alpha[py * W + px] = a;
        }
    }
    const c = document.createElement('canvas');
    c.width = W; c.height = Hh;
    c.getContext('2d').putImageData(out, 0, 0);
    const v = { img: c, w: W, h: Hh, alpha, m: [1 / R, 0, 0, 1 / R, x0, y0] };
    warpCache.set(key, v);
    if (warpCache.size > 40) warpCache.delete(warpCache.keys().next().value);
    return v;
}
// 家具の絵の置き方（img/sprites.json の測った値を使う）
// - 壁掛け: 本体（窓枠・額縁の正面）の 4 つの角を、壁の上の四角に合わせる（飾りははみ出してよい）。絵の向き（右の壁向き・左の壁向き）と掛ける壁が違えば左右反転
// - ラグ: 床に着く 3 つの角を、足元の四角の角に合わせる
// - 床に着く角が分かる家具: 縦横同じ倍率で縮め、脚の先の左端・右端を足元の四角の左右の端（legInset があればその割合）に、いちばん下の脚の先を床に合わせる
// - 丸い物・細い物（fitHeight）: その高さに縮め、底の真ん中を足元の四角の真ん中に置く
// rot 1 は左右反転
function artMatrix(item) {
    const def = FURNITURE[item.type], im = images.get(def.art), meta = metaOf(def.art), fit = fitOf(def.art);
    const { gx, gz, w, d, lift } = placeOf(item);
    const src = tintedSource(def.art, item.tint);
    if (!im) return { m: [1, 0, 0, 1, 0, 0], im: null, src };
    const W = im.w, flip = [-1, 0, 0, 1, W, 0];
    const fp = (p) => [W - p[0], p[1]];
    if (def.wall && meta.wall?.face) {
        // 本体（窓枠・額縁の正面）の 4 つの角を、壁の上の四角の角に合わせる
        let [tl, tr, bl, br] = meta.wall.face;
        const rightWallArt = (br[1] - bl[1]) > 0; // 下の辺が右下がりなら、右の壁向きの絵
        const mirror = rightWallArt === !!item.rot;
        {
            // 射影変換で 4 つの角をぴったり合わせる（反対の壁向きの絵は、左右の角を入れ替えて合わせると左右反転になる）
            const h = wallHeight(def), len = def.size[0];
            const src4 = mirror ? [tr, tl, br, bl] : [tl, tr, bl, br];
            const dst4 = item.rot ? [P(0, len, h), P(0, 0, h), P(0, len, 0), P(0, 0, 0)] : [P(0, 0, h), P(len, 0, h), P(0, 0, 0), P(len, 0, 0)];
            const wv = warpedWall(def.art, item.tint, src4, dst4);
            if (wv) {
                const off = item.rot ? P(0, item.gx, lift) : P(item.gx, 0, lift), m = [...wv.m];
                m[4] += off[0]; m[5] += off[1];
                return { m, im: wv, src: wv.img };
            }
        }
        if (mirror) [tl, tr, bl, br] = [fp(tr), fp(tl), fp(br), fp(bl)];
        const h = wallHeight(def), len = def.size[0];
        const [s0, s1] = item.rot ? [item.gx + len, item.gx] : [item.gx, item.gx + len];
        const Q = (along, y) => (item.rot ? P(0, along, y) : P(along, 0, y));
        const m = fitAffine([tl, tr, bl, br], [Q(s0, lift + h), Q(s1, lift + h), Q(s0, lift), Q(s1, lift)]);
        return { m: mirror ? mul(m, flip) : m, im, src };
    }
    if (def.wall && meta.wall) {
        let { s, a, b } = meta.wall;
        const mirror = (s > 0) === !!item.rot; // 右の壁向きの絵を左の壁に掛ける（またはその逆）
        if (mirror) { a += s * W; b += s * W; s = -s; }
        const h = wallHeight(def), len = def.size[0];
        // 絵の左端の上・左端の下・右端の下 → 壁の上の四角（画面の左端が、右の壁では始まり、左の壁では終わり）
        const [s0, s1] = item.rot ? [item.gx + len, item.gx] : [item.gx, item.gx + len];
        const Q = (along, y) => (item.rot ? P(0, along, y) : P(along, 0, y));
        const m = solveAffine([[0, a], [0, b], [W, b + s * W]], [Q(s0, lift + h), Q(s0, lift), Q(s1, lift)]);
        return { m: mirror ? mul(m, flip) : m, im, src };
    }
    const L = P(gx, gz + d, lift), B = P(gx + w, gz + d, lift), R = P(gx + w, gz, lift);
    const cs = meta.corners;
    if (cs) {
        const [sl, sb, sr] = item.rot ? [fp(cs[2]), fp(cs[1]), fp(cs[0])] : cs; // 反転した絵では、左右の角が入れ替わる
        let m;
        if (def.flat) m = solveAffine([sl, sb, sr], [L, B, R]);
        else {
            // 脚の広がりを足元の四角の幅（legInset があればその割合）に合わせ、真ん中をそろえる
            const f = (fit.legInset ?? def.legInset) || 1, C = P(gx + w / 2, gz + d / 2, lift);
            const k = f * (R[0] - L[0]) / (sr[0] - sl[0]);
            m = [k, 0, 0, k, (L[0] + R[0]) / 2 - (sl[0] + sr[0]) / 2 * k, C[1] + f * (B[1] - C[1]) - sb[1] * k];
        }
        return { m: item.rot ? mul(m, flip) : m, im, src };
    }
    const fitHeight = fit.fitHeight ?? def.fitHeight;
    if (fitHeight && meta.base) {
        // 底は、上から見ると丸いので、真ん中より少し手前（底の幅の縦の半分）が絵のいちばん下になる
        const k = fitHeight * PX_PER_M / im.h;
        let [bx, by, bw] = meta.base;
        if (item.rot) bx = W - bx;
        const C = P(gx + w / 2, gz + d / 2, lift);
        const m = [k, 0, 0, k, C[0] - bx * k, C[1] + bw * k * (CELL_H / CELL_W) / 2 - by * k];
        return { m: item.rot ? mul(m, flip) : m, im, src };
    }
    // 測った値がないとき: 足元の四角の横幅に合わせる
    const k = (R[0] - L[0]) / W;
    return { m: mul([k, 0, 0, k, L[0], B[1] - im.h * k], item.rot ? flip : [1, 0, 0, 1, 0, 0]), im, src };
}
// 絵の四角が部屋のどこに来るか（当たり判定・画面の位置合わせに使う）
function boundsOf(mx) {
    const im = mx.im, pts = im ? [[0, 0], [im.w, 0], [0, im.h], [im.w, im.h]].map(([u, v]) => apply(mx.m, u, v)) : [[0, 0]];
    const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
    return { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) };
}
function artRect(item) { return boundsOf(artMatrix(item)); }
// 縮めて描くと重いので、表示の大きさに合わせて縮めた絵を作っておく（拡大率ごと）
const scaledCache = new Map();
let scaledIds = new WeakMap(), scaledNext = 1;
function scaledSource(src, k) {
    if (k >= 0.9) return { c: src, k: 1 };
    const q = Math.pow(2, Math.ceil(Math.log2(k) * 4) / 4); // 4 分の 1 オクターブ刻み（少し大きめ）
    if (!scaledIds.has(src)) scaledIds.set(src, scaledNext++);
    const key = `${scaledIds.get(src)}|${q}`;
    if (scaledCache.has(key)) return { c: scaledCache.get(key), k: q };
    let cur = src, cw = src.width || src.naturalWidth, ch = src.height || src.naturalHeight;
    const tw = Math.max(1, Math.round(cw * q)), th = Math.max(1, Math.round(ch * q));
    // 半分ずつ縮めると、細い線がつぶれにくい
    while (cw / 2 > tw) {
        const c = document.createElement('canvas');
        c.width = Math.round(cw / 2); c.height = Math.round(ch / 2);
        c.getContext('2d').drawImage(cur, 0, 0, c.width, c.height);
        cur = c; cw = c.width; ch = c.height;
    }
    const out = document.createElement('canvas');
    out.width = tw; out.height = th;
    const g = out.getContext('2d');
    g.imageSmoothingQuality = 'high';
    g.drawImage(cur, 0, 0, tw, th);
    scaledCache.set(key, out);
    if (scaledCache.size > 300) scaledCache.delete(scaledCache.keys().next().value);
    return { c: out, k: q };
}
function drawMatrix(g, m, src, srcW) {
    if (!src) return;
    // 画面での縮み具合（行列の大きさ × 拡大率）に合わせて、前もって縮めた絵を使う
    const k = Math.sqrt(Math.abs(m[0] * m[3] - m[1] * m[2])) * view.scale * view.dpr;
    const s = scaledSource(src, k), w = srcW || src.width || src.naturalWidth;
    const r = w / (s.c.width || 1);
    g.save();
    g.transform(...mul(m, [r, 0, 0, r, 0, 0]));
    g.drawImage(s.c, 0, 0);
    g.restore();
}
function drawArt(g, item) {
    const mx = artMatrix(item);
    if (mx.im) drawMatrix(g, mx.m, mx.src, mx.im.w);
}
// 部屋の点 (x, y) が絵の不透明な所に当たるか
function hitMatrix(mx, x, y) {
    if (!mx.im) return false;
    const [u, v] = apply(invert(mx.m), x, y);
    if (u < 0 || v < 0 || u >= mx.im.w || v >= mx.im.h) return false;
    if (!mx.im.alpha) return true;
    return mx.im.alpha[Math.floor(v) * mx.im.w + Math.floor(u)] > 60;
}
// 住人の絵（四角）
function rectMatrix(r) { return { m: mul([r.w / r.im.w, 0, 0, r.h / r.im.h, r.x, r.y], r.flip ? [-1, 0, 0, 1, r.im.w, 0] : [1, 0, 0, 1, 0, 0]), im: r.im }; }

// ---- 形を描く小さな関数（部屋） ----
function path(g, pts) { g.beginPath(); g.moveTo(...pts[0]); for (let i = 1; i < pts.length; i++) g.lineTo(...pts[i]); g.closePath(); }
function fillLine(g, fill, w = 1.3, line = mix(fill, INK, 0.72)) {
    g.fillStyle = fill; g.fill();
    if (w) { g.strokeStyle = line; g.lineWidth = w; g.lineJoin = 'round'; g.stroke(); }
}
function quad(g, a, b, c, d, fill, w) { path(g, [a, b, c, d]); fillLine(g, fill, w); }
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

// ---------- 部屋を描く ----------
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
    g.restore();
    path(g, floor);
    g.strokeStyle = INK; g.lineWidth = 1.4; g.stroke();
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
// 床の家具・床の小物・住人を、奥から描く順に並べる。台に載った小物と、座っている住人は、その家具のすぐ後
function buildDrawList() {
    const box = (it) => { const [w, d] = footprint(it); return { item: it, x0: it.gx, x1: it.gx + w, z0: it.gz, z1: it.gz + d }; };
    const after = new Map(); // 家具の uid → すぐ後に描く物
    const later = (uid, o) => { if (!after.has(uid)) after.set(uid, []); after.get(uid).push(o); };
    const objs = [];
    for (const it of game.items) {
        const kind = kindOf(it);
        if (kind === 'floor') objs.push(box(it));
        else if (kind === 'small') { const s = supportOf(it); if (s) later(s.uid, box(it)); else objs.push(box(it)); }
    }
    const r = resident;
    if (r.visible) {
        const resObj = { resident: true, x0: r.x - 0.2, x1: r.x + 0.2, z0: r.z - 0.2, z1: r.z + 0.2 };
        if (seated()) later(r.use.plan.uid, resObj); else objs.push(resObj);
    }
    const list = [];
    for (const o of sortForDraw(objs)) {
        list.push(o);
        if (o.item && after.has(o.item.uid)) list.push(...sortForDraw(after.get(o.item.uid)));
    }
    return list;
}
// 床の家具の影は、取っておく背景の方に描く
function drawItem(g, it) { drawArt(g, it); }
// 部屋の床・壁・壁掛け・敷物・選んだ印・床の家具の影は、変わったときだけ描き直す（住人が動くたびには描かない）
const bgCanvas = document.createElement('canvas');
let bgKey = '';
function worldTransform(g) {
    const s = view.scale * view.dpr;
    g.setTransform(s, 0, 0, s, (view.w / 2 - view.cx * view.scale) * view.dpr, (view.h / 2 - view.cy * view.scale) * view.dpr);
}
function renderBackground() {
    const key = [view.scale, view.cx, view.cy, view.w, view.h, view.dpr, selectedUid, JSON.stringify(game.items), images.size, fitVersion].join('|');
    if (key === bgKey && bgCanvas.width === canvas.width && bgCanvas.height === canvas.height) return;
    bgKey = key;
    bgCanvas.width = canvas.width; bgCanvas.height = canvas.height;
    const g = bgCanvas.getContext('2d');
    g.clearRect(0, 0, bgCanvas.width, bgCanvas.height);
    worldTransform(g);
    g.imageSmoothingQuality = 'high';
    drawRoom(g);
    // 壁掛け → 敷物 → 選んだ印 → 床の家具の影
    for (const it of game.items) if (kindOf(it) === 'wall') drawArt(g, it);
    for (const it of game.items) if (kindOf(it) === 'flat') drawArt(g, it);
    drawMarker(g);
    for (const it of game.items) if (kindOf(it) === 'floor') { const [w, d] = footprint(it); floorShadow(g, it.gx, it.gz, w, d); }
}
let renderCount = 0; // 描き直した回数（テストで、止まっている間に描き直していないか確かめる）
function render() {
    const g = ctx;
    renderCount++;
    renderBackground();
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, canvas.width, canvas.height);
    g.drawImage(bgCanvas, 0, 0);
    worldTransform(g);
    g.imageSmoothingQuality = 'high';
    drawList = buildDrawList();
    for (const o of drawList) {
        if (o.resident) drawResident(g);
        else drawItem(g, o.item);
    }
    updateBubble();
}
// 選んだ家具の足元の印（重なっていれば赤）とマス目。壁掛けは壁の上に印を出す
function drawMarker(g) {
    const it = findItem(selectedUid);
    if (!it) return;
    const kind = kindOf(it), red = isBlocked(it);
    let pts;
    if (kind === 'wall') {
        // 壁掛けの本体（窓枠・額縁の正面）が合わさる、壁の上の四角
        const p = placeOf(it), h = wallHeight(FURNITURE[it.type]);
        pts = [P(p.gx, p.gz, p.lift), P(p.gx + p.w, p.gz + p.d, p.lift), P(p.gx + p.w, p.gz + p.d, p.lift + h), P(p.gx, p.gz, p.lift + h)];
    } else {
        g.strokeStyle = 'rgba(60, 40, 30, 0.12)'; g.lineWidth = 1;
        for (let k = 1; k < N; k++) {
            g.beginPath(); g.moveTo(...P(k, 0)); g.lineTo(...P(k, N)); g.stroke();
            g.beginPath(); g.moveTo(...P(0, k)); g.lineTo(...P(N, k)); g.stroke();
        }
        const { gx, gz, w, d, lift } = placeOf(it);
        pts = [P(gx, gz, lift), P(gx + w, gz, lift), P(gx + w, gz + d, lift), P(gx, gz + d, lift)];
    }
    path(g, pts);
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
        const it = findItem(uid);
        selName.textContent = FURNITURE[it.type].name;
        document.getElementById('rotate-btn').textContent = kindOf(it) === 'wall' ? '⇆ 反対の壁' : '⇆ 向き';
        hint.classList.add('hidden');
    }
    requestRender();
}
function addItem(type) {
    if (available(type) <= 0) { toast(`${FURNITURE[type].name}は全部置いています。お店で買うと増やせます`); return; }
    const item = { uid: game.nextUid++, type, gx: 0, gz: 0, rot: 0 };
    if (FURNITURE[type].wall) item.y = FURNITURE[type].y;
    Object.assign(item, findFreeSpot(item));
    game.items.push(item);
    select(item.uid);
    saveGame();
    residentNotice(item);
}
// 向きを変える（左右反転 = gx と gz の入れ替え）。足元の真ん中はなるべく動かさず、上の小物もいっしょに回す
function rotateSelected() {
    const it = findItem(selectedUid);
    if (!it) return;
    if (kindOf(it) === 'wall') {
        it.rot = it.rot ? 0 : 1;
        clampItem(it);
        saveGame();
        return;
    }
    const riders = ridersOf(it).map(r => ({ r, dx: r.gx - it.gx, dz: r.gz - it.gz }));
    const [cx, cz] = centerOf(it);
    it.rot = it.rot ? 0 : 1;
    const [w2, d2] = footprint(it);
    it.gx = Math.round(cx - w2 / 2); it.gz = Math.round(cz - d2 / 2);
    clampItem(it);
    for (const { r, dx, dz } of riders) {
        r.rot = r.rot ? 0 : 1;
        r.gx = it.gx + dz; r.gz = it.gz + dx;
        clampItem(r);
    }
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
document.getElementById('color-btn').addEventListener('click', () => openTint(selectedUid));
document.getElementById('fit-btn').addEventListener('click', () => openFit(selectedUid));
document.getElementById('remove-btn').addEventListener('click', removeSelected);
document.getElementById('done-btn').addEventListener('click', () => select(null));
window.addEventListener('keydown', (e) => {
    if (e.target.closest('input, textarea') || document.querySelector('dialog[open]')) return;
    const mod = e.ctrlKey || e.metaKey, key = e.key.toLowerCase();
    if (mod && key === 'z' && !e.shiftKey) { e.preventDefault(); undo(); return; }
    if (mod && (key === 'y' || (key === 'z' && e.shiftKey))) { e.preventDefault(); redo(); return; }
    if (selectedUid === null) return;
    if (key === 'r') rotateSelected();
    else if (key === 'c') openTint(selectedUid);
    else if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); removeSelected(); }
    else if (e.key === 'Escape') select(null);
});

// ---------- 指・マウスの操作 ----------
const pointers = new Map();
let gesture = null;
const DOUBLE_TAP_MS = 350;
let lastTap = null;
function hitItem(item, x, y) {
    if (kindOf(item) === 'flat') { const [w, d] = footprint(item), [a, b] = unP(x, y); return a >= item.gx && a <= item.gx + w && b >= item.gz && b <= item.gz + d; }
    return hitMatrix(artMatrix(item), x, y);
}
// 押した所にある家具（手前から。壁掛け・敷物は最後）。その時の並びで調べる（置いた直後で、まだ描いていなくても当たるように）
function pickItem(clientX, clientY) {
    const [x, y] = toWorld(clientX, clientY);
    const list = buildDrawList();
    for (let i = list.length - 1; i >= 0; i--) {
        const o = list[i];
        if (!o.resident && hitItem(o.item, x, y)) return o.item;
    }
    for (const kind of ['flat', 'wall']) {
        for (let i = game.items.length - 1; i >= 0; i--) {
            const it = game.items[i];
            if (kindOf(it) === kind && hitItem(it, x, y)) return it;
        }
    }
    return null;
}
// 住人を押したか（住人より手前の家具に隠れていないとき）
function residentHit(clientX, clientY) {
    if (!resident.visible) return false;
    const [x, y] = toWorld(clientX, clientY);
    const rr = residentRect();
    if (!rr.im || !hitMatrix(rectMatrix(rr), x, y)) return false;
    const list = buildDrawList(), ri = list.findIndex(o => o.resident);
    for (let i = list.length - 1; i > ri; i--) if (hitItem(list[i].item, x, y)) return false;
    return true;
}
// 壁の上のどこを指しているか。画面の左半分は左奥の壁（rot 1）、右半分は右奥の壁（rot 0）
function wallPoint(x, y) {
    const rot = x < 0 ? 1 : 0, a = Math.abs(x) / (CELL_W / 2);
    return { rot, a, y: (a * CELL_H / 2 - y) / PX_PER_M };
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
    if (!item) { gesture = { type: 'pan', ...base }; return; }
    const [x, y] = toWorld(e.clientX, e.clientY);
    if (kindOf(item) === 'wall') {
        const p = wallPoint(x, y);
        gesture = { type: 'drag', uid: item.uid, offA: p.rot === item.rot ? item.gx - p.a : -FURNITURE[item.type].size[0] / 2, offY: item.y - p.y, ...base };
    } else {
        // 小物は載っている高さの面で動かす
        const lift = placeOf(item).lift;
        const [gx, gz] = unP(x, y, lift);
        gesture = { type: 'drag', uid: item.uid, lift, offX: item.gx - gx, offZ: item.gz - gz, riders: ridersOf(item).map(r => ({ uid: r.uid, dx: r.gx - item.gx, dz: r.gz - item.gz })), ...base };
    }
    select(item.uid);
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
        return;
    }
    const it = findItem(gesture.uid);
    if (!it) return;
    const [x, y] = toWorld(e.clientX, e.clientY);
    if (kindOf(it) === 'wall') {
        // 壁に沿って動かす。指が反対の壁に移ったら、そちらに掛け替える
        const p = wallPoint(x, y);
        if (p.rot !== it.rot) { it.rot = p.rot; gesture.offA = -FURNITURE[it.type].size[0] / 2; }
        it.gx = p.a + gesture.offA; it.y = p.y + gesture.offY;
        clampItem(it);
        requestRender();
        return;
    }
    const [gx, gz] = unP(x, y, gesture.lift);
    const nx = Math.round(gx + gesture.offX), nz = Math.round(gz + gesture.offZ);
    if (nx !== it.gx || nz !== it.gz) {
        it.gx = nx; it.gz = nz;
        clampItem(it);
        // 上に載った小物もいっしょに動かす
        for (const r of gesture.riders) {
            const o = findItem(r.uid);
            if (o) { o.gx = it.gx + r.dx; o.gz = it.gz + r.dz; clampItem(o); }
        }
        requestRender();
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
const CATALOG_GROUPS = [['floor', '家具'], ['flat', '家具'], ['small', '小物'], ['wall', '壁掛け']];
function renderCatalog() {
    const wrap = document.getElementById('items');
    wrap.innerHTML = '';
    for (const [kind] of CATALOG_GROUPS) {
        for (const [type, def] of Object.entries(FURNITURE)) {
            if (kindOf({ type }) !== kind || !game.owned[type]) continue;
            const b = document.createElement('button');
            b.className = 'item';
            b.dataset.type = type;
            b.innerHTML = `<img src="img/${def.art}.webp?v=${APP_VERSION}" alt="">`;
            b.append(def.name);
            if (kind === 'small' || kind === 'wall') {
                const tag = document.createElement('small');
                tag.className = 'item-kind';
                tag.textContent = kind === 'small' ? '小物' : '壁掛け';
                b.prepend(tag);
            }
            const count = document.createElement('small');
            count.className = 'item-count';
            b.append(count);
            b.addEventListener('click', () => addItem(type));
            wrap.appendChild(b);
        }
    }
    if (!wrap.children.length) wrap.innerHTML = '<p class="empty">家具を持っていません。🛒 お店で買えます</p>';
    updateCatalogCounts();
}
// 一覧の「あと何個置けるか」
function updateCatalogCounts() {
    for (const b of document.querySelectorAll('#items .item')) {
        const n = available(b.dataset.type);
        b.querySelector('.item-count').textContent = n > 0 ? `あと ${n}` : '置いた';
        b.classList.toggle('used-up', n <= 0);
    }
}

// ---------- 色合い ----------
const tintDialog = document.getElementById('tint-dialog');
const tintInputs = { h: document.getElementById('tint-h'), s: document.getElementById('tint-s'), l: document.getElementById('tint-l') };
// よく使う色合い（家具の元の色からの変え方）
const TINT_PRESETS = [
    ['元の色', null], ['赤み', { h: -30, s: 110, l: 100 }], ['黄み', { h: 30, s: 110, l: 100 }], ['緑み', { h: 90, s: 100, l: 100 }],
    ['青み', { h: 180, s: 100, l: 100 }], ['紫み', { h: -90, s: 100, l: 100 }], ['明るく', { h: 0, s: 90, l: 125 }],
    ['暗く', { h: 0, s: 100, l: 72 }], ['くすみ', { h: 0, s: 45, l: 100 }], ['モノクロ', { h: 0, s: 0, l: 100 }],
];
let tintUid = null, tintBefore = null, tintPart = 'all';
// いま選んでいる部分（all は全部）の色合い
function curTint(it) { return (tintPart === 'all' ? it.tint?.all : tintFor(it.tint, tintPart)) || TINT_DEFAULT; }
function openTint(uid) {
    const it = findItem(uid);
    if (!it) return;
    tintUid = uid;
    tintPart = 'all';
    tintBefore = JSON.stringify(it.tint || null);
    document.getElementById('tint-name').textContent = FURNITURE[it.type].name;
    renderTintParts(it);
    renderTintPresets(it);
    syncTintInputs(it);
    tintDialog.showModal();
    revealAbove(it, tintDialog);
}
// 下から出る画面で家具が隠れるときだけ、家具が見える所まで部屋をずらす（閉じたら戻す）
let viewBeforeSheet = null;
function revealAbove(it, sheet) {
    const vr = viewEl.getBoundingClientRect(), top = sheet.getBoundingClientRect().top;
    const visible = Math.min(vr.bottom, top) - vr.top; // 部屋が見えている高さ
    const r = artRect(it), [, sy] = toScreen(r.x + r.w / 2, r.y + r.h / 2);
    if (sy + r.h * view.scale / 2 < visible - 8) return;
    viewBeforeSheet = { cx: view.cx, cy: view.cy };
    view.cy += (sy - visible / 2) / view.scale;
    view.cy = Math.min(view.cy, ROOM_BOX.y1 + view.h / view.scale); // 下へずらしすぎない
    requestRender();
}
function restoreView() {
    if (!viewBeforeSheet) return;
    Object.assign(view, viewBeforeSheet);
    viewBeforeSheet = null;
    requestRender();
}
// 部分を選ぶボタン（全部・部分ごと）。色の点は、いまの色合いを当てた代表の色
function renderTintParts(it) {
    const wrap = document.getElementById('tint-parts');
    wrap.innerHTML = '';
    const parts = partsOf(FURNITURE[it.type].art);
    wrap.hidden = parts.length < 2;
    const add = (key, label, color) => {
        const b = document.createElement('button');
        b.className = 'tint-part';
        b.dataset.part = key;
        b.setAttribute('aria-pressed', String(key === tintPart));
        b.innerHTML = color ? '<span class="dot"></span>' : '';
        if (color) b.querySelector('.dot').style.background = color;
        b.append(label);
        b.addEventListener('click', () => {
            tintPart = key;
            wrap.querySelectorAll('.tint-part').forEach(x => x.setAttribute('aria-pressed', String(x === b)));
            renderTintPresets(it);
            syncTintInputs(it);
        });
        wrap.appendChild(b);
    };
    add('all', 'ぜんぶ', null);
    parts.forEach((p, i) => add(String(i + 1), p.name, tintedColor(p.color, tintFor(it.tint, i + 1))));
}
// 代表の色に色合いを当てた色（部分のボタンの点に使う）
function tintedColor(hex, t) {
    if (!t) return hex;
    const n = parseInt(hex.slice(1), 16);
    let [h, s, l] = rgbToHsl((n >> 16) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
    h = (h + t.h / 360 + 1) % 1; s = Math.min(1, s * t.s / 100);
    const kl = t.l / 100; l = kl <= 1 ? l * kl : l + (1 - l) * (kl - 1) * 0.8;
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s, pp = 2 * l - q;
    const c = s === 0 ? [l, l, l] : [hue2rgb(pp, q, h + 1 / 3), hue2rgb(pp, q, h), hue2rgb(pp, q, h - 1 / 3)];
    return '#' + c.map(v => Math.round(v * 255).toString(16).padStart(2, '0')).join('');
}
function syncTintInputs(it) {
    const t = curTint(it);
    for (const k of ['h', 's', 'l']) {
        tintInputs[k].value = t[k];
        document.getElementById(`tint-${k}-val`).textContent = k === 'h' ? `${t[k] > 0 ? '+' : ''}${t[k]}°` : `${t[k]}%`;
    }
    const cur = JSON.stringify(tintPart === 'all' ? it.tint?.all || null : it.tint?.[tintPart] || null);
    document.querySelectorAll('#tint-presets button').forEach((b, i) => {
        b.setAttribute('aria-pressed', String(JSON.stringify(sanitizeOne(TINT_PRESETS[i][1])) === cur));
    });
    // 部分のボタンの色の点も、いまの色合いに合わせる
    const parts = partsOf(FURNITURE[it.type].art);
    document.querySelectorAll('#tint-parts .tint-part').forEach(b => {
        const n = Number(b.dataset.part);
        if (n) b.querySelector('.dot').style.background = tintedColor(parts[n - 1].color, tintFor(it.tint, n));
    });
}
// 選んでいる部分の色合いを t にした、家具全体の色合い
function withPart(it, t) {
    const out = { ...(it.tint || {}) };
    if (tintPart === 'all') {
        // 全部を変えるときは、部分ごとの色合いを消して、全部そろえる
        for (const k of Object.keys(out)) delete out[k];
        if (t) out.all = t;
    } else if (t) out[tintPart] = t;
    else delete out[tintPart];
    return sanitizeTint(out);
}
// 見本: その家具（選んだ部分）に色合いを当てた小さな絵
function renderTintPresets(it) {
    const wrap = document.getElementById('tint-presets');
    wrap.innerHTML = '';
    const def = FURNITURE[it.type], im = images.get(def.art);
    for (const [name, tint] of TINT_PRESETS) {
        const b = document.createElement('button');
        b.className = 'tint-preset';
        const c = document.createElement('canvas');
        c.width = 96; c.height = 72;
        const src = tintedSource(def.art, withPart(it, sanitizeOne(tint)));
        if (im && src) {
            const k = Math.min(c.width / im.w, c.height / im.h);
            c.getContext('2d').drawImage(src, (c.width - im.w * k) / 2, (c.height - im.h * k) / 2, im.w * k, im.h * k);
        }
        b.append(c, name);
        b.addEventListener('click', () => { setTint(withPart(it, sanitizeOne(tint))); saveGame(); });
        wrap.appendChild(b);
    }
}
function setTint(tint) {
    const it = findItem(tintUid);
    if (!it) return;
    if (tint) it.tint = tint; else delete it.tint;
    syncTintInputs(it);
    requestRender();
}
for (const k of ['h', 's', 'l']) {
    tintInputs[k].addEventListener('input', () => {
        const it = findItem(tintUid);
        if (!it) return;
        setTint(withPart(it, sanitizeOne({ ...curTint(it), [k]: Number(tintInputs[k].value) })));
    });
    tintInputs[k].addEventListener('change', () => { const it = findItem(tintUid); if (it) renderTintPresets(it); saveGame(); });
}
document.getElementById('tint-reset').addEventListener('click', () => { const it = findItem(tintUid); if (it) setTint(withPart(it, null)); saveGame(); });
document.getElementById('tint-revert').addEventListener('click', () => { setTint(sanitizeTint(JSON.parse(tintBefore))); saveGame(); });
document.getElementById('tint-close').addEventListener('click', () => tintDialog.close());
tintDialog.addEventListener('click', (e) => { if (e.target === tintDialog) tintDialog.close(); });
tintDialog.addEventListener('close', () => { tintUid = null; restoreView(); saveGame(); });

// ---------- 住人 ----------
// 部屋を歩き回り、家具を使う。位置は保存しない（開くたびに部屋の真ん中近くから始まる）
const RES = {
    speed: 1.6,     // 歩く速さ（マス/秒）
    stride: 0.42,   // 一歩の長さ（マス）
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
    timer: 2, t: 0, hop: 0, step: 0, pose: null, poseUntil: 0, // step: 歩いた歩数（1 歩で 1 増える）
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
    // 歩く: 右足 → 立ち → 左足 → 立ち の 4 拍（2 歩で 1 回り）
    const beat = Math.floor(r.step * 2) % 4;
    const n = r.mode === 'walk' ? [RESIDENT_FRAMES.walkA, RESIDENT_FRAMES.stand, RESIDENT_FRAMES.walkB, RESIDENT_FRAMES.stand][beat] : RESIDENT_FRAMES.stand;
    return { n, flip: sx > 0 };
}
// 住人の絵を置く四角（部屋の座標）。足元の点に下端中央を合わせる
function residentRect() {
    const r = resident, f = residentFrame(), im = images.get(`resident_${f.n}`);
    const a = seated() ? r.use.plan.anchor : { x: r.x, z: r.z, lift: 0 };
    const [sx, sy] = P(a.x, a.z, a.lift);
    // 絵の高さはどれも同じ（足元をそろえて切り出している）
    const h = RES.height * PX_PER_M, w = im ? h * im.w / im.h : h * 0.8;
    // 一歩ごとに体が上下する（足が床に着く瞬間がいちばん低い）
    const bob = r.mode === 'walk' ? Math.abs(Math.sin(r.step * Math.PI)) * 3.5 : 0;
    const hop = Math.sin(r.hop * Math.PI) * 10;
    return { x: sx - w / 2, y: sy - h + 3 - bob - hop, w, h, flip: f.flip, im, footX: sx, footY: sy };
}
function drawResident(g) {
    const r = resident;
    if (!seated()) {
        const [x, y] = P(r.x, r.z);
        g.fillStyle = 'rgba(58, 42, 64, 0.22)';
        g.beginPath(); g.ellipse(x, y, 16, 6, 0, 0, Math.PI * 2); g.fill();
    }
    const rr = residentRect();
    if (!rr.im) return;
    // 歩くときは、一歩ごとに体を左右へ少し傾ける（後ろ姿は 1 枚しかないので、少し大きめに）
    const sway = r.mode === 'walk' ? Math.sin(r.step * Math.PI) * (residentFrame().n === RESIDENT_FRAMES.back ? 0.06 : 0.035) : 0;
    g.save();
    g.translate(rr.footX, rr.footY); g.rotate(sway); g.translate(-rr.footX, -rr.footY);
    drawMatrix(g, rectMatrix(rr).m, rr.im.img, rr.im.w);
    g.restore();
}

// ---- 歩ける場所（0.5 マスごと） ----
const NAV_N = Math.round(N / RES.nav);
function navCenter(i) { return (i + 0.5) * RES.nav; }
function navIndex(v) { return Math.min(NAV_N - 1, Math.max(0, Math.floor(v / RES.nav))); }
// ふさがっているマス（床の家具、床に置いた小物、壁ぎわ）
function buildNavGrid() {
    const g = new Uint8Array(NAV_N * NAV_N);
    const rects = game.items.filter(it => kindOf(it) === 'floor' || (kindOf(it) === 'small' && !supportOf(it)))
        .map(it => { const [w, d] = footprint(it); return [it.gx, it.gz, it.gx + w, it.gz + d]; });
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
function itemSig(item) { return item ? `${item.gx},${item.gz},${item.rot},${item.y ?? ''}` : ''; }
// 家具を使うときの「近づく位置（to）・向き（face）・絵を置く足元（anchor）」の候補。
// L(a, b): 家具の向きでの位置。a は横、b は奥行き（正面が大きい方）
function plansFor(item) {
    const def = FURNITURE[item.type];
    if (!def.use) return [];
    const base = { uid: item.uid, sig: itemSig(item), act: def.use, lines: def.lines || [], flip: !!item.rot };
    const G = 0.75; // 家具から離れて立つ距離（歩けるマス目の真ん中に来るように）
    if (def.wall) {
        // 壁の前に立って、壁の方を向く
        const a = item.gx + def.size[0] / 2;
        return [{ ...base, to: item.rot ? { x: 1.25, z: a } : { x: a, z: 1.25 }, face: item.rot ? { x: -1, z: 0 } : { x: 0, z: -1 } }];
    }
    const [w, d] = footprint(item);
    const L = (a, b) => item.rot ? { x: item.gx + b, z: item.gz + a } : { x: item.gx + a, z: item.gz + b };
    const [len, dep] = item.rot ? [d, w] : [w, d];
    const front = item.rot ? { x: 1, z: 0 } : { x: 0, z: 1 };
    if (def.use === 'look') {
        // 正面から眺める。ふさがっていれば横や後ろから（向きは家具の方へ）。台の上の小物は、台の手前から
        const sup = def.small ? supportOf(item) : null;
        const extra = sup ? (sup.rot ? sup.gx + footprint(sup)[0] - item.gx - w : sup.gz + footprint(sup)[1] - item.gz - d) : 0;
        const sides = [[L(len / 2, dep + G + Math.max(0, extra)), front], [L(-G, dep / 2), item.rot ? { x: 0, z: -1 } : { x: -1, z: 0 }],
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
        // 踏み出すときに速く、足が着くときにゆっくり（すべって見えないように）
        const step = RES.speed * dt * (0.7 + 0.6 * Math.sin(r.step * Math.PI) ** 2);
        r.step += step / RES.stride;
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
    earn(USE_COINS[p.act] || 5);
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
    // 住人の見た目が前と同じ（立ち止まっているなど）なら、描き直さない
    const rr = residentRect(), f = residentFrame();
    const sig = [rr.x, rr.y, f.n, f.flip, r.step.toFixed(2), r.mode === 'walk', bubble.hidden ? '' : r.bubbleText, r.t < r.bubbleUntil].join('|');
    if (sig === lastResidentSig && !renderQueued) return;
    lastResidentSig = sig;
    render();
}
let lastResidentSig = '';
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

// ---------- 合わせ方の調整（作る人向け） ----------
// 自動で求めた「床に着く点」「窓枠の角」などがずれるとき、絵の上の点を指で動かして直す。直すとすぐ部屋に出る。
// 直した値はこの端末に残る。「書き出す」で fit.json を作り、img/fit.json に置き換えると、みんなの画面にも出る
const FIT_MODE_KEY = 'lifemaker2d_fitmode';
let fitMode = false;
try { fitMode = localStorage.getItem(FIT_MODE_KEY) === '1'; } catch (e) { }
const fitBtn = document.getElementById('fit-btn');
function updateFitBtn() { fitBtn.hidden = !fitMode; }
updateFitBtn();
const fitDialog = document.getElementById('fit-dialog');
const fitCanvas = document.getElementById('fit-canvas');
const fitState = { art: null, def: null, kind: null, pts: [], sel: 0, zoom: false, cx: 0, cy: 0, before: null, drag: null };
const FIT_ZOOM = 3;
const FIT_LABELS = { corners: ['左', '手前', '右'], flat: ['左', '手前', '右'], face: ['左上', '右上', '左下', '右下'], base: ['底'] };
const FIT_HELP = {
    corners: '床に着く 3 つの点（左・手前・右の脚の先）を、絵の上で合わせます。左と右の点の幅が足元の四角の幅に、手前の点が床の高さになります。',
    flat: '敷物の 3 つの角（左・手前・右）を合わせます。この 3 つの角が、床の四角の角に重なります。',
    face: '窓枠・額縁の 4 つの角を合わせます。この四角が、壁の上の四角にぴったり重なります（カーテンなどの飾りははみ出してよい）。',
    base: '底の真ん中（床に着く所）を合わせます。大きさは「高さ」で決まります。',
};
function fitKind(def) {
    if (def.wall) return 'face';
    if (metaOf(def.art).corners) return def.flat ? 'flat' : 'corners';
    return 'base';
}
// 今の点（絵の上の位置）
function fitPoints(def, kind) {
    const m = metaOf(def.art), im = images.get(def.art);
    if (kind === 'face') {
        if (m.wall?.face) return m.wall.face.map(p => [...p]);
        const { s = 0, a = 0, b = im.h } = m.wall || {}, W = im.w; // 絵を囲む平行四辺形の角
        return [[0, a], [W, a + s * W], [0, b], [W, b + s * W]];
    }
    if (kind === 'base') { const b = m.base || [im.w / 2, im.h - 1, im.w / 2]; return [[b[0], b[1]]]; }
    return m.corners.map(p => [...p]);
}
// 数で直す値（脚の広がり・高さ）
function fitNumber() {
    const { kind, def } = fitState;
    if (kind === 'corners') return { key: 'legInset', min: 0.4, max: 1.3, step: 0.01, def: def.legInset || 1, label: '脚の広がり（足元の幅に対して）', fmt: v => `${Math.round(v * 100)}%` };
    if (kind === 'base' && def.fitHeight) return { key: 'fitHeight', min: 0.1, max: 2.5, step: 0.01, def: def.fitHeight, label: '高さ', fmt: v => `${v.toFixed(2)} m` };
    return null;
}
function fitApplied() {
    fitVersion++;
    for (const it of game.items) if (FURNITURE[it.type].art === fitState.art && kindOf(it) === 'wall') clampItem(it); // 壁掛けは高さが変わる
    saveFitLocal();
    drawFitCanvas();
    updateFitStatus();
    requestRender();
}
// 動かした点を、この端末の値に書く
function fitStore() {
    const { art, kind, pts } = fitState, r = (v) => Math.round(v * 10) / 10;
    const e = { ...fitLocal[art] }, P2 = pts.map(p => [r(p[0]), r(p[1])]);
    if (kind === 'face') e.face = P2;
    else if (kind === 'base') e.base = [P2[0][0], P2[0][1], (metaOf(art).base || [0, 0, images.get(art).w / 2])[2]];
    else e.corners = P2;
    fitLocal[art] = e;
    fitApplied();
}
function fitScale() {
    const im = images.get(fitState.art), k = Math.min(fitCanvas.clientWidth / im.w, fitCanvas.clientHeight / im.h) * 0.9;
    return fitState.zoom ? k * FIT_ZOOM : k;
}
// 絵の点 → 合わせ方の画面の点（CSS px）
function fitToCanvas(p) {
    const k = fitScale();
    return [(p[0] - fitState.cx) * k + fitCanvas.clientWidth / 2, (p[1] - fitState.cy) * k + fitCanvas.clientHeight / 2];
}
// 拡大しているときは選んだ点を、していないときは絵の真ん中を、画面の真ん中にする
function fitCenter() {
    const im = images.get(fitState.art);
    [fitState.cx, fitState.cy] = fitState.zoom ? fitState.pts[fitState.sel] : [im.w / 2, im.h / 2];
}
function drawFitCanvas() {
    if (!fitDialog.open || !fitState.art) return;
    const cw = fitCanvas.clientWidth, ch = fitCanvas.clientHeight, dpr = Math.min(window.devicePixelRatio || 1, 2);
    if (!cw || !ch) return;
    if (fitCanvas.width !== Math.round(cw * dpr) || fitCanvas.height !== Math.round(ch * dpr)) { fitCanvas.width = Math.round(cw * dpr); fitCanvas.height = Math.round(ch * dpr); }
    const g = fitCanvas.getContext('2d'), im = images.get(fitState.art), k = fitScale(), [ox, oy] = fitToCanvas([0, 0]);
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, cw, ch);
    g.imageSmoothingQuality = 'high';
    g.drawImage(im.img, ox, oy, im.w * k, im.h * k);
    const pts = fitState.pts.map(fitToCanvas), kind = fitState.kind;
    g.lineWidth = 2; g.strokeStyle = '#d9774b'; g.setLineDash([6, 4]);
    if (kind === 'face') { path(g, [pts[0], pts[1], pts[3], pts[2]]); g.stroke(); }
    else if (kind === 'base') {
        const bw = (metaOf(fitState.art).base || [0, 0, im.w / 2])[2] * k / 2;
        g.beginPath(); g.moveTo(pts[0][0] - bw, pts[0][1]); g.lineTo(pts[0][0] + bw, pts[0][1]); g.stroke();
    } else { g.beginPath(); g.moveTo(...pts[0]); g.lineTo(...pts[1]); g.lineTo(...pts[2]); g.stroke(); }
    g.setLineDash([]);
    g.font = 'bold 12px system-ui, sans-serif'; g.textAlign = 'center';
    pts.forEach((p, i) => {
        const on = i === fitState.sel;
        g.beginPath(); g.arc(p[0], p[1], on ? 8 : 6, 0, Math.PI * 2);
        g.fillStyle = on ? '#d9774b' : '#fff'; g.fill();
        g.lineWidth = 2; g.strokeStyle = INK; g.stroke();
        // 印の真ん中が分かるように、真ん中に小さな点
        g.beginPath(); g.arc(p[0], p[1], 1.2, 0, Math.PI * 2); g.fillStyle = on ? '#fff' : INK; g.fill();
        const label = FIT_LABELS[kind][i];
        g.lineWidth = 3; g.strokeStyle = '#fff'; g.strokeText(label, p[0], p[1] - 13);
        g.fillStyle = INK; g.fillText(label, p[0], p[1] - 13);
    });
}
function renderFitPoints() {
    const box = document.getElementById('fit-points');
    box.innerHTML = '';
    FIT_LABELS[fitState.kind].forEach((label, i) => {
        const b = document.createElement('button');
        b.className = 'tint-part';
        b.textContent = label;
        b.setAttribute('aria-pressed', String(i === fitState.sel));
        b.addEventListener('click', () => selectFitPoint(i));
        box.appendChild(b);
    });
    document.getElementById('fit-zoom').setAttribute('aria-pressed', String(fitState.zoom));
}
function selectFitPoint(i) {
    fitState.sel = i;
    if (fitState.zoom) fitCenter();
    renderFitPoints();
    drawFitCanvas();
}
const fitNum = document.getElementById('fit-num'), fitNumRow = document.getElementById('fit-num-row');
function renderFitNumber() {
    const n = fitNumber();
    fitNumRow.hidden = !n;
    if (!n) return;
    document.getElementById('fit-num-label').textContent = n.label;
    Object.assign(fitNum, { min: n.min, max: n.max, step: n.step });
    fitNum.value = fitOf(fitState.art)[n.key] ?? n.def;
    document.getElementById('fit-num-val').textContent = n.fmt(Number(fitNum.value));
}
function updateFitStatus() {
    const art = fitState.art;
    document.getElementById('fit-status').textContent = fitLocal[art] ? 'この端末で直した値を使っています（書き出して img/fit.json に入れるまで、ほかの端末には出ません）'
        : fitBase[art] ? '手で直した値（img/fit.json）を使っています' : '自動で求めた値を使っています';
    document.getElementById('fit-clear').disabled = !fitLocal[art];
}
// 値が外から変わったとき（戻す・消す）に、点と数を読み直す
function reloadFit() {
    fitState.kind = fitKind(fitState.def);
    fitState.pts = fitPoints(fitState.def, fitState.kind);
    fitState.sel = Math.min(fitState.sel, fitState.pts.length - 1);
    fitCenter();
    renderFitPoints();
    renderFitNumber();
    fitApplied();
}
function openFit(uid) {
    const it = findItem(uid);
    if (!it) return;
    const def = FURNITURE[it.type];
    if (!images.get(def.art)) return;
    Object.assign(fitState, { art: def.art, def, kind: fitKind(def), sel: 0, zoom: false, drag: null, before: JSON.stringify(fitLocal[def.art] ?? null) });
    fitState.pts = fitPoints(def, fitState.kind);
    document.getElementById('fit-name').textContent = def.name;
    document.getElementById('fit-help').textContent = FIT_HELP[fitState.kind];
    renderFitPoints();
    renderFitNumber();
    updateFitStatus();
    fitDialog.showModal();
    fitCenter();
    drawFitCanvas();
    revealAbove(it, fitDialog);
}
// 点を動かす（指を置いた所に飛ばさず、動かした分だけ動かす。指で点が隠れても合わせやすい）
fitCanvas.addEventListener('pointerdown', (e) => {
    const r = fitCanvas.getBoundingClientRect(), x = e.clientX - r.left - fitCanvas.clientLeft, y = e.clientY - r.top - fitCanvas.clientTop;
    let best = -1, bd = 32;
    fitState.pts.forEach((p, i) => { const [px, py] = fitToCanvas(p), d = Math.hypot(px - x, py - y); if (d < bd) { bd = d; best = i; } });
    if (best < 0) return;
    e.preventDefault();
    if (best !== fitState.sel) { fitState.sel = best; renderFitPoints(); }
    fitState.drag = { id: e.pointerId, x: e.clientX, y: e.clientY, p: [...fitState.pts[best]], k: fitScale() };
    try { fitCanvas.setPointerCapture(e.pointerId); } catch (err) { }
    drawFitCanvas();
});
fitCanvas.addEventListener('pointermove', (e) => {
    const d = fitState.drag;
    if (!d || d.id !== e.pointerId) return;
    fitState.pts[fitState.sel] = [d.p[0] + (e.clientX - d.x) / d.k, d.p[1] + (e.clientY - d.y) / d.k];
    fitStore();
});
const endFitDrag = (e) => { if (fitState.drag?.id === e.pointerId) fitState.drag = null; };
fitCanvas.addEventListener('pointerup', endFitDrag);
fitCanvas.addEventListener('pointercancel', endFitDrag);
// 選んだ点を少しずつ動かす（拡大しているときは 1 押しで 1 ドット、していないときは 2 ドット）
function nudgeFit(dx, dy) {
    const step = fitState.zoom ? 1 : 2, p = fitState.pts[fitState.sel];
    fitState.pts[fitState.sel] = [p[0] + dx * step, p[1] + dy * step];
    if (fitState.zoom) fitCenter();
    fitStore();
}
document.querySelectorAll('#fit-dialog [data-nudge]').forEach(b => b.addEventListener('click', () => { const [dx, dy] = b.dataset.nudge.split(',').map(Number); nudgeFit(dx, dy); }));
fitDialog.addEventListener('keydown', (e) => {
    const d = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key];
    if (!d || e.target.closest('input')) return;
    e.preventDefault();
    const n = e.shiftKey ? 10 : 1;
    nudgeFit(d[0] * n, d[1] * n);
});
document.getElementById('fit-zoom').addEventListener('click', () => {
    fitState.zoom = !fitState.zoom;
    fitCenter();
    renderFitPoints();
    drawFitCanvas();
});
fitNum.addEventListener('input', () => {
    const n = fitNumber();
    if (!n) return;
    fitLocal[fitState.art] = { ...fitLocal[fitState.art], [n.key]: Number(fitNum.value) };
    document.getElementById('fit-num-val').textContent = n.fmt(Number(fitNum.value));
    fitApplied();
});
document.getElementById('fit-revert').addEventListener('click', () => {
    const v = JSON.parse(fitState.before);
    if (v) fitLocal[fitState.art] = v; else delete fitLocal[fitState.art];
    reloadFit();
});
document.getElementById('fit-clear').addEventListener('click', () => {
    delete fitLocal[fitState.art];
    reloadFit();
});
// 全部の家具の手で直した値を、fit.json として書き出す（img/fit.json に置き換える）
function exportFit() {
    const arts = [...new Set([...Object.keys(fitBase), ...Object.keys(fitLocal)])].sort();
    const text = '{\n' + arts.map(a => ` ${JSON.stringify(a)}: ${JSON.stringify(fitOf(a))}`).join(',\n') + '\n}\n';
    try {
        const a = document.createElement('a');
        a.href = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
        a.download = 'fit.json';
        a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 2000);
        toast('fit.json を書き出しました');
    } catch (e) { console.error(e); }
    return text;
}
document.getElementById('fit-export').addEventListener('click', exportFit);
document.getElementById('fit-close').addEventListener('click', () => fitDialog.close());
fitDialog.addEventListener('click', (e) => { if (e.target === fitDialog) fitDialog.close(); });
fitDialog.addEventListener('close', () => { fitState.drag = null; restoreView(); });
new ResizeObserver(drawFitCanvas).observe(fitCanvas);

// ---------- お金・ゲームの中の 1 日・お店 ----------
// リアルな時間（現実の日付・時刻、閉じている間に進むもの）は使わない。
// ゲームの中の時計は、画面を開いている間だけ進む（DAY_SEC 秒で 1 日。7:00 から 23:00）。
// 1 日が終わると、次の日の朝におこづかいが入り、お店の品物が入れかわる。住人が家具を使うと、少しお金が入る
const DAY_SEC = 360, ALLOWANCE = 300, SHOP_SIZE = 6;
const USE_COINS = { lie: 20, sit: 10, look: 5 };
const DAY_START_H = 7, DAY_END_H = 23;
let economyReady = false; // 絵を読み終わるまでは時計を進めない
function placedCount(type) { return game.items.filter(it => it.type === type).length; }
function available(type) { return (game.owned[type] || 0) - placedCount(type); }
// 持っている数を超える家具を外す（プリセットを呼び出すときなど）
function limitToOwned(items) {
    const used = {};
    return items.filter(it => (used[it.type] = (used[it.type] || 0) + 1) <= (game.owned[it.type] || 0));
}
// その日の品ぞろえ。まだ持っていない家具が出やすい
function makeStock() {
    const pool = Object.keys(FURNITURE).map(t => ({ t, w: game.owned[t] ? 1 : 3 })), items = [];
    while (items.length < SHOP_SIZE && pool.length) {
        let r = Math.random() * pool.reduce((s, p) => s + p.w, 0), i = 0;
        while (i < pool.length - 1 && (r -= pool[i].w) > 0) i++;
        items.push(pool.splice(i, 1)[0].t);
    }
    return { day: game.day, items, sold: [] };
}
const coinsEl = document.getElementById('coins'), clockEl = document.getElementById('clock');
function clockText() {
    const h = DAY_START_H + (DAY_END_H - DAY_START_H) * Math.min(1, game.clock / DAY_SEC), hh = Math.floor(h), mm = Math.floor((h - hh) * 6) * 10;
    return `${game.day}日目 ${hh}:${String(mm).padStart(2, '0')}`;
}
function updateStatus() {
    coinsEl.textContent = `🪙 ${game.coins.toLocaleString()}`;
    clockEl.textContent = clockText();
}
function earn(n) {
    game.coins += n;
    updateStatus();
    coinsEl.classList.remove('gain');
    void coinsEl.offsetWidth; // 続けて入ったときも、もう一度光らせる
    coinsEl.classList.add('gain');
    if (shopDialog.open) renderShop();
}
function newDay() {
    game.day++;
    game.coins += ALLOWANCE;
    game.shop = makeStock();
    updateStatus();
    if (shopDialog.open) renderShop();
    toast(`${game.day}日目の朝。おこづかい 🪙${ALLOWANCE}、お店の品物が入れかわりました`);
    saveGame();
}
// 時計を進める（sec 秒）
function advanceClock(sec) {
    game.clock += sec;
    while (game.clock >= DAY_SEC) { game.clock -= DAY_SEC; newDay(); }
    updateStatus();
}
setInterval(() => { if (economyReady && !document.hidden && !resetting) advanceClock(1); }, 1000);

// ---- お店 ----
const shopDialog = document.getElementById('shop-dialog');
function renderShop() {
    document.getElementById('shop-coins').textContent = `🪙 ${game.coins.toLocaleString()}`;
    document.getElementById('shop-day').textContent = `${game.day}日目の品ぞろえ`;
    const list = document.getElementById('shop-list');
    list.innerHTML = '';
    game.shop.items.forEach((type, i) => {
        const def = FURNITURE[type], sold = game.shop.sold.includes(i), have = game.owned[type] || 0;
        const card = document.createElement('div');
        card.className = 'shop-item' + (sold ? ' sold' : '');
        card.innerHTML = `<img src="img/${def.art}.webp?v=${APP_VERSION}" alt=""><span class="shop-name"></span><small class="shop-have"></small><button></button>`;
        card.querySelector('.shop-name').textContent = def.name;
        const tag = card.querySelector('.shop-have');
        tag.textContent = have ? `持っている ×${have}` : 'NEW';
        if (!have) tag.classList.add('new');
        const b = card.querySelector('button');
        b.textContent = sold ? '売り切れ' : `🪙 ${def.price.toLocaleString()}`;
        b.disabled = sold || game.coins < def.price;
        if (!sold) b.setAttribute('aria-label', `${def.name}を ${def.price} コインで買う`);
        b.addEventListener('click', () => buy(i));
        list.appendChild(card);
    });
}
function buy(i) {
    const type = game.shop.items[i], def = FURNITURE[type];
    if (!def || game.shop.sold.includes(i) || game.coins < def.price) return false;
    game.coins -= def.price;
    game.owned[type] = (game.owned[type] || 0) + 1;
    game.shop.sold.push(i);
    updateStatus();
    renderShop();
    renderCatalog();
    saveGame();
    toast(`${def.name}を買いました。下の一覧から置けます`);
    if (resident.visible && Math.random() < 0.7) residentSay(pickOne([`${def.name}、届くのたのしみ！`, 'わあ、新しい家具！', 'どこに置こうかな']));
    return true;
}
function openShop() {
    if (game.shop.day !== game.day) game.shop = makeStock();
    renderShop();
    shopDialog.showModal();
}
document.getElementById('shop-btn').addEventListener('click', openShop);
document.getElementById('shop-close').addEventListener('click', () => shopDialog.close());
shopDialog.addEventListener('click', (e) => { if (e.target === shopDialog) shopDialog.close(); });

// ---------- 設定 ----------
const menu = document.getElementById('menu');
const nameInput = document.getElementById('resident-name');
document.getElementById('menu-btn').addEventListener('click', () => {
    menu.querySelectorAll('input[name="appearance"]').forEach(r => { r.checked = r.value === game.appearance; });
    document.getElementById('resident-toggle').checked = game.resident.show;
    nameInput.value = game.resident.name;
    document.getElementById('fit-mode-toggle').checked = fitMode;
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
document.getElementById('fit-mode-toggle').addEventListener('change', (e) => {
    fitMode = e.target.checked;
    try { if (fitMode) localStorage.setItem(FIT_MODE_KEY, '1'); else localStorage.removeItem(FIT_MODE_KEY); } catch (err) { }
    updateFitBtn();
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
    [SAVE_KEY, SAVE_KEY + '_corrupted', FIT_KEY, FIT_MODE_KEY].forEach(k => { try { localStorage.removeItem(k); } catch (e) { } });
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
    const items = JSON.parse(JSON.stringify(game.items));
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
    const all = sanitizeItems(ps.items);
    game.items = limitToOwned(all);
    game.nextUid = Math.max(game.nextUid, game.items.reduce((m, it) => Math.max(m, it.uid), 0) + 1);
    select(null);
    saveGame();
    if (presetDialog.open) presetDialog.close();
    toast(all.length > game.items.length ? `「${ps.name}」を呼び出しました（持っていない家具は置きませんでした）` : `「${ps.name}」を呼び出しました`);
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
document.getElementById('version').textContent = `v${APP_VERSION}`;
resize();
const ready = loadAll().then(() => {
    // 壁掛けの高さの範囲は絵から決まるので、絵を読んでから直す
    for (const it of game.items) if (kindOf(it) === 'wall') clampItem(it);
    recordHistory(); // 起動したときの部屋を「元に戻す」の起点にする
    if (game.shop.day !== game.day) game.shop = makeStock();
    updateStatus();
    economyReady = true;
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
    // テストでは、持っていない家具も置けるように 1 つ足してから置く
    addItem(type) { if (available(type) <= 0) { game.owned[type] = (game.owned[type] || 0) + 1; renderCatalog(); } addItem(type); },
    grantAll(n = 5) { for (const t of Object.keys(FURNITURE)) game.owned[t] = Math.max(game.owned[t] || 0, n); renderCatalog(); saveGame(); },
    setStock(items) { game.shop = { day: game.day, items, sold: [] }; if (shopDialog.open) renderShop(); },
    advanceClock, buy, openShop, DAY_SEC, ALLOWANCE,
    select, rotateSelected, removeSelected, isBlocked, footprint, supportOf: (uid) => supportOf(findItem(uid))?.uid ?? null,
    undo, redo, savePreset, loadPreset, zoomAt, openTint, kindOf, openFit, metaOf, exportFit,
    fit: () => ({ base: fitBase, local: fitLocal, state: { art: fitState.art, kind: fitState.kind, sel: fitState.sel, pts: fitState.pts.map(p => [...p]) } }),
    artMatrix: (uid) => artMatrix(findItem(uid)).m,
    // 合わせ方の画面の点が、画面のどこに映るか（クライアント座標）
    fitPointScreen(i) { const [x, y] = fitToCanvas(fitState.pts[i]), r = fitCanvas.getBoundingClientRect(); return { x: r.left + fitCanvas.clientLeft + x, y: r.top + fitCanvas.clientTop + y }; },
    history: () => ({ undo: undoStack.length, redo: redoStack.length }), save: saveGame, render, renders: () => renderCount,
    drawOrder: () => drawList.map(o => o.resident ? 'resident' : o.item.uid),
    // 家具の絵の真ん中（h は絵の高さの割合。0 が上、1 が下）が画面のどこに映るか（クライアント座標）
    screenOf(uid, h = 0.6) {
        const r = artRect(findItem(uid)), [x, y] = toScreen(r.x + r.w / 2, r.y + r.h * h), c = canvas.getBoundingClientRect();
        return { x: c.left + x, y: c.top + y };
    },
    // 画面の点の色（確かめ用）
    pixelAt(clientX, clientY) {
        const c = canvas.getBoundingClientRect();
        return [...ctx.getImageData(Math.round((clientX - c.left) * view.dpr), Math.round((clientY - c.top) * view.dpr), 1, 1).data];
    },
    pickAt: (x, y) => pickItem(x, y)?.uid ?? null,
    // その家具が手前の物に隠れずに見えている点（クライアント座標）
    visiblePoint(uid) {
        const r = artRect(findItem(uid)), c = canvas.getBoundingClientRect();
        for (let v = 0.5; v < 0.98; v += 0.04) for (const u of [0.5, 0.4, 0.6, 0.3, 0.7, 0.2, 0.8]) {
            const [x, y] = toScreen(r.x + r.w * u, r.y + r.h * v);
            if (pickItem(c.left + x, c.top + y)?.uid === uid) return { x: c.left + x, y: c.top + y };
        }
        return null;
    },
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
