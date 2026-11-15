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
    await evaluate(`localStorage.setItem('lifemaker_save', JSON.stringify({ items: [{ uid: 1, type: 'bed', gx: 99, gz: -5, rot: 7 }, { uid: 1, type: 'bed', gx: 0, gz: 0, rot: 0 }, { uid: 2, type: 'ufo', gx: 0, gz: 0, rot: 0 }], nextUid: 'x' }))`);
    await open();
    const r = await L(`({ items: L.game().items, next: L.game().nextUid })`);
    assert(r.items.length === 1, '重複・知らない家具が残っている');
    const it = r.items[0];
    // ベッドは 2×4 マス。向き 3 で 4×2 になるので、右端は 12 - 4 = 8
    assert(it.rot === 3 && it.gx === 8 && it.gz === 0, `位置や向きが直っていない: ${JSON.stringify(it)}`);
    assert(r.next === 2, 'nextUid が直っていない');
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
