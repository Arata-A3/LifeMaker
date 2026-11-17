// LifeMaker の自動テスト。ヘッドレス Chrome を DevTools プロトコルで動かす。
// 使い方: node tests/run.mjs [スクリーンショットの出力フォルダ]
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { readFileSync, mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, extname, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SHOT_DIR = process.argv[2];
const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.webmanifest': 'application/manifest+json', '.json': 'application/json' };
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// ---------- 配信 ----------
const server = createServer((req, res) => {
    let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (p.endsWith('/')) p += 'index.html';
    try {
        const body = readFileSync(join(ROOT, p));
        res.writeHead(200, { 'Content-Type': TYPES[extname(p)] || 'application/octet-stream' });
        res.end(body);
    } catch { res.writeHead(404); res.end(); }
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const BASE = `http://127.0.0.1:${server.address().port}/`;

// ---------- Chrome ----------
const port = 9400 + Math.floor(Math.random() * 400);
const profile = mkdtempSync(join(tmpdir(), 'lifemaker-test-'));
const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, '--use-angle=swiftshader', '--enable-unsafe-swiftshader', 'about:blank'], { stdio: 'ignore' });
let targets;
for (let i = 0; i < 50; i++) {
    try { targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json(); if (targets.length) break; } catch { }
    await sleep(200);
}
const ws = new WebSocket(targets.find(t => t.type === 'page').webSocketDebuggerUrl);
await new Promise(r => ws.addEventListener('open', r));
let msgId = 0;
const waits = new Map();
const errors = [];
ws.addEventListener('message', (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && waits.has(m.id)) { waits.get(m.id)(m); waits.delete(m.id); }
    if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text);
    if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') errors.push(m.params.args.map(a => a.value ?? a.description).join(' '));
});
const send = (method, params = {}) => new Promise((r, j) => {
    const i = ++msgId;
    waits.set(i, (m) => m.error ? j(new Error(`${method}: ${m.error.message}`)) : r(m.result));
    ws.send(JSON.stringify({ id: i, method, params }));
});
await send('Page.enable');
await send('Runtime.enable');

async function evaluate(expr) {
    const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
    return r.result.value;
}
async function open(path = '', { width = 390, height = 844, mobile = true, resident = false, grant = true } = {}) {
    await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile });
    await send('Page.navigate', { url: BASE + path });
    for (let i = 0; i < 50; i++) {
        await sleep(100);
        try { if (await evaluate('!!window.__lifemaker')) break; } catch { }
    }
    await evaluate('window.__lifemaker.ready');
    await sleep(100);
    // 住人は歩き回ってほかのテストの指の操作に当たるので、ふだんは止めて隠す
    if (!resident) await evaluate('window.__lifemaker.resident.freeze(true)');
    // ふだんのテストは、どの家具も置けるように持たせておく（お店のテストでは持たせない）
    if (grant) await evaluate('window.__lifemaker.grantAll()');
}
async function clearSave() {
    await send('Page.navigate', { url: 'about:blank' }); // 閉じる直前の自動保存で書き戻されないよう、先に離れる
    await sleep(200);
    await send('Page.navigate', { url: BASE + 'tests/blank.html' });
    await sleep(200);
    await evaluate(`['lifemaker2d_save', 'lifemaker2d_save_corrupted', 'lifemaker2d_fit', 'lifemaker2d_fitmode'].forEach(k => localStorage.removeItem(k))`);
}
async function mouse(type, x, y, buttons = 1) {
    await send('Input.dispatchMouseEvent', { type, x, y, button: 'left', buttons, clickCount: type === 'mouseMoved' ? 0 : 1 });
}
async function dragMouse(from, to, steps = 8) {
    await mouse('mousePressed', from.x, from.y);
    for (let i = 1; i <= steps; i++) await mouse('mouseMoved', from.x + (to.x - from.x) * i / steps, from.y + (to.y - from.y) * i / steps);
    await mouse('mouseReleased', to.x, to.y, 0);
    await sleep(50);
}
async function shot(name) {
    if (!SHOT_DIR) return;
    await sleep(150);
    const { data } = await send('Page.captureScreenshot', { format: 'png' });
    mkdirSync(SHOT_DIR, { recursive: true });
    writeFileSync(join(SHOT_DIR, name + '.png'), Buffer.from(data, 'base64'));
}

// ---------- テスト ----------
const results = [];
async function test(name, fn) {
    try { await fn(); results.push([true, name]); }
    catch (e) { results.push([false, name, e.message]); }
}
function assert(cond, msg) { if (!cond) throw new Error(msg); }
const L = (expr) => evaluate(`(() => { const L = window.__lifemaker; return ${expr}; })()`);

await clearSave();
await open();
const item = (uid) => L(`({ ...L.game().items.find(i => i.uid === ${uid}) })`);
async function tapAt(p) { await mouse('mousePressed', p.x, p.y); await mouse('mouseReleased', p.x, p.y, 0); await sleep(30); }

await test('起動して版・一覧・最初の部屋が出る', async () => {
    const v = await L('L.APP_VERSION');
    assert(await evaluate(`document.getElementById('version').textContent`) === 'v' + v, '版の表示が違う');
    const html = readFileSync(join(ROOT, 'index.html'), 'utf8');
    const qs = [...html.matchAll(/\?v=([\d.]+)/g)].map(m => m[1]);
    assert(qs.length >= 2 && qs.every(q => q === v), `?v= が APP_VERSION とそろっていない: ${qs} / ${v}`);
    assert(await evaluate(`document.querySelectorAll('#items .item').length`) === await L('Object.keys(L.FURNITURE).length'), '家具の一覧の数が違う');
    assert(await L('L.game().items.length') === 7, '最初の家具が 7 つない');
    assert(await L('L.game().items.every(it => !L.isBlocked(it))'), '最初の家具が重なっている');
    for (let i = 0; i < 30 && await evaluate(`[...document.querySelectorAll('#items img')].some(i => !i.complete)`); i++) await sleep(100);
    const broken = await evaluate(`[...document.querySelectorAll('#items img')].filter(i => !i.complete || !i.naturalWidth).length`);
    assert(broken === 0, '一覧の絵が読めていない');
});
await shot('01_phone');

await test('家具を一覧から置ける（空いている場所に置かれ、選ばれる）', async () => {
    const n0 = await L('L.game().items.length');
    await evaluate(`document.querySelector('#items .item[data-type="plant"]').click()`);
    const r = await L(`(() => { const g = L.game(); const it = g.items[g.items.length - 1]; return { n: g.items.length, type: it.type, sel: L.selected() === it.uid, blocked: L.isBlocked(it), bar: !document.getElementById('toolbar').hidden }; })()`);
    assert(r.n === n0 + 1 && r.type === 'plant', '置かれていない');
    assert(r.sel && r.bar, '置いた家具が選ばれていない');
    assert(!r.blocked, 'ほかの家具と重なる場所に置かれた');
});

await test('家具をドラッグで動かせて、保存される', async () => {
    const uid = await L('L.selected()');
    // ほかの家具に隠れないよう、空いている所へ移しておく
    await L(`(() => { const it = L.game().items.find(i => i.uid === ${uid}); it.gx = 8; it.gz = 7; L.render(); })()`);
    const before = await item(uid);
    const p = await L(`L.visiblePoint(${uid})`);
    assert(p, '家具の見えている所がない');
    await dragMouse(p, { x: p.x + 40, y: p.y + 25 });
    const after = await item(uid);
    assert(after.gx !== before.gx || after.gz !== before.gz, '位置が変わらない');
    const saved = await evaluate(`JSON.parse(localStorage.getItem('lifemaker2d_save')).items.find(i => i.uid === ${uid})`);
    assert(saved && saved.gx === after.gx && saved.gz === after.gz, '動かした位置が保存されていない');
});

await test('絵の透明な所を押しても家具は選ばれない', async () => {
    await L('L.select(null)');
    const p = await L(`L.screenOf(2, 0.6)`);
    // ベッド（uid 2）の絵の四角の左上の角あたりは透明
    const corner = await L(`(() => { const s = L.screenOf(2, 0.05); return { x: s.x - 45, y: s.y }; })()`);
    assert(await L(`L.pickAt(${p.x}, ${p.y})`) === 2, 'ベッドの真ん中で選べない');
    assert(await L(`L.pickAt(${corner.x}, ${corner.y})`) !== 2, '透明な所でベッドが選ばれた');
});

await test('向きを変えると左右が入れ替わり、部屋からはみ出さない', async () => {
    await L('L.select(4)');
    const before = await item(4);
    await evaluate(`document.getElementById('rotate-btn').click()`);
    const after = await item(4);
    const fp = await L(`L.footprint(L.game().items.find(i => i.uid === 4))`);
    assert(after.rot !== before.rot, '向きが変わらない');
    assert(after.gx >= 0 && after.gz >= 0 && after.gx + fp[0] <= 10 && after.gz + fp[1] <= 10, `はみ出した: ${JSON.stringify(after)}`);
    await evaluate(`document.getElementById('rotate-btn').click()`);
});

await test('家具をダブルタップすると向きが変わる（1 回だけなら変わらない）', async () => {
    await L('L.select(null)');
    const p = await L(`L.screenOf(2, 0.4)`);
    const r0 = (await item(2)).rot;
    await tapAt(p);
    assert((await item(2)).rot === r0, '1 回のタップで変わった');
    await sleep(500);
    await tapAt(p); await tapAt(p);
    assert((await item(2)).rot !== r0, 'ダブルタップで変わらない');
    await L('L.undo()');
});

await test('何もない所をドラッグで部屋が動き、タップで選択が外れる', async () => {
    await L('L.select(2)');
    const before = await L('({ ...L.view })');
    await dragMouse({ x: 30, y: 140 }, { x: 90, y: 170 });
    const after = await L('({ ...L.view })');
    assert(after.cx !== before.cx || after.cy !== before.cy, '部屋が動かない');
    await tapAt({ x: 30, y: 140 });
    assert(await L('L.selected()') === null, '選択が外れない');
});

await test('拡大縮小には限度がある', async () => {
    const fit = await L('L.view.fit');
    await L(`L.zoomAt(200, 300, L.view.fit * 100)`);
    assert(Math.abs(await L('L.view.scale') - fit * 4) < 1e-6, '拡大の上限がない');
    await L(`L.zoomAt(200, 300, 0.0001)`);
    assert(Math.abs(await L('L.view.scale') - fit * 0.8) < 1e-6, '縮小の下限がない');
    await L(`L.zoomAt(200, 300, L.view.fit)`);
});

await test('奥の家具から順に描く', async () => {
    await L('L.render()');
    const order = await L('L.drawOrder()');
    // 植物（右奥、uid 3）はローテーブル（手前、uid 5）より先
    assert(order.indexOf(3) < order.indexOf(5), `順番が違う: ${order}`);
});

await test('重なりの判定（ラグの上は重なりにしない）', async () => {
    await L('(() => { const it = L.game().items.find(i => i.uid === 5); it.gx = 6; it.gz = 1; })()');
    assert(await L('L.isBlocked(L.game().items.find(i => i.uid === 5))'), 'ベッドと重なっているのに判定されない');
    await L('(() => { const it = L.game().items.find(i => i.uid === 5); it.gx = 4; it.gz = 5; })()');
    assert(!(await L('L.isBlocked(L.game().items.find(i => i.uid === 5))')), 'ラグの上なのに重なり判定された');
});

await test('元に戻す・やり直す', async () => {
    const n = await L('L.game().items.length');
    await evaluate(`document.querySelector('#items .item[data-type="sofa"]').click()`);
    assert(await L('L.game().items.length') === n + 1, '置けない');
    await evaluate(`document.getElementById('undo-btn').click()`);
    assert(await L('L.game().items.length') === n, '元に戻らない');
    await evaluate(`document.getElementById('redo-btn').click()`);
    assert(await L('L.game().items.length') === n + 1, 'やり直せない');
    await L('L.select(L.game().items[L.game().items.length - 1].uid)');
    await evaluate(`document.getElementById('remove-btn').click()`);
});

await test('部屋をプリセットに保存して呼び出せる', async () => {
    await L(`L.savePreset('テスト')`);
    const id = await L('L.game().presets[0].id');
    const n = await L('L.game().items.length');
    await L('L.select(2)'); await L('L.removeSelected()');
    assert(await L('L.game().items.length') === n - 1, 'しまえない');
    await L(`L.loadPreset(${id})`);
    assert(await L('L.game().items.length') === n, '呼び出しで戻らない');
});

await test('小物は家具の上に載り、家具といっしょに動く・回る', async () => {
    await evaluate(`document.querySelector('#items .item[data-type="tvstand"]').click()`);
    const stand = await L('L.selected()');
    await evaluate(`document.querySelector('#items .item[data-type="tv"]').click()`);
    const tv = await L('L.selected()');
    assert(await L(`L.supportOf(${tv})`) === stand, 'テレビがテレビ台の上に置かれない');
    assert(!(await L(`L.isBlocked(L.game().items.find(i => i.uid === ${tv}))`)), '台の上なのに重なり判定された');
    // テレビ台をドラッグすると、テレビもついてくる
    await L(`L.select(null)`);
    const before = await item(tv), standBefore = await item(stand);
    const p = await L(`L.visiblePoint(${stand})`);
    assert(p, 'テレビ台の見えている所がない');
    await dragMouse(p, { x: p.x - 40, y: p.y + 25 });
    const standAfter = await item(stand);
    assert(standAfter.gx !== standBefore.gx || standAfter.gz !== standBefore.gz, `テレビ台が動かない: ${JSON.stringify(standAfter)}`);
    const after = await item(tv);
    assert(after.gx !== before.gx || after.gz !== before.gz, 'テレビがついてこない');
    assert(await L(`L.supportOf(${tv})`) === stand, '動かしたあと台から落ちた');
    // 向きを変えても、台の上に載ったまま
    await L(`L.select(${stand})`);
    await L('L.rotateSelected()');
    assert(await L(`L.supportOf(${tv})`) === stand, '向きを変えたら台から落ちた');
    assert((await item(tv)).rot === (await item(stand)).rot, 'テレビの向きが台とそろっていない');
    const order = await L('(L.render(), L.drawOrder())');
    assert(order.indexOf(tv) === order.indexOf(stand) + 1, `台のすぐ後に描かれていない: ${order}`);
    await shot('small_items');
    await L(`L.select(${tv})`); await L('L.removeSelected()');
    await L(`L.select(${stand})`); await L('L.removeSelected()');
});

await test('壁掛けは壁に沿って動き、反対の壁に掛け替えられる', async () => {
    await L('L.select(null)');
    const before = await item(7); // 左奥の壁の絵
    assert(before.rot === 1, '絵が左奥の壁にない');
    const p = await L(`L.screenOf(7, 0.5)`);
    assert(await L(`L.pickAt(${p.x}, ${p.y})`) === 7, '絵を押しても選べない');
    await dragMouse(p, { x: p.x - 30, y: p.y + 30 });
    const moved = await item(7);
    assert(moved.rot === 1 && (moved.gx !== before.gx || moved.y !== before.y), `壁に沿って動かない: ${JSON.stringify(moved)}`);
    // 画面の右側まで動かすと、右奥の壁に掛け替わる
    const q = await L(`L.screenOf(7, 0.5)`);
    const center = await L(`(() => { const c = document.getElementById('scene').getBoundingClientRect(); return c.left + c.width / 2; })()`);
    await dragMouse(q, { x: center + 60, y: q.y - 20 }, 12);
    const swapped = await item(7);
    assert(swapped.rot === 0, `右奥の壁に掛け替わらない: ${JSON.stringify(swapped)}`);
    assert(swapped.gx >= 0 && swapped.gx <= 8 && swapped.y >= 0.15 && swapped.y < 2.5, `壁からはみ出した: ${JSON.stringify(swapped)}`);
    await L('L.select(7)');
    await evaluate(`document.getElementById('rotate-btn').click()`);
    assert((await item(7)).rot === 1, '「反対の壁」で戻らない');
});

await test('家具の色合いを変えて保存し、元の色に戻せる', async () => {
    await L('L.select(null)');
    await L('L.render()');
    const at = await L(`L.screenOf(4, 0.55)`); // ソファ
    const cyBefore = await L('L.view.cy');
    const px0 = await L(`L.pixelAt(${at.x}, ${at.y})`);
    await L('L.select(4)');
    await evaluate(`document.getElementById('color-btn').click()`);
    assert(await evaluate(`document.getElementById('tint-dialog').open`), '色合いの画面が開かない');
    assert(await evaluate(`document.querySelectorAll('#tint-presets button').length`) >= 8, '見本が出ていない');
    // ソファが色合いの画面に隠れていない
    const shown = await L(`(() => { const p = L.screenOf(4, 0.5); return p.y < document.getElementById('tint-dialog').getBoundingClientRect().top; })()`);
    assert(shown, 'ソファが色合いの画面に隠れている');
    await evaluate(`(() => { const i = document.getElementById('tint-h'); i.value = 150; i.dispatchEvent(new Event('input')); i.dispatchEvent(new Event('change')); })()`);
    await sleep(100);
    await L('L.render()');
    const px1 = await L(`L.pixelAt(${at.x}, ${at.y})`);
    assert(Math.abs(px1[0] - px0[0]) + Math.abs(px1[1] - px0[1]) + Math.abs(px1[2] - px0[2]) > 30, `色が変わらない: ${px0} → ${px1}`);
    const saved = await evaluate(`JSON.parse(localStorage.getItem('lifemaker2d_save')).items.find(i => i.uid === 4).tint`);
    assert(saved && saved.all && saved.all.h === 150, `保存されていない: ${JSON.stringify(saved)}`);
    await shot('tint');
    // 見本のボタンで選ぶ
    await evaluate(`[...document.querySelectorAll('#tint-presets button')].find(b => b.textContent === 'モノクロ').click()`);
    assert((await item(4)).tint?.all?.s === 0, 'モノクロにならない');
    await evaluate(`document.getElementById('tint-reset').click()`);
    assert(!(await item(4)).tint, '元の色に戻らない');
    await evaluate(`document.getElementById('tint-close').click()`);
    await sleep(50); // close の知らせは少し遅れて届く
    assert(await L('L.view.cy') === cyBefore, `閉じても部屋の位置が戻らない: ${cyBefore} → ${await L('L.view.cy')}`);
    await L('L.undo()');
    assert((await item(4)).tint?.all?.s === 0, '元に戻すで色合いが戻らない');
    await L('L.redo()');
});

await test('色合いは部分ごとにも変えられる', async () => {
    await L('L.select(2)'); // ベッド
    await L('L.openTint(2)');
    const parts = await evaluate(`[...document.querySelectorAll('#tint-parts .tint-part')].map(b => b.textContent)`);
    assert(parts.length >= 3 && parts[0] === 'ぜんぶ', `部分のボタン: ${parts}`);
    await evaluate(`document.querySelectorAll('#tint-parts .tint-part')[1].click()`);
    await evaluate(`(() => { const i = document.getElementById('tint-h'); i.value = 90; i.dispatchEvent(new Event('input')); i.dispatchEvent(new Event('change')); })()`);
    let t = (await item(2)).tint;
    assert(t && t['1']?.h === 90 && !t.all && !t['2'], `1 番の部分だけ変わっていない: ${JSON.stringify(t)}`);
    // 「ぜんぶ」で変えると、部分ごとの色合いは消えてそろう
    await evaluate(`document.querySelectorAll('#tint-parts .tint-part')[0].click()`);
    await evaluate(`(() => { const i = document.getElementById('tint-l'); i.value = 80; i.dispatchEvent(new Event('input')); i.dispatchEvent(new Event('change')); })()`);
    t = (await item(2)).tint;
    assert(t && t.all?.l === 80 && !t['1'], `全部がそろっていない: ${JSON.stringify(t)}`);
    await evaluate(`document.getElementById('tint-reset').click()`);
    assert(!(await item(2)).tint, '元の色に戻らない');
    await evaluate(`document.getElementById('tint-close').click()`);
    await sleep(50);
});

await test('合わせ方のボタンは、設定で出したときだけ出る', async () => {
    await L('L.select(4)');
    assert(await evaluate(`document.getElementById('fit-btn').hidden`), 'ふだんから出ている');
    await evaluate(`document.getElementById('menu-btn').click()`);
    await evaluate(`document.getElementById('fit-mode-toggle').click()`);
    await evaluate(`document.getElementById('menu-close').click()`);
    assert(!(await evaluate(`document.getElementById('fit-btn').hidden`)), '設定で出しても出ない');
    assert(await evaluate(`localStorage.getItem('lifemaker2d_fitmode')`) === '1', '設定が残らない');
    // ボタンが増えても、下のバーが画面からはみ出さない
    const tb = await evaluate(`(() => { const r = document.getElementById('toolbar').getBoundingClientRect(), b = document.getElementById('done-btn').getBoundingClientRect(); return { l: r.left, r: r.right, done: b.right, w: innerWidth }; })()`);
    assert(tb.l >= 0 && tb.r <= tb.w && tb.done <= tb.r, '下のバーがはみ出す: ' + JSON.stringify(tb));
    await shot('fit_toolbar');
});

await test('床の家具の合わせ方を直すと部屋の絵が動き、開いたときに戻せる', async () => {
    await L('L.select(4)'); // ソファ
    const m0 = await L('L.artMatrix(4)');
    await evaluate(`document.getElementById('fit-btn').click()`);
    assert(await evaluate(`document.getElementById('fit-dialog').open`), '画面が開かない');
    const st = await L('L.fit().state');
    assert(st.kind === 'corners' && st.pts.length === 3, '床の 3 つの点が出ない: ' + JSON.stringify(st));
    assert(!(await evaluate(`document.getElementById('fit-num-row').hidden`)), '脚の広がりが出ない');
    await shot('fit');
    // 右の点を右へ動かすと、絵の倍率が変わる
    await evaluate(`document.querySelectorAll('#fit-points button')[2].click()`);
    for (let i = 0; i < 5; i++) await evaluate(`document.querySelector('#fit-dialog [data-nudge="1,0"]').click()`);
    const m1 = await L('L.artMatrix(4)');
    assert(Math.abs(m1[0] - m0[0]) > 1e-4, '倍率が変わらない');
    const saved = await evaluate(`JSON.parse(localStorage.getItem('lifemaker2d_fit') || '{}').sofa`);
    assert(saved?.corners?.[2]?.[0] === st.pts[2][0] + 10, 'この端末に残らない: ' + JSON.stringify(saved));
    // 点をドラッグで動かす（指を置いた所に飛ばず、動かした分だけ動く）
    const before = (await L('L.fit().state')).pts[1];
    const p = await L('L.fitPointScreen(1)');
    await dragMouse({ x: p.x + 3, y: p.y + 3 }, { x: p.x + 3, y: p.y + 23 });
    const after = (await L('L.fit().state')).pts[1];
    assert(Math.abs(after[0] - before[0]) < 0.5 && after[1] > before[1] + 5, 'ドラッグで動かない: ' + JSON.stringify([before, after]));
    assert((await L('L.fit().state')).sel === 1, 'ドラッグした点が選ばれない');
    // 拡大すると、選んだ点が真ん中に来る
    await evaluate(`document.getElementById('fit-zoom').click()`);
    const c = await evaluate(`(() => { const r = document.getElementById('fit-canvas').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
    const pz = await L('L.fitPointScreen(1)');
    assert(Math.abs(pz.x - c.x) < 1 && Math.abs(pz.y - c.y) < 1, '拡大しても真ん中に来ない');
    await evaluate(`document.getElementById('fit-revert').click()`);
    const m2 = await L('L.artMatrix(4)');
    assert(m2.every((v, i) => Math.abs(v - m0[i]) < 1e-6), '開いたときに戻らない');
    assert(!(await evaluate(`localStorage.getItem('lifemaker2d_fit')`)), '戻しても値が残る');
    await evaluate(`document.getElementById('fit-close').click()`);
});

await test('壁掛けの合わせ方は 4 つの角で直せ、直した値を消すと元に戻る', async () => {
    await L('L.select(6)'); // 窓
    const m0 = await L('L.artMatrix(6)');
    await evaluate(`document.getElementById('fit-btn').click()`);
    const st = await L('L.fit().state');
    assert(st.kind === 'face' && st.pts.length === 4, '4 つの角が出ない');
    await evaluate(`document.querySelector('#fit-dialog [data-nudge="0,-1"]').click()`);
    assert(JSON.stringify(await L('L.artMatrix(6)')) !== JSON.stringify(m0), '絵が動かない');
    assert(!(await evaluate(`document.getElementById('fit-clear').disabled`)), '消すボタンが押せない');
    // 書き出すと、全部の家具の値が入った JSON になる
    const text = await L('L.exportFit()');
    const all = JSON.parse(text);
    assert(Math.abs(all.window.face[0][1] - (st.pts[0][1] - 2)) < 0.01 && all.window.face.length === 4, '書き出した中身がおかしい: ' + text);
    await evaluate(`document.getElementById('fit-clear').click()`);
    assert(JSON.stringify(await L('L.artMatrix(6)')) === JSON.stringify(m0), '消しても戻らない');
    await evaluate(`document.getElementById('fit-close').click()`);
});

await test('丸い物は底の点と高さで直せ、開き直しても残る', async () => {
    const uid = await L(`(() => { L.addItem('plant2'); return L.selected(); })()`);
    const m0 = await L(`L.artMatrix(${uid})`);
    await evaluate(`document.getElementById('fit-btn').click()`);
    assert((await L('L.fit().state')).kind === 'base', '底の点にならない');
    await evaluate(`(() => { const i = document.getElementById('fit-num'); i.value = 1.5; i.dispatchEvent(new Event('input')); })()`);
    const m1 = await L(`L.artMatrix(${uid})`);
    assert(m1[0] > m0[0] * 1.5, '高さで大きくならない');
    await evaluate(`document.getElementById('fit-close').click()`);
    await L('L.save()');
    await open();
    const m2 = await L(`L.artMatrix(${uid})`);
    assert(Math.abs(m2[0] - m1[0]) < 1e-6, '開き直すと戻ってしまう');
    await evaluate(`localStorage.removeItem('lifemaker2d_fit')`);
    await open();
    await L(`L.select(${uid}) || L.removeSelected()`);
});

await test('はじめは持っている家具だけが一覧に出て、置ききると置けない', async () => {
    await clearSave();
    await open('', { grant: false });
    assert(await L('L.game().coins') === 600, 'はじめのお金が違う');
    const types = await evaluate(`[...document.querySelectorAll('#items .item')].map(b => b.dataset.type).sort().join()`);
    assert(types === 'bed,lowtable,picture,plant,rug,sofa,window', '一覧が持っている家具になっていない: ' + types);
    assert(await evaluate(`document.querySelector('#items .item[data-type="plant"] .item-count').textContent`) === '置いた', '置いた印が出ない');
    const n = await L('L.game().items.length');
    await evaluate(`document.querySelector('#items .item[data-type="plant"]').click()`);
    assert(await L('L.game().items.length') === n, '持っている数より多く置けてしまう');
    await L('L.select(3)');
    await L('L.removeSelected()');
    assert(await evaluate(`document.querySelector('#items .item[data-type="plant"] .item-count').textContent`) === 'あと 1', 'しまっても数が戻らない');
});

await test('お店で買うとお金が減り、一覧に出て置ける。お金が足りないと買えない', async () => {
    await L(`L.setStock(['chair', 'bed', 'tv', 'sofa', 'vase', 'desk'])`);
    await evaluate(`document.getElementById('shop-btn').click()`);
    assert(await evaluate(`document.getElementById('shop-dialog').open`), 'お店が開かない');
    assert(await evaluate(`document.querySelectorAll('#shop-list .shop-item').length`) === 6, '品物の数が違う');
    await shot('shop');
    await evaluate(`document.querySelectorAll('#shop-list button')[0].click()`); // いす 300
    assert(await L('L.game().coins') === 300 && await L('L.game().owned.chair') === 1, '買えていない');
    assert(await evaluate(`document.querySelectorAll('#shop-list button')[0].disabled`), '売り切れにならない');
    assert(await evaluate(`document.querySelectorAll('#shop-list button')[3].disabled`), 'お金が足りないのに買える'); // ソファ 1500
    assert(!(await L('L.buy(3)')), 'お金が足りないのに買えた');
    await evaluate(`document.getElementById('shop-close').click()`);
    await evaluate(`document.querySelector('#items .item[data-type="chair"]').click()`);
    assert((await L('L.game().items')).some(i => i.type === 'chair'), '買ったいすを置けない');
    await open('', { grant: false });
    assert(await L('L.game().coins') === 300 && await L('L.game().shop.sold.length') === 1, '開き直すとお金・売り切れが戻る');
});

await test('お金が足りない品物は取り置きでき、次の日もお店に残る', async () => {
    await L(`L.setStock(['wardrobe', 'bed', 'tv', 'sofa', 'vase', 'desk'])`);
    await L('L.openShop()');
    const keep = `document.querySelector('#shop-list .shop-item .shop-keep')`;
    assert(await evaluate(`!!${keep}`), '取り置きのボタンが出ない');
    await evaluate(`${keep}.click()`);
    assert(JSON.stringify(await L('L.game().reserved')) === '["wardrobe"]', '取り置きされない');
    await L('L.toggleReserve("sofa")');
    await L('L.toggleReserve("tv")'); // 3 つ目は取り置きできない
    assert((await L('L.game().reserved')).length === 2, '取り置きが 2 つを超えた');
    await evaluate(`document.getElementById('shop-close').click()`);
    await L('L.advanceClock(L.DAY_SEC)');
    const items = await L('L.game().shop.items');
    assert(items.includes('wardrobe') && items.includes('sofa'), '次の日に取り置きが残らない: ' + items);
    await L('L.game().coins = 5000');
    assert(await L(`L.buy(L.game().shop.items.indexOf('wardrobe'))`), '取り置きを買えない');
    assert(JSON.stringify(await L('L.game().reserved')) === '["sofa"]', '買っても取り置きが外れない');
    await L('L.toggleReserve("sofa")');
});

await test('ゲームの時計が 1 日進むと、おこづかいが入り、品物が入れかわる', async () => {
    const before = await L('({ day: L.game().day, coins: L.game().coins })');
    await L('L.advanceClock(L.DAY_SEC / 2)');
    assert(await L('L.game().day') === before.day, '半日で次の日になった');
    assert(/12:00|13:00|14:00|15:00/.test(await evaluate(`document.getElementById('clock').textContent`)), '時計の表示がおかしい');
    await L('L.advanceClock(L.DAY_SEC / 2)');
    const g = await L('({ day: L.game().day, coins: L.game().coins, shop: L.game().shop })');
    assert(g.day === before.day + 1 && g.coins === before.coins + 300, 'おこづかいが入らない: ' + JSON.stringify(g));
    assert(g.shop.day === g.day && g.shop.sold.length === 0 && g.shop.items.length === 6, '品物が入れかわらない');
});

await test('住人が家具を使うとお金が入る', async () => {
    await L('L.resident.freeze(false, false)');
    await L('L.resident.place(5, 7)');
    const c0 = await L('L.game().coins');
    assert(await L('L.resident.go(4)'), 'ソファに向かわない');
    await L('L.resident.step(12)');
    assert(await L('L.game().coins') > c0, 'お金が入らない');
    await L('L.resident.freeze(true)');
});

await test('前の版のセーブは、置いていた家具を持っていることになる', async () => {
    await clearSave();
    await evaluate(`localStorage.setItem('lifemaker2d_save', JSON.stringify({ saveVersion: 3, items: [{ uid: 1, type: 'chair', gx: 0, gz: 0, rot: 0 }, { uid: 2, type: 'chair', gx: 2, gz: 0, rot: 0 }],
        presets: [{ id: 1, name: 'a', items: [{ uid: 1, type: 'tv', gx: 0, gz: 0, rot: 0 }] }] }))`);
    await open('', { grant: false });
    const g = await L('({ owned: L.game().owned, coins: L.game().coins })');
    assert(g.owned.chair === 2 && g.owned.tv === 1 && g.coins === 600, JSON.stringify(g));
    await clearSave();
    await open();
});

await test('しまうと消える', async () => {
    await L('L.select(3)');
    await evaluate(`document.getElementById('remove-btn').click()`);
    assert(!(await L('L.game().items.some(i => i.uid === 3)')), '消えない');
    assert(await L('L.selected()') === null, '選択が残っている');
});

await test('開き直しても部屋が残る', async () => {
    const items = await L('JSON.stringify(L.game().items)');
    await open();
    assert(await L('JSON.stringify(L.game().items)') === items, '部屋が戻らない');
});

await test('壊れたセーブでも起動する', async () => {
    await clearSave();
    await evaluate(`localStorage.setItem('lifemaker2d_save', '{broken')`);
    await open();
    assert(await L('L.game().items.length') === 7, '初期の部屋で起動しない');
    assert(await evaluate(`localStorage.getItem('lifemaker2d_save_corrupted') === '{broken'`), '壊れたデータが退避されていない');
});

await test('おかしな値のセーブを直して読む', async () => {
    await clearSave();
    await evaluate(`localStorage.setItem('lifemaker2d_save', JSON.stringify({ items: [
        { uid: 1, type: 'sofa', gx: 99, gz: -5, rot: 7 }, { uid: 1, type: 'bed', gx: 0, gz: 0 }, { uid: 2, type: 'nothing' }, { uid: 3, type: 'bed', gx: 'a', gz: null }
    ], resident: { show: false, name: '  なまえがとてもながいなまえです  ' }, presets: 'x' }))`);
    await open();
    const g = await L('L.game()');
    // v0.8 までのセーブには窓と絵がないので、元の場所に掛けて読む
    assert(g.items.length === 4 && g.items.some(i => i.type === 'window') && g.items.some(i => i.type === 'picture'), `数が違う: ${g.items.map(i => i.type)}`);
    const sofa = g.items.find(i => i.type === 'sofa');
    assert(sofa.rot === 1 && sofa.gx === 8 && sofa.gz === 0, `はみ出しが直っていない: ${JSON.stringify(sofa)}`);
    assert(g.resident.show === false && g.resident.name === 'なまえがとてもながいなま', `住人の設定: ${JSON.stringify(g.resident)}`);
    assert(Array.isArray(g.presets) && g.presets.length === 0, 'プリセットが直っていない');
});

// ---------- 住人 ----------
await clearSave();
await open('', { resident: true });
const R = (expr) => L(`(() => { const R = L.resident; return ${expr}; })()`);

await test('住人がいて、家具を避けて歩く', async () => {
    await R('R.freeze(true, false)');
    const st = await R('R.state()');
    assert(st.visible, '住人が見えていない');
    assert(await R(`R.free(${st.x}, ${st.z})`), '家具の上に立っている');
    await R('R.place(1, 1)');
    let bad = 0, moved = 0;
    for (let n = 0; n < 6; n++) {
        await R('R.state().mode === "idle" && R.go(null)'); // 立ち止まっていたら、次の行き先を決めさせる
        const before = await R('R.state()');
        let ax = before.x, az = before.z;
        for (const p of before.path) { if (!(await R(`R.line(${ax}, ${az}, ${p.x}, ${p.z})`))) bad++; ax = p.x; az = p.z; }
        for (let k = 0; k < 20; k++) {
            await R('R.step(0.3)');
            const s = await R('R.state()');
            if (s.mode !== 'use' && !(await R(`R.free(${s.x}, ${s.z})`))) bad++;
            moved = Math.max(moved, Math.hypot(s.x - 1, s.z - 1));
        }
    }
    assert(bad === 0, `家具を通った回数: ${bad}`);
    assert(moved > 1, '歩いていない');
});

await test('歩く向きで絵が変わる（手前は前向き、奥は後ろ姿）', async () => {
    // 少しずつ歩かせて、出た絵を集める
    const look = (dx, dz) => R(`(() => { R.place(8, 7); R.walkTo(${8 + dx}, ${7 + dz}); const out = []; for (let i = 0; i < 12; i++) { R.step(0.05); if (R.state().mode === 'walk') out.push(R.state().frame); } return out; })()`);
    const front = await look(0, 1.2);   // 左下へ
    const right = await look(1.2, 0);   // 右下へ
    const back = await look(0, -1.2);   // 右上へ
    const backL = await look(-1.2, 0);  // 左上へ
    const ns = (fs) => [...new Set(fs.map(f => f.n))].sort().join(',');
    assert(ns(front) === '1,2,3' && front.every(f => !f.flip), `左下へ歩く絵（右足・立ち・左足が出る）: ${JSON.stringify(front)}`);
    assert(ns(right) === '1,2,3' && right.every(f => f.flip), `右下へ歩く絵: ${JSON.stringify(right)}`);
    assert(ns(back) === '4' && back.every(f => !f.flip), `右上へ歩く絵: ${JSON.stringify(back)}`);
    assert(ns(backL) === '4' && backL.every(f => f.flip), `左上へ歩く絵: ${JSON.stringify(backL)}`);
});

await test('住人はソファに座り、ソファを動かすと立つ', async () => {
    await R('R.place(5, 8.5)');
    assert(await R('R.go(4)'), 'ソファへ向かわない');
    let s;
    for (let k = 0; k < 60; k++) { await R('R.step(0.5)'); s = await R('R.state()'); if (s.mode === 'use' && s.k >= 1) break; }
    assert(s.mode === 'use' && s.act === 'sit' && s.k >= 1, `座っていない: ${JSON.stringify(s)}`);
    assert(s.frame.n === 5, `座った絵になっていない: ${JSON.stringify(s.frame)}`);
    const order = await L('L.drawOrder()');
    assert(order.indexOf('resident') === order.indexOf(4) + 1, `ソファのすぐ後に描かれていない: ${order}`);
    await shot('resident_sit');
    await L('(() => { const it = L.game().items.find(i => i.uid === 4); it.gz = 1; it.gx = 2; })()');
    await R('R.step(0.6)');
    s = await R('R.state()');
    assert(s.mode !== 'use', 'ソファが動いたのに座ったまま');
    assert(await R(`R.free(${s.x}, ${s.z})`), '立ったあと家具に埋まっている');
});

await test('住人はベッドで寝て、吹き出しに Zzz が出る', async () => {
    await R('R.place(5, 8.5)');
    assert(await R('R.go(2)'), 'ベッドへ向かわない');
    let s;
    for (let k = 0; k < 60; k++) { await R('R.step(0.5)'); s = await R('R.state()'); if (s.mode === 'use' && s.k >= 1) break; }
    assert(s.act === 'lie' && s.k >= 1 && s.frame.n === 6, `寝ていない: ${JSON.stringify(s)}`);
    await R('R.step(3)');
    assert((await R('R.state()')).bubble === 'Zzz', 'Zzz が出ていない');
    await shot('resident_sleep');
});

await test('住人を押すと笑って話す（家具は選ばれない）', async () => {
    await L('L.select(null)');
    await R('R.place(6, 8.5)');
    const p = await R('R.screen()');
    await tapAt(p);
    await R('R.step(0.05)');
    const s = await R('R.state()');
    assert(s.bubble && s.bubble !== 'Zzz', `吹き出しが出ない: ${s.bubble}`);
    assert(s.frame.n === 7, `笑った絵になっていない: ${JSON.stringify(s.frame)}`);
    assert(await L('L.selected()') === null, '家具が選ばれた');
    await shot('resident_talk');
});

await test('置いた家具を住人が見に行く', async () => {
    // 前のテストで動かしたソファを元の場所に戻す
    await L('(() => { const it = L.game().items.find(i => i.uid === 4); it.gx = 0; it.gz = 5; })()');
    await R('R.freeze(false, false)');
    await R('R.place(6, 8.5)');
    await evaluate(`document.querySelector('#items .item[data-type="plant"]').click()`);
    await sleep(900);
    const uid = await L('L.selected()');
    const s = await R('R.state()');
    assert(s.uid === uid, `植物へ向かわない: ${JSON.stringify(s)}`);
    await evaluate(`document.getElementById('done-btn').click()`);
    await R('R.freeze(true, false)');
});

await test('設定で名前を付けられ、住人を隠せて、保存される', async () => {
    await evaluate(`document.getElementById('menu-btn').click()`);
    assert(await evaluate(`document.getElementById('resident-toggle').checked`), '最初から外れている');
    await evaluate(`(() => { const i = document.getElementById('resident-name'); i.value = ' くろ '; i.dispatchEvent(new Event('change')); })()`);
    await evaluate(`(() => { const c = document.getElementById('resident-toggle'); c.checked = false; c.dispatchEvent(new Event('change')); })()`);
    assert(!(await R('R.state()')).visible, '隠れない');
    const saved = await evaluate(`JSON.parse(localStorage.getItem('lifemaker2d_save')).resident`);
    assert(saved.show === false && saved.name === 'くろ', `保存されていない: ${JSON.stringify(saved)}`);
    await evaluate(`document.getElementById('menu-close').click()`);
    await open('', { resident: true });
    assert(!(await R('R.state()')).visible, '開き直すと出てくる');
    await evaluate(`document.getElementById('menu-btn').click()`);
    await evaluate(`(() => { const c = document.getElementById('resident-toggle'); c.checked = true; c.dispatchEvent(new Event('change')); })()`);
    await evaluate(`document.getElementById('menu-close').click()`);
    assert((await R('R.state()')).visible, '戻らない');
});

await test('住人が止まっている間は描き直さない（電池のため）', async () => {
    await R('R.freeze(true, false)');
    await R('R.place(5, 8.5)');
    await sleep(300);
    const n0 = await L('L.renders()');
    await sleep(1000);
    const n1 = await L('L.renders()');
    assert(n1 - n0 <= 2, `止まっているのに描き直している: ${n1 - n0} 回`);
    await R('R.freeze(false, false)');
});

await test('住人がひとりで動き続けても止まらない', async () => {
    await sleep(3000); // 実際の時間で動かす（エラーは最後のテストで確かめる）
    assert((await R('R.state()')).visible, '見えていない');
});

if (SHOT_DIR) {
    await open('', { width: 1366, height: 768, mobile: false, resident: true });
    await shot('pc');
    // 全部の家具を並べて、大きさがそろっているか見る
    await L(`(() => { const g = L.game(); g.items = []; let uid = 1, x = 0, z = 0, row = 0;
        for (const type of Object.keys(L.FURNITURE)) {
            if (type === 'rug' || L.kindOf({ type }) !== 'floor') continue;
            const [w, d] = L.FURNITURE[type].size;
            if (x + w > 10) { x = 0; z += row; row = 0; }
            g.items.push({ uid: uid++, type, gx: x, gz: z, rot: 0 }); x += w; row = Math.max(row, d);
        }
        L.save(); L.render(); })()`);
    await R('R.freeze(true, true)');
    await shot('all_items');
    // 壁掛けを両方の壁に掛けて、角が壁の四角に合っているか見る
    await L(`(() => { const g = L.game(); g.items = [
        { uid: 1, type: 'window', gx: 0.5, gz: 0, rot: 0, y: 0.85 }, { uid: 2, type: 'window2', gx: 4.5, gz: 0, rot: 0, y: 0.8 }, { uid: 3, type: 'picture', gx: 7.5, gz: 0, rot: 0, y: 1.1 },
        { uid: 4, type: 'window', gx: 0.5, gz: 0, rot: 1, y: 0.85 }, { uid: 5, type: 'window2', gx: 4.5, gz: 0, rot: 1, y: 0.8 }, { uid: 6, type: 'picture', gx: 7.5, gz: 0, rot: 1, y: 1.1 }];
        L.save(); L.select(1); L.render(); })()`);
    await shot('all_wall');
    // まとめて描いた敷物を並べる（img/items.json にあるとき）
    await L(`(() => { const g = L.game(); g.items = []; let uid = 1, x = 0, z = 0, row = 0;
        for (const [type, def] of Object.entries(L.FURNITURE)) {
            if (!def.topdown) continue;
            const [w, d] = def.size;
            if (x + w > 10) { x = 0; z += row; row = 0; }
            if (z + d > 10) break;
            g.items.push({ uid: uid++, type, gx: x, gz: z, rot: 0 }); x += w; row = Math.max(row, d);
        }
        L.save(); L.select(null); L.render(); })()`);
    await shot('sheet_rugs');
    await open('', { width: 844, height: 390, resident: true });
    await shot('phone_landscape');
}

await test('画面とコードに絵文字を使っていない（機種で見た目が変わるため）', async () => {
    const found = await evaluate(`(async () => {
        const texts = [document.body.innerText, ...await Promise.all(['js/app.js', 'index.html'].map(async f => (await fetch(f)).text()))];
        return [...new Set(texts.join('').match(/\\p{Extended_Pictographic}/gu) || [])].join(' ');
    })()`);
    assert(!found, '絵文字がある: ' + found);
});

await test('ページでエラーが出ていない', async () => {
    assert(errors.length === 0, errors.join('\n'));
});

// ---------- 後片付けと結果 ----------
ws.close();
chrome.kill();
server.close();
setTimeout(() => { try { rmSync(profile, { recursive: true, force: true }); } catch { } }, 500);
let failed = 0;
for (const [ok, name, msg] of results) {
    console.log(`${ok ? 'OK  ' : 'NG  '} ${name}${ok ? '' : '\n      ' + msg}`);
    if (!ok) failed++;
}
console.log(`\n${results.length - failed}/${results.length} 件成功`);
process.exit(failed ? 1 : 0);
