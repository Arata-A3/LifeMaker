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
async function open(path = '', { width = 390, height = 844, mobile = true, resident = false } = {}) {
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
}
async function clearSave() {
    await send('Page.navigate', { url: 'about:blank' }); // 閉じる直前の自動保存で書き戻されないよう、先に離れる
    await sleep(200);
    await send('Page.navigate', { url: BASE + 'tests/blank.html' });
    await sleep(200);
    await evaluate(`localStorage.removeItem('lifemaker2d_save'); localStorage.removeItem('lifemaker2d_save_corrupted')`);
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
    assert(await L('L.game().items.length') === 5, '最初の家具が 5 つない');
    assert(await L('L.game().items.every(it => !L.isBlocked(it))'), '最初の家具が重なっている');
    const broken = await evaluate(`[...document.querySelectorAll('#items img')].filter(i => !i.complete || !i.naturalWidth).length`);
    assert(broken === 0, '一覧の絵が読めていない');
});
await shot('01_phone');

await test('家具を一覧から置ける（空いている場所に置かれ、選ばれる）', async () => {
    await evaluate(`document.querySelector('#items .item[data-type="plant"]').click()`);
    const r = await L(`(() => { const g = L.game(); const it = g.items[g.items.length - 1]; return { n: g.items.length, type: it.type, sel: L.selected() === it.uid, blocked: L.isBlocked(it), bar: !document.getElementById('toolbar').hidden }; })()`);
    assert(r.n === 6 && r.type === 'plant', '置かれていない');
    assert(r.sel && r.bar, '置いた家具が選ばれていない');
    assert(!r.blocked, 'ほかの家具と重なる場所に置かれた');
});

await test('家具をドラッグで動かせて、保存される', async () => {
    const uid = await L('L.selected()');
    const before = await item(uid);
    const p = await L(`L.screenOf(${uid}, 0.6)`);
    assert(await L(`L.pickAt(${p.x}, ${p.y})`) === uid, '家具を押しても選べない');
    await dragMouse(p, { x: p.x + 40, y: p.y + 25 });
    const after = await item(uid);
    assert(after.gx !== before.gx || after.gz !== before.gz, '位置が変わらない');
    const saved = await evaluate(`JSON.parse(localStorage.getItem('lifemaker2d_save')).items.find(i => i.uid === ${uid})`);
    assert(saved && saved.gx === after.gx && saved.gz === after.gz, '動かした位置が保存されていない');
});

await test('絵の透明な所を押しても家具は選ばれない', async () => {
    await L('L.select(null)');
    const p = await L(`L.screenOf(2, 0.3)`);
    // ベッド（uid 2）の絵の四角の左上の角あたりは透明
    const corner = await L(`(() => { const s = L.screenOf(2, 1.2); return { x: s.x - 45, y: s.y - 15 }; })()`);
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
    assert(await L('L.game().items.length') === 5, '初期の部屋で起動しない');
    assert(await evaluate(`localStorage.getItem('lifemaker2d_save_corrupted') === '{broken'`), '壊れたデータが退避されていない');
});

await test('おかしな値のセーブを直して読む', async () => {
    await clearSave();
    await evaluate(`localStorage.setItem('lifemaker2d_save', JSON.stringify({ items: [
        { uid: 1, type: 'sofa', gx: 99, gz: -5, rot: 7 }, { uid: 1, type: 'bed', gx: 0, gz: 0 }, { uid: 2, type: 'nothing' }, { uid: 3, type: 'bed', gx: 'a', gz: null }
    ], resident: { show: false, name: '  なまえがとてもながいなまえです  ' }, presets: 'x' }))`);
    await open();
    const g = await L('L.game()');
    assert(g.items.length === 2, `数が違う: ${g.items.length}`);
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
    const look = (dx, dz) => R(`(() => { R.place(8, 7); R.walkTo(${8 + dx}, ${7 + dz}); R.step(0.2); return R.state().frame; })()`);
    const front = await look(0, 1.2);   // 左下へ
    const right = await look(1.2, 0);   // 右下へ
    const back = await look(0, -1.2);   // 右上へ
    const backL = await look(-1.2, 0);  // 左上へ
    assert([2, 3].includes(front.n) && !front.flip, `左下へ歩く絵: ${JSON.stringify(front)}`);
    assert([2, 3].includes(right.n) && right.flip, `右下へ歩く絵: ${JSON.stringify(right)}`);
    assert(back.n === 4 && !back.flip, `右上へ歩く絵: ${JSON.stringify(back)}`);
    assert(backL.n === 4 && backL.flip, `左上へ歩く絵: ${JSON.stringify(backL)}`);
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

await test('住人はベッドで寝て、吹き出しに 💤 が出る', async () => {
    await R('R.place(5, 8.5)');
    assert(await R('R.go(2)'), 'ベッドへ向かわない');
    let s;
    for (let k = 0; k < 60; k++) { await R('R.step(0.5)'); s = await R('R.state()'); if (s.mode === 'use' && s.k >= 1) break; }
    assert(s.act === 'lie' && s.k >= 1 && s.frame.n === 6, `寝ていない: ${JSON.stringify(s)}`);
    await R('R.step(3)');
    assert((await R('R.state()')).bubble === '💤', '💤 が出ていない');
    await shot('resident_sleep');
});

await test('住人を押すと笑って話す（家具は選ばれない）', async () => {
    await L('L.select(null)');
    await R('R.place(6, 8.5)');
    const p = await R('R.screen()');
    await tapAt(p);
    await R('R.step(0.05)');
    const s = await R('R.state()');
    assert(s.bubble && s.bubble !== '💤', `吹き出しが出ない: ${s.bubble}`);
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

await test('住人がひとりで動き続けても止まらない', async () => {
    await sleep(3000); // 実際の時間で動かす（エラーは最後のテストで確かめる）
    assert((await R('R.state()')).visible, '見えていない');
});

if (SHOT_DIR) {
    await open('', { width: 1366, height: 768, mobile: false, resident: true });
    await shot('pc');
    await open('', { width: 844, height: 390, resident: true });
    await shot('phone_landscape');
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
