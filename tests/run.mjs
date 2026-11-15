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
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.webmanifest': 'application/manifest+json', '.json': 'application/json' };
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
async function open(path = '', { width = 390, height = 844, mobile = true } = {}) {
    await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile });
    await send('Page.navigate', { url: BASE + path });
    for (let i = 0; i < 50; i++) {
        await sleep(100);
        try { if (await evaluate('!!window.__lifemaker')) break; } catch { }
    }
    await sleep(200);
}
async function clearSave() {
    await send('Page.navigate', { url: 'about:blank' }); // 閉じる直前の自動保存で書き戻されないよう、先に離れる
    await sleep(200);
    await send('Page.navigate', { url: BASE + 'tests/blank.html' });
    await sleep(200);
    await evaluate(`localStorage.removeItem('lifemaker_save'); localStorage.removeItem('lifemaker_save_corrupted')`);
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

await test('起動して版と一覧が出る', async () => {
    const v = await L('L.APP_VERSION');
    assert(await evaluate(`document.getElementById('version').textContent`) === 'v' + v, '版の表示が違う');
    const html = readFileSync(join(ROOT, 'index.html'), 'utf8');
    const qs = [...html.matchAll(/\?v=([\d.]+)/g)].map(m => m[1]);
    assert(qs.length >= 2 && qs.every(q => q === v), `?v= が APP_VERSION とそろっていない: ${qs} / ${v}`);
    const n = await evaluate(`document.querySelectorAll('#items .item').length`);
    assert(n === await L('Object.keys(L.FURNITURE).length'), '家具の一覧の数が違う');
    assert(await L('L.game().items.length') === 4, '最初の家具が 4 つない');
});

await shot('01_phone_portrait');

await test('家具を一覧から置ける（空いている場所に置かれ、選ばれる）', async () => {
    await evaluate(`document.querySelector('#items .item[data-type="chair"]').click()`);
    const r = await L(`(() => { const g = L.game(); const it = g.items[g.items.length - 1]; return { n: g.items.length, type: it.type, sel: L.selected() === it.uid, blocked: L.isBlocked(it), bar: !document.getElementById('toolbar').hidden }; })()`);
    assert(r.n === 5 && r.type === 'chair', '置かれていない');
    assert(r.sel && r.bar, '置いた家具が選ばれていない');
    assert(!r.blocked, 'ほかの家具と重なる場所に置かれた');
});
await shot('02_selected');

await test('家具をドラッグで動かせる', async () => {
    const uid = await L(`L.selected()`);
    const before = await L(`({ ...L.game().items.find(i => i.uid === ${uid}) })`);
    const p = await L(`L.screenOf(${uid})`);
    await dragMouse(p, { x: p.x + 70, y: p.y + 40 });
    const after = await L(`({ ...L.game().items.find(i => i.uid === ${uid}) })`);
    assert(after.gx !== before.gx || after.gz !== before.gz, '位置が変わらない');
    const saved = await evaluate(`JSON.parse(localStorage.getItem('lifemaker_save')).items.find(i => i.uid === ${uid})`);
    assert(saved && saved.gx === after.gx && saved.gz === after.gz, '動かした位置が保存されていない');
});

await test('回転すると向きが変わり、部屋からはみ出さない', async () => {
    await evaluate(`document.querySelector('#items .item[data-type="sofa"]').click()`);
    for (let i = 0; i < 4; i++) {
        await evaluate(`document.getElementById('rotate-btn').click()`);
        const r = await L(`(() => { const it = L.game().items.find(i => i.uid === L.selected()); const [w, d] = L.footprint(it); return { rot: it.rot, ok: it.gx >= 0 && it.gz >= 0 && it.gx + w <= 12 && it.gz + d <= 12 }; })()`);
        assert(r.rot === (i + 1) % 4, '向きが変わらない');
        assert(r.ok, 'はみ出した');
    }
});

await test('何もない所をドラッグすると部屋が回り、タップで選択が外れる', async () => {
    const a0 = await L('L.cam.azimuth');
    const empty = { x: 30, y: 120 };
    await dragMouse(empty, { x: 130, y: 120 });
    const a1 = await L('L.cam.azimuth');
    assert(Math.abs(a1 - a0) > 0.3, '回らない');
    assert(await L('L.selected()') !== null, 'ドラッグで選択が外れてしまった');
    await mouse('mousePressed', 30, 120); await mouse('mouseReleased', 30, 120, 0);
    await sleep(50);
    assert(await L('L.selected()') === null, 'タップで選択が外れない');
});
await shot('03_rotated_view');

async function tapAt(p) { await mouse('mousePressed', p.x, p.y); await mouse('mouseReleased', p.x, p.y, 0); }

await test('家具をダブルタップすると回る（1 回だけなら回らない）', async () => {
    await evaluate(`document.querySelector('#items .item[data-type="table"]').click()`);
    const uid = await L('L.selected()');
    const rot0 = await L(`L.game().items.find(i => i.uid === ${uid}).rot`);
    const p = await L(`L.screenOf(${uid}, 0.7)`); // 天板の高さを押す
    await tapAt(p);
    await sleep(500); // 間を空けた 2 回目は回らない
    await tapAt(p);
    assert(await L(`L.game().items.find(i => i.uid === ${uid}).rot`) === rot0, '1 回のタップで回ってしまった');
    await sleep(500);
    await tapAt(p);
    await sleep(80);
    await tapAt(p);
    assert(await L(`L.game().items.find(i => i.uid === ${uid}).rot`) === (rot0 + 1) % 4, 'ダブルタップで回らない');
    const saved = await evaluate(`JSON.parse(localStorage.getItem('lifemaker_save')).items.find(i => i.uid === ${uid}).rot`);
    assert(saved === (rot0 + 1) % 4, '回した向きが保存されていない');
});

await test('色を変えて保存し、元の色に戻せる', async () => {
    const uid = await L('L.selected()');
    await evaluate(`document.getElementById('color-btn').click()`);
    assert(await evaluate(`document.getElementById('color-dialog').open`), '色の画面が開かない');
    assert(await evaluate(`document.querySelector('#color-dialog .cd-recent-sec').hidden`), '最近使った色が空なのに見出しが出ている');
    await evaluate(`document.querySelectorAll('#color-dialog .cd-palette .cswatch')[15].click()`);
    const c1 = await L(`L.game().items.find(i => i.uid === ${uid}).colors.main ?? null`);
    assert(c1 === '#4a7cc4', `色が変わらない: ${c1}`);
    assert(await evaluate(`document.querySelectorAll('#color-dialog .cswatch[aria-pressed="true"]').length`) >= 1, '選んだ色に印がない');
    // 微調整: 明るさを＋1
    const before = await L(`L.hslOf('#4a7cc4')`);
    await evaluate(`(() => { const b = document.querySelector('#color-dialog .cd-row[data-key="l"] .cd-step[data-d="1"]'); b.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerType: 'mouse', button: 0 })); b.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerType: 'mouse' })); })()`);
    const c2 = await L(`L.game().items.find(i => i.uid === ${uid}).colors.main ?? null`);
    assert(c2 === await L(`L.hslToHex(${before[0]}, ${before[1]}, ${before[2] + 1})`), `明るさの＋が効かない: ${c2}`);
    assert(JSON.stringify(await L(`L.hslOf('${c2}')`)) === JSON.stringify([before[0], before[1], before[2] + 1]), '開き直したときの数値がずれる');
    await evaluate(`document.querySelector('#color-dialog .cd-close').click()`);
    await sleep(300); // close イベントは少し遅れて届く
    const saved = await evaluate(`JSON.parse(localStorage.getItem('lifemaker_save'))`);
    assert(saved.items.find(i => i.uid === uid).colors.main === c2, '色が保存されていない');
    assert(saved.recentColors[0] === c2 && saved.recentColors.length === 1, `最近使った色に 1 回だけ入っていない: ${JSON.stringify(saved.recentColors)} / ${c2}`);
    await evaluate(`document.getElementById('color-btn').click()`);
    await evaluate(`document.querySelector('#color-dialog .cd-auto').click()`);
    assert(await L(`L.game().items.find(i => i.uid === ${uid}).colors.main ?? null`) === null, '元の色に戻らない');
    assert(await evaluate(`document.querySelector('#color-dialog .cd-auto').disabled`), '元の色なのに「元の色に戻す」が押せる');
    await evaluate(`document.querySelector('#color-dialog .cd-revert').click()`);
    assert(await L(`L.game().items.find(i => i.uid === ${uid}).colors.main ?? null`) === c2, '開いたときの色に戻らない');
    // 部位を切り替えて、脚だけ色を変える
    const parts = await evaluate(`[...document.querySelectorAll('#color-dialog .cd-part')].map(b => b.textContent)`);
    assert(JSON.stringify(parts) === JSON.stringify(['天板', '脚']), `部位のタブが違う: ${parts}`);
    await evaluate(`document.querySelectorAll('#color-dialog .cd-part')[1].click()`);
    await evaluate(`document.querySelectorAll('#color-dialog .cd-palette .cswatch')[12].click()`);
    const cs = await L(`L.game().items.find(i => i.uid === ${uid}).colors`);
    assert(cs.legs === '#d9534f' && cs.main === c2, `部位ごとに色が変わらない: ${JSON.stringify(cs)}`);
    await evaluate(`document.querySelector('#color-dialog .cd-close').click()`);
    await sleep(300);
});

await test('整数の HSL で作った色は同じ数値に戻る', async () => {
    const bad = await evaluate(`(() => { const L = window.__lifemaker; const bad = [];
        for (let i = 0; i < 3000; i++) { const h = Math.floor(Math.random() * 360), s = Math.floor(Math.random() * 101), l = Math.floor(Math.random() * 101);
            const hex = L.hslToHex(h, s, l); const back = L.hslOf(hex); if (L.hslToHex(...back) !== hex) bad.push([h, s, l, hex, back]); }
        return bad.slice(0, 3); })()`);
    assert(bad.length === 0, JSON.stringify(bad));
});

await test('名前・タグで家具を絞り込める', async () => {
    const count = () => evaluate(`document.querySelectorAll('#items .item').length`);
    const all = await count();
    await evaluate(`(() => { const s = document.getElementById('search'); s.value = 'そふぁ'; s.dispatchEvent(new Event('input')); })()`);
    assert(await count() === 1, 'ひらがなでカタカナの名前が探せない');
    await evaluate(`(() => { const s = document.getElementById('search'); s.value = ''; s.dispatchEvent(new Event('input')); })()`);
    await evaluate(`[...document.querySelectorAll('#tags .tag')].find(b => b.textContent === '収納').click()`);
    const n = await count();
    assert(n === 5, `収納のタグで 5 つにならない: ${n}`);
    await evaluate(`(() => { const s = document.getElementById('search'); s.value = 'zzz'; s.dispatchEvent(new Event('input')); })()`);
    assert(await count() === 0 && await evaluate(`!!document.querySelector('#items .empty')`), '見つからないときの表示がない');
    await evaluate(`(() => { const s = document.getElementById('search'); s.value = ''; s.dispatchEvent(new Event('input')); })()`);
    await evaluate(`[...document.querySelectorAll('#tags .tag')].find(b => b.textContent === 'すべて').click()`);
    assert(await count() === all, '絞り込みを外しても全部に戻らない');
});

await test('部屋をプリセットに保存して呼び出せる', async () => {
    const room = await L(`JSON.stringify(L.game().items.map(({ uid, ...r }) => r))`);
    await evaluate(`document.getElementById('preset-btn').click()`);
    await evaluate(`document.getElementById('preset-name').value = 'テストの部屋'`);
    await evaluate(`document.getElementById('preset-save').click()`);
    assert(await evaluate(`document.querySelectorAll('#preset-list .preset').length`) === 1, '一覧に出ない');
    await evaluate(`document.getElementById('preset-close').click()`);
    // 部屋を変える
    await evaluate(`window.confirm = () => true`);
    await evaluate(`document.getElementById('clear-room-btn').click()`);
    assert(await L('L.game().items.length') === 0, '部屋が空にならない');
    await evaluate(`document.getElementById('preset-btn').click()`);
    await evaluate(`document.querySelector('#preset-list .preset-load').click()`);
    assert(await L(`JSON.stringify(L.game().items.map(({ uid, ...r }) => r))`) === room, '呼び出した部屋が保存したときと違う');
    const uids = await L('L.game().items.map(i => i.uid)');
    assert(new Set(uids).size === uids.length, '家具の番号が重なっている');
    // 呼び出したあと動かしても、プリセットは変わらない
    await L(`(() => { const it = L.game().items[0]; it.gx = 0; it.gz = 0; })()`);
    const ps = await L(`JSON.stringify(L.game().presets[0].items.map(({ uid, ...r }) => r))`);
    assert(ps === room, 'プリセットが部屋と一緒に変わってしまった');
});

await test('元に戻す・やり直す', async () => {
    await evaluate(`document.querySelector('.tab[data-tab="furniture"]').click()`);
    await L('L.save()'); // 前のテストが保存せずに変えた分を記録しておく
    const start = await L('JSON.stringify(L.game().items)');
    await evaluate(`document.querySelector('#items .item[data-type="plant"]').click()`);
    const afterAdd = await L('JSON.stringify(L.game().items)');
    await evaluate(`document.getElementById('rotate-btn').click()`);
    const afterRot = await L('JSON.stringify(L.game().items)');
    await evaluate(`document.getElementById('undo-btn').click()`);
    assert(await L('JSON.stringify(L.game().items)') === afterAdd, '1 回戻すと回す前にならない');
    await evaluate(`document.getElementById('undo-btn').click()`);
    assert(await L('JSON.stringify(L.game().items)') === start, '2 回戻すと置く前にならない');
    assert(await L('L.selected()') === null, '消えた家具が選ばれたまま');
    await evaluate(`document.getElementById('redo-btn').click()`);
    await evaluate(`document.getElementById('redo-btn').click()`);
    assert(await L('JSON.stringify(L.game().items)') === afterRot, 'やり直しで戻らない');
    assert(await evaluate(`document.getElementById('redo-btn').disabled`), 'やり直すものが無いのに押せる');
    // 戻してから別の操作をすると、やり直しは消える
    await evaluate(`document.getElementById('undo-btn').click()`);
    await evaluate(`document.querySelector('#items .item[data-type="lamp"]').click()`);
    assert(await L('L.history().redo') === 0, '新しい操作のあとにやり直しが残っている');
    // ドラッグ 1 回は 1 手
    const uid = await L('L.selected()');
    const n = await L('L.history().undo');
    const p = await L(`L.screenOf(${uid}, 1.0)`);
    await dragMouse(p, { x: p.x + 60, y: p.y + 30 }, 10);
    assert(await L('L.history().undo') === n + 1, 'ドラッグ 1 回で 1 手になっていない');
    // 保存した中身も戻っている
    await evaluate(`document.getElementById('undo-btn').click()`);
    const saved = await evaluate(`JSON.parse(localStorage.getItem('lifemaker_save')).items.length`);
    assert(saved === await L('L.game().items.length'), '戻した結果が保存されていない');
});

await test('床と壁の柄・色を変えられ、元に戻せる', async () => {
    await evaluate(`document.querySelector('.tab[data-tab="surface"]').click()`);
    assert(!(await evaluate(`document.getElementById('surface-panel').hidden`)), '床・壁の画面が出ない');
    assert(await evaluate(`document.querySelectorAll('#surface-panel .pattern').length`) === 8, '柄の数が違う');
    await evaluate(`document.querySelector('#surface-panel [data-kind="floor"] .pattern[data-pattern="tatami"]').click()`);
    await evaluate(`document.querySelector('#surface-panel [data-kind="wall"] .pattern[data-pattern="brick"]').click()`);
    let g = await L('({ f: L.game().floor, w: L.game().wall })');
    assert(g.f.pattern === 'tatami' && g.w.pattern === 'brick', '柄が変わらない');
    await evaluate(`document.querySelector('#surface-panel [data-kind="wall"] .surface-color').click()`);
    assert(await evaluate(`document.querySelector('#color-dialog .cd-title').textContent`) === '壁の色', '壁の色の画面にならない');
    await evaluate(`document.querySelectorAll('#color-dialog .cd-palette .cswatch')[9].click()`);
    await evaluate(`document.querySelector('#color-dialog .cd-close').click()`);
    await sleep(300);
    g = await L('({ f: L.game().floor, w: L.game().wall })');
    assert(g.w.color === '#bcd7ea', `壁の色が変わらない: ${g.w.color}`);
    const saved = await evaluate(`JSON.parse(localStorage.getItem('lifemaker_save'))`);
    assert(saved.wall.color === '#bcd7ea' && saved.floor.pattern === 'tatami', '床・壁が保存されていない');
    await evaluate(`document.getElementById('undo-btn').click()`);
    assert(await L('L.game().wall.color') === null, '壁の色を元に戻せない');
    await evaluate(`document.getElementById('undo-btn').click()`);
    assert(await L('L.game().wall.pattern') === 'plain', '壁の柄を元に戻せない');
    assert(await evaluate(`document.querySelector('#surface-panel [data-kind="wall"] .pattern[aria-pressed="true"]').dataset.pattern`) === 'plain', '戻したのに柄の印が古いまま');
    await evaluate(`document.getElementById('redo-btn').click()`);
    await evaluate(`document.getElementById('redo-btn').click()`);
    await evaluate(`document.querySelector('.tab[data-tab="furniture"]').click()`);
});

await test('家具の部品の面がぴったり重なっていない（チラつき防止）', async () => {
    const issues = await L('L.findCoplanarFaces()');
    assert(issues.length === 0, issues.join(', '));
    // 検出できることも確かめる: 直す前のクローゼット（台座と本体が同じ面を持つ）
    const old = await evaluate(`(() => { const L = window.__lifemaker; const F = L.FURNITURE;
        F.zz_old = { ...F.wardrobe, build: (g, c) => { L.testBox(g, 0.94, 1.9, 0.46, c.main, 0, 0, -0.01); L.testBox(g, 0.94, 0.08, 0.46, c.main, 0, 0, -0.01); } };
        const r = L.findCoplanarFaces(); delete F.zz_old; return r; })()`);
    assert(old.some(x => x.startsWith('zz_old')), '古いクローゼットの重なりを見つけられない');
});

await test('小物は家具の上に載り、家具といっしょに動く・回る', async () => {
    await evaluate(`document.querySelector('#items .item[data-type="table"]').click()`);
    const t = await L('L.selected()');
    await evaluate(`document.querySelector('#items .item[data-type="mug"]').click()`);
    const m = await L('L.selected()');
    assert(await L(`L.kindOf(L.game().items.find(i => i.uid === ${m}))`) === 'small', '小物になっていない');
    assert(await L(`L.smallBase(L.game().items.find(i => i.uid === ${m}))`) > 0.3, '小物が家具の上に置かれない');
    // テーブルの角のマスに載せる
    await L(`(() => { const g = L.game(); const tb = g.items.find(i => i.uid === ${t}), mg = g.items.find(i => i.uid === ${m}); mg.gx = tb.gx; mg.gz = tb.gz; L.rebuildAll(); L.select(${t}); })()`);
    const h = await L(`L.smallBase(L.game().items.find(i => i.uid === ${m}))`);
    assert(Math.abs(h - 0.732) < 0.001, `テーブルの天面の高さにならない: ${h}`);
    const before = await L(`(() => { const g = L.game(); const tb = g.items.find(i => i.uid === ${t}), mg = g.items.find(i => i.uid === ${m}); return { dx: mg.gx - tb.gx, dz: mg.gz - tb.gz, tgx: tb.gx, tgz: tb.gz }; })()`);
    const p = await L(`L.screenOf(${t}, 0.73)`);
    await dragMouse(p, { x: p.x - 50, y: p.y + 35 }, 10);
    const after = await L(`(() => { const g = L.game(); const tb = g.items.find(i => i.uid === ${t}), mg = g.items.find(i => i.uid === ${m}); return { dx: mg.gx - tb.gx, dz: mg.gz - tb.gz, tgx: tb.gx, tgz: tb.gz }; })()`);
    assert(after.tgx !== before.tgx || after.tgz !== before.tgz, 'テーブルが動かない');
    assert(after.dx === before.dx && after.dz === before.dz, `小物がいっしょに動かない: ${JSON.stringify([before, after])}`);
    // 回すと、小物もテーブルの上に残る
    await evaluate(`document.getElementById('rotate-btn').click()`);
    const r = await L(`(() => { const g = L.game(); const tb = g.items.find(i => i.uid === ${t}), mg = g.items.find(i => i.uid === ${m}); const [w, d] = L.footprint(tb); return { inside: mg.gx >= tb.gx && mg.gx < tb.gx + w && mg.gz >= tb.gz && mg.gz < tb.gz + d, h: L.smallBase(mg) }; })()`);
    assert(r.inside && r.h > 0.7, `回したら小物が落ちた: ${JSON.stringify(r)}`);
    // テーブルをしまうと床に下り、戻すと上に戻る
    await evaluate(`document.getElementById('remove-btn').click()`);
    assert(await L(`L.smallBase(L.game().items.find(i => i.uid === ${m}))`) === 0, 'しまったのに小物が浮いている');
    await evaluate(`document.getElementById('undo-btn').click()`);
    assert(await L(`L.smallBase(L.game().items.find(i => i.uid === ${m}))`) > 0.7, '戻したのに小物が上に戻らない');
});

await test('壁掛けは見えている壁に掛かり、壁に沿って動かせる', async () => {
    await evaluate(`document.querySelector('#items .item[data-type="picture"]').click()`);
    const uid = await L('L.selected()');
    let it = await L(`({ ...L.game().items.find(i => i.uid === ${uid}) })`);
    assert((await L('L.walls()'))[it.rot], '隠れた壁に掛かった');
    assert(await evaluate(`document.getElementById('rotate-btn').hidden`), '壁掛けに回転ボタンが出ている');
    assert(!(await L(`L.isBlocked(L.game().items.find(i => i.uid === ${uid}))`)), 'ほかの壁掛けと重なっている');
    await evaluate(`document.querySelector('#items .item[data-type="wallclock"]').click()`);
    const c = await L('L.selected()');
    assert(!(await L(`L.isBlocked(L.game().items.find(i => i.uid === ${c}))`)), '2 つ目の壁掛けが重なった');
    await L(`L.select(${uid})`);
    const p = await L(`L.screenOf(${uid}, 0.35)`);
    await dragMouse(p, { x: p.x + 6, y: p.y - 45 }, 10);
    const moved = await L(`({ ...L.game().items.find(i => i.uid === ${uid}) })`);
    assert(moved.gz > it.gz, `上に動かない: ${it.gz} → ${moved.gz}`);
    assert(moved.gz * 0.1 + 0.7 <= 2.6 + 1e-9, '天井を突き抜けた');
    const saved = await evaluate(`JSON.parse(localStorage.getItem('lifemaker_save')).items.find(i => i.uid === ${uid})`);
    assert(saved.gz === moved.gz && saved.rot === moved.rot, '動かした位置が保存されていない');
    // 部屋を回して、その壁が隠れたら壁掛けも隠れる
    const az = await L('L.cam.azimuth');
    await L('(L.cam.azimuth += Math.PI, L.updateCamera())');
    assert(!(await L(`L.visibleOf(${uid})`)), '隠れた壁の壁掛けが見えている');
    await L(`(L.cam.azimuth = ${az}, L.updateCamera())`);
    assert(await L(`L.visibleOf(${uid})`), '壁が戻ったのに壁掛けが見えない');
    await evaluate(`document.getElementById('done-btn').click()`);
});
await shot('04_wall_small');

await test('本棚の本は何冊かずつまとめて色が変わる', async () => {
    await evaluate(`document.querySelector('#items .item[data-type="bookshelf"]').click()`);
    const uid = await L('L.selected()');
    await evaluate(`document.getElementById('color-btn').click()`);
    const parts = await evaluate(`[...document.querySelectorAll('#color-dialog .cd-part')].map(b => b.textContent)`);
    assert(JSON.stringify(parts) === JSON.stringify(['本棚', '背板', '本 1', '本 2', '本 3']), `部位が違う: ${parts}`);
    await evaluate(`document.querySelectorAll('#color-dialog .cd-part')[2].click()`);
    await evaluate(`document.querySelectorAll('#color-dialog .cd-palette .cswatch')[12].click()`);
    const cs = await L(`L.game().items.find(i => i.uid === ${uid}).colors`);
    assert(cs.books1 === '#d9534f', `本 1 の色が変わらない: ${JSON.stringify(cs)}`);
    const colors = await L(`L.meshColors(${uid})`);
    assert(colors.includes('#d9534f') && !colors.includes('#c45c4a'), `本の色が変わっていない: ${colors}`);
    await evaluate(`document.querySelector('#color-dialog .cd-close').click()`);
    await sleep(300);
});

await test('色の画面を開いてもカメラは動かず、隠れるときだけ少しずらす', async () => {
    const target = await L('L.cam.target.toArray()');
    const az = await L('L.cam.azimuth');
    // 画面の上のほうにある家具（隠れない）
    const sel = await L(`(() => { const g = L.game(); let best = null, by = Infinity; for (const it of g.items) { if (L.kindOf(it) !== 'floor') continue; const y = L.screenOf(it.uid, 0).y; if (y < by) { by = y; best = it.uid; } } return best; })()`);
    await L(`L.select(${sel})`);
    await evaluate(`document.getElementById('color-btn').click()`);
    await sleep(400);
    assert(await L('L.viewShift()') === 0, `隠れない家具なのにずれた: ${await L('L.viewShift()')}`);
    assert(JSON.stringify(await L('L.cam.target.toArray()')) === JSON.stringify(target) && await L('L.cam.azimuth') === az, 'カメラが動いた');
    await evaluate(`document.querySelector('#color-dialog .cd-close').click()`);
    await sleep(400);
    // 画面のいちばん下の家具（シートに隠れる）
    const low = await L(`(() => { const g = L.game(); let best = null, by = -Infinity; for (const it of g.items) { if (L.kindOf(it) !== 'floor') continue; const y = L.screenOf(it.uid, 0).y; if (y > by) { by = y; best = it.uid; } } return best; })()`);
    await L(`L.select(${low})`);
    await evaluate(`document.getElementById('color-btn').click()`);
    await sleep(400);
    const shift = await L('L.viewShift()');
    const h = await evaluate(`document.getElementById('view').clientHeight`);
    assert(shift > 0 && shift <= h * 0.45 + 0.5, `隠れる家具なのにずれない、またはずれすぎ: ${shift} / ${h}`);
    const top1 = await evaluate(`document.getElementById('color-dialog').getBoundingClientRect().top`);
    await evaluate(`document.querySelectorAll('#color-dialog .cd-part')[1]?.click()`);
    const top2 = await evaluate(`document.getElementById('color-dialog').getBoundingClientRect().top`);
    assert(top1 === top2, `部位を切り替えたら画面の上端が動いた: ${top1} → ${top2}`);
    await shot('05_color_low');
    await evaluate(`document.querySelector('#color-dialog .cd-close').click()`);
    await sleep(400);
    assert(await L('L.viewShift()') === 0, '閉じたのにずれたまま');
    assert(JSON.stringify(await L('L.cam.target.toArray()')) === JSON.stringify(target), 'カメラが動いた');
    await L('L.select(null)');
});

await test('テレビは小物で、テレビ台の上に置かれる', async () => {
    assert(await L('L.FURNITURE.tv.small') === true, 'テレビが小物になっていない');
    await evaluate(`document.querySelector('#items .item[data-type="tvstand"]').click()`);
    const st = await L('L.selected()');
    await evaluate(`document.querySelector('#items .item[data-type="tv"]').click()`);
    const tv = await L('L.selected()');
    const s = await L(`L.supportOf(L.game().items.find(i => i.uid === ${tv}))?.uid ?? null`);
    assert(s === st, `テレビがテレビ台に載らない: ${s} / ${st}`);
    assert(!(await L(`L.isBlocked(L.game().items.find(i => i.uid === ${tv}))`)), 'テレビ台の上なのに重なりの印になる');
    await evaluate(`document.getElementById('done-btn').click()`);
});

await test('本棚は「きっちり」と「ばらばら」の 2 種類', async () => {
    const r = await L(`({ a: L.FURNITURE.bookshelf.name, b: L.FURNITURE.bookshelf2.name, bs: L.FURNITURE.bookshelf2.slots.map(s => s.name) })`);
    assert(r.a.includes('きっちり') && r.b.includes('ばらばら'), `名前が違う: ${r.a} / ${r.b}`);
    assert(r.bs.filter(n => n.startsWith('本 ')).length === 4, `ばらばらの本の部位が 4 つない: ${r.bs}`);
    await evaluate(`document.querySelector('#items .item[data-type="bookshelf2"]').click()`);
    const uid = await L('L.selected()');
    const n = (await L(`L.meshColors(${uid})`)).length;
    assert(n >= 12, `ばらばらの本棚の色が少ない: ${n}`);
    await evaluate(`document.getElementById('done-btn').click()`);
});

await test('マス目と自由配置を切り替えられる', async () => {
    const btn = () => evaluate(`document.getElementById('snap-btn').textContent`);
    assert((await btn()).includes('マス目') && await L('L.game().snap') === true, '最初がマス目になっていない');
    await evaluate(`document.getElementById('snap-btn').click()`);
    assert((await btn()).includes('自由') && await L('L.game().snap') === false, '自由に切り替わらない');
    await evaluate(`document.querySelector('#items .item[data-type="vase"]').click()`);
    const uid = await L('L.selected()');
    const p = await L(`L.screenOf(${uid}, 0.1)`);
    await dragMouse(p, { x: p.x + 23, y: p.y + 11 }, 10);
    let it = await L(`({ ...L.game().items.find(i => i.uid === ${uid}) })`);
    assert(!Number.isInteger(it.gx) || !Number.isInteger(it.gz), `自由に置けていない: ${it.gx}, ${it.gz}`);
    const saved = await evaluate(`JSON.parse(localStorage.getItem('lifemaker_save'))`);
    assert(saved.snap === false && saved.items.find(i => i.uid === uid).gx === it.gx, '自由配置が保存されていない');
    // 開き直しても位置と設定が残る
    await open();
    it = await L(`({ ...L.game().items.find(i => i.uid === ${uid}) })`);
    assert(it.gx === saved.items.find(i => i.uid === uid).gx && await L('L.game().snap') === false, '開き直すと自由配置が消える');
    // マス目に戻して動かすと、マスにそろう
    await evaluate(`document.getElementById('snap-btn').click()`);
    await L(`L.select(${uid})`);
    const q = await L(`L.screenOf(${uid}, 0.1)`);
    await dragMouse(q, { x: q.x + 40, y: q.y + 30 }, 10);
    it = await L(`({ ...L.game().items.find(i => i.uid === ${uid}) })`);
    assert(Number.isInteger(it.gx) && Number.isInteger(it.gz), `マス目にそろわない: ${it.gx}, ${it.gz}`);
    await evaluate(`document.getElementById('done-btn').click()`);
});

await test('しまうと消える', async () => {
    const n = await L('L.game().items.length');
    await evaluate(`document.querySelector('#items .item[data-type="lamp"]').click()`);
    await evaluate(`document.getElementById('remove-btn').click()`);
    assert(await L('L.game().items.length') === n, '消えない');
    assert(await evaluate(`document.getElementById('toolbar').hidden`), '道具の帯が残る');
});

await test('開き直しても部屋が残る', async () => {
    const before = await L('JSON.stringify(L.game().items)');
    await open();
    assert(await L('JSON.stringify(L.game().items)') === before, '部屋が元に戻っていない');
});

await test('壊れたセーブでも起動する', async () => {
    await send('Page.navigate', { url: 'about:blank' });
    await sleep(200);
    await send('Page.navigate', { url: BASE + 'tests/blank.html' });
    await sleep(200);
    await evaluate(`localStorage.setItem('lifemaker_save', '{壊れた')`);
    await open();
    assert(await L('L.game().items.length') === 4, '初期状態で起動していない');
    assert(await evaluate(`localStorage.getItem('lifemaker_save_corrupted')`) === '{壊れた', '壊れたデータを退避していない');
});

await test('おかしな値のセーブを直して読む', async () => {
    await send('Page.navigate', { url: 'about:blank' });
    await sleep(200);
    await send('Page.navigate', { url: BASE + 'tests/blank.html' });
    await sleep(200);
    await evaluate(`localStorage.setItem('lifemaker_save', JSON.stringify({ floor: { pattern: 'lava', color: 'red' }, items: [{ uid: 1, type: 'bed', gx: 99, gz: -5, rot: 7, color: '#ABCDEF' }, { uid: 1, type: 'bed', gx: 0, gz: 0, rot: 0 }, { uid: 2, type: 'ufo', gx: 0, gz: 0, rot: 0 }], nextUid: 'x' }))`);
    await open();
    const r = await L(`({ items: L.game().items, next: L.game().nextUid })`);
    assert(r.items.length === 1, '重複・知らない家具が残っている');
    const it = r.items[0];
    // ベッドは 2×4 マス。向き 3 で 4×2 になるので、右端は 12 - 4 = 8
    assert(it.rot === 3 && it.gx === 8 && it.gz === 0, `位置や向きが直っていない: ${JSON.stringify(it)}`);
    assert(r.next === 2, 'nextUid が直っていない');
    assert(JSON.stringify(it.colors) === JSON.stringify({ main: '#abcdef' }), `v0.2.0 の 1 色の形式が移っていない: ${JSON.stringify(it.colors)}`);
    const f = await L('L.game().floor');
    assert(f.pattern === 'wood' && f.color === null, `おかしな床が直っていない: ${JSON.stringify(f)}`);
});

await test('v0.4.0 までのテレビ台は、テレビを分けて上に載せる', async () => {
    await clearSave();
    await evaluate(`localStorage.setItem('lifemaker_save', JSON.stringify({ saveVersion: 2, nextUid: 3, items: [{ uid: 2, type: 'tvstand', gx: 2, gz: 0, rot: 1, colors: { main: '#112233', tv: '#445566' } }],
        presets: [{ id: 1, name: 'a', items: [{ uid: 1, type: 'tvstand', gx: 0, gz: 0, rot: 0, colors: {} }] }] }))`);
    await open();
    const r = await L(`(() => { const g = L.game(); const tv = g.items.find(i => i.type === 'tv'); return { n: g.items.length, tv, sup: tv && L.supportOf(tv)?.type, next: g.nextUid, st: g.items.find(i => i.type === 'tvstand').colors, pn: g.presets[0].items.map(i => i.type) }; })()`);
    assert(r.n === 2 && r.tv && r.sup === 'tvstand', `テレビが分かれていない: ${JSON.stringify(r)}`);
    assert(r.tv.rot === 1 && r.tv.colors.main === '#445566', `テレビの向きや色が引き継がれていない: ${JSON.stringify(r.tv)}`);
    assert(JSON.stringify(r.st) === JSON.stringify({ main: '#112233' }), `テレビ台の色が変: ${JSON.stringify(r.st)}`);
    assert(r.next > r.tv.uid, 'nextUid がテレビの番号より小さい');
    assert(JSON.stringify(r.pn) === JSON.stringify(['tvstand', 'tv']), `プリセットのテレビが分かれていない: ${r.pn}`);
    // 新しい形式で保存したあとは、もう一度分けない
    await L('L.save()');
    await open();
    assert(await L(`L.game().items.filter(i => i.type === 'tv').length`) === 1, 'テレビが増えた');
});

if (SHOT_DIR) {
    await clearSave();
    for (const [name, w, h, mobile] of [['phone_390x844', 390, 844, true], ['phone_360x640', 360, 640, true], ['land_844x390', 844, 390, true], ['land_667x375', 667, 375, true], ['pc_1366x768', 1366, 768, false]]) {
        await open('', { width: w, height: h, mobile });
        await shot('size_' + name);
    }
    await evaluate(`document.documentElement.dataset.theme = 'dark'`);
    await open('', { width: 390, height: 844 });
    await evaluate(`document.getElementById('menu-btn').click()`);
    await shot('menu');
    await evaluate(`document.getElementById('menu').close()`);
    await evaluate(`document.querySelector('#items .item[data-type="sofa"]').click()`);
    await evaluate(`document.getElementById('color-btn').click()`);
    await evaluate(`document.querySelectorAll('#color-dialog .cd-palette .cswatch')[6].click()`);
    await shot('color_dark');
    await evaluate(`document.querySelector('#color-dialog .cd-close').click()`);
    await evaluate(`delete document.documentElement.dataset.theme; document.documentElement.dataset.theme = 'light'`);
    await evaluate(`document.getElementById('preset-btn').click()`);
    await shot('preset_light');
    await evaluate(`document.getElementById('preset-dialog').close()`);
    await open('', { width: 360, height: 640 });
    await evaluate(`document.querySelector('#items .item[data-type="sofa"]').click()`);
    await evaluate(`document.getElementById('color-btn').click()`);
    await shot('color_360');
    await evaluate(`document.querySelector('#color-dialog .cd-close').click()`);
    await sleep(300);
    // 床・壁
    await open('', { width: 390, height: 844 });
    await evaluate(`document.querySelector('.tab[data-tab="surface"]').click()`);
    await shot('surface_default');
    for (const [f, w] of [['tatami', 'wainscot'], ['tile', 'brick'], ['carpet', 'stripe']]) {
        await evaluate(`document.querySelector('#surface-panel [data-kind="floor"] .pattern[data-pattern="${f}"]').click()`);
        await evaluate(`document.querySelector('#surface-panel [data-kind="wall"] .pattern[data-pattern="${w}"]').click()`);
        await shot(`surface_${f}_${w}`);
    }
    // クローゼットの近く（チラつきの確認）
    await evaluate(`document.querySelector('.tab[data-tab="furniture"]').click()`);
    await evaluate(`document.querySelector('#items .item[data-type="wardrobe"]').click()`);
    await evaluate(`document.querySelector('#items .item[data-type="bookshelf"]').click()`);
    await evaluate(`document.getElementById('done-btn').click()`);
    await evaluate(`(() => { const L = window.__lifemaker; L.cam.radius = 5; L.cam.polar = 1.25; L.cam.azimuth = 0.3; })()`);
    await dragMouse({ x: 20, y: 300 }, { x: 21, y: 300 }, 1);
    await shot('closeup');
}

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
