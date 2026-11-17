"""ゲーム用の絵（img/*.webp）から、置き方と色分けの情報を作る。cut_sprites.py の最後に呼ばれる。

使い方: python tools/sprite_meta.py

1. 床の角（corners）: 絵の下側の輪郭から、床に着く 3 つの角（左・手前・右）を探す。
   ゲームでは、この 3 点を床のマス目の角に合わせて絵を変形する（AIの絵ごとの傾きの違いを直す）。
   調べる家具は CORNER_ITEMS だけ（丸い物・細い物・壁掛けは、角がはっきりしないので調べない）。
2. 色の部分（parts）: 線（ほぼ黒の紺）を除いた色を、似た色ごとに 2〜4 個にまとめる。
   img/<名前>_parts.png に、点ごとの部分の番号（0 は線で、色を変えない）を書く。
   部分の名前（「茶色」など）と代表の色は img/sprites.json に書く。
"""
import colorsys
import json
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
GAME = ROOT / 'img'
CORNER_ITEMS = {'bed', 'sofa', 'chair', 'table', 'desk', 'bookshelf', 'wardrobe', 'chest', 'nightstand', 'tvstand', 'rug'}
MAX_PARTS = 4
LINE_L = 22          # これより暗い点は線（Lab の L）
MERGE_DIST = 20      # 代表の色がこれより近い部分はまとめる（Lab の距離、明るさは軽く見る）
MIN_SHARE = 0.012    # これより小さい部分は、近い部分にまとめる


# ---------- 床の角 ----------
def lower_hull(points):
    hull = []
    for p in sorted(set(points)):
        while len(hull) >= 2:
            (x1, y1), (x2, y2) = hull[-2], hull[-1]
            if (x2 - x1) * (p[1] - y1) - (y2 - y1) * (p[0] - x1) >= 0:  # 画像の y は下向き。下側の凸包
                hull.pop()
            else:
                break
        hull.append(p)
    return hull


def corners(alpha):
    """床の角（左・手前・右）。下側の輪郭の、いちばん下の点から左右へ、なだらかな辺（縦の辺の手前）の端まで進む"""
    ys, xs = np.nonzero(alpha)
    bottom = {}
    for x, y in zip(xs.tolist(), ys.tolist()):
        if y > bottom.get(x, -1):
            bottom[x] = y
    hull = lower_hull(list(bottom.items()))
    i = max(range(len(hull)), key=lambda k: hull[k][1])
    steep = 1.6
    j = i
    while j > 0 and (hull[j][1] - hull[j - 1][1]) / max(1, hull[j][0] - hull[j - 1][0]) < steep:
        j -= 1
    k = i
    while k < len(hull) - 1 and (hull[k][1] - hull[k + 1][1]) / max(1, hull[k + 1][0] - hull[k][0]) < steep:
        k += 1
    return [list(hull[j]), list(hull[i]), list(hull[k])]


# ---------- 色の部分 ----------
def rgb_to_lab(rgb):
    c = rgb / 255.0
    c = np.where(c > 0.04045, ((c + 0.055) / 1.055) ** 2.4, c / 12.92)
    m = np.array([[0.4124, 0.3576, 0.1805], [0.2126, 0.7152, 0.0722], [0.0193, 0.1192, 0.9505]])
    xyz = c @ m.T / np.array([0.9505, 1.0, 1.089])
    f = np.where(xyz > 0.008856, np.cbrt(xyz), 7.787 * xyz + 16 / 116)
    return np.stack([116 * f[:, 1] - 16, 500 * (f[:, 0] - f[:, 1]), 200 * (f[:, 1] - f[:, 2])], axis=1)


def feature(lab):
    # 同じ素材でも影で明るさが変わるので、明るさは軽く見る
    return lab * np.array([0.6, 1.0, 1.0])


def kmeans(x, k, seed=1, iters=25):
    rng = np.random.default_rng(seed)
    centers = [x[rng.integers(len(x))]]
    for _ in range(1, k):  # k-means++ で最初の点を選ぶ
        d = np.min(((x[:, None, :] - np.array(centers)[None]) ** 2).sum(-1), axis=1)
        centers.append(x[rng.choice(len(x), p=d / d.sum())])
    c = np.array(centers)
    for _ in range(iters):
        lab = np.argmin(((x[:, None, :] - c[None]) ** 2).sum(-1), axis=1)
        c = np.array([x[lab == i].mean(0) if np.any(lab == i) else c[i] for i in range(k)])
    return c


def color_name(rgb):
    """代表の色の名前。Lab の明るさ（L）・色みの強さ（C）・色相（h）で決める"""
    L, a, b = rgb_to_lab(np.array([rgb], dtype=np.float64))[0]
    C, h = np.hypot(a, b), np.degrees(np.arctan2(b, a)) % 360
    if C < 7:
        return '白' if L > 82 else '黒' if L < 28 else '灰色'
    if 20 <= h < 85:
        if L < 55:
            return '茶色'
        if C < 30:
            return 'ベージュ'
        return 'オレンジ' if h < 65 else '黄色'
    if 85 <= h < 105:
        return '黄色' if C >= 30 else 'ベージュ'
    if 105 <= h < 200:
        return '緑'
    if 200 <= h < 290:
        return '青'
    if 290 <= h < 330:
        return '紫'
    return 'ピンク' if L > 60 else '赤'


def parts(img):
    a = np.asarray(img.convert('RGBA'))
    alpha = a[..., 3] > 128
    rgb = a[..., :3][alpha].astype(np.float64)
    lab = rgb_to_lab(rgb)
    color = lab[:, 0] >= LINE_L
    x = feature(lab[color])
    sample = x[np.random.default_rng(0).choice(len(x), min(len(x), 6000), replace=False)]
    centers = kmeans(sample, 6)
    # 近い色・小さい部分をまとめて、MAX_PARTS 個までにする
    while True:
        lab_ids = np.argmin(((x[:, None, :] - centers[None]) ** 2).sum(-1), axis=1)
        share = np.bincount(lab_ids, minlength=len(centers)) / len(x)
        keep = share > 0
        centers, share = centers[keep], share[keep]
        if len(centers) <= 1:
            break
        d = np.sqrt(((centers[:, None] - centers[None]) ** 2).sum(-1)) + np.eye(len(centers)) * 1e9
        i, j = np.unravel_index(np.argmin(d), d.shape)
        small = int(np.argmin(share))
        if share[small] < MIN_SHARE:
            other = int(np.argmin(d[small]))
            i, j = small, other
        elif d[i, j] >= MERGE_DIST and len(centers) <= MAX_PARTS:
            break
        merged = (centers[i] * share[i] + centers[j] * share[j]) / (share[i] + share[j])
        centers = np.vstack([np.delete(centers, [i, j], axis=0), merged])
    ids = np.argmin(((x[:, None, :] - centers[None]) ** 2).sum(-1), axis=1)
    # 面積の大きい順に 1, 2, ... と番号を付ける
    order = np.argsort(-np.bincount(ids, minlength=len(centers)))
    rank = np.empty_like(order)
    rank[order] = np.arange(len(order))
    flat = np.zeros(len(rgb), dtype=np.uint8)
    flat[color] = rank[ids] + 1
    mask = np.zeros(alpha.shape, dtype=np.uint8)
    mask[alpha] = flat
    info, used = [], {}
    for n in range(1, len(centers) + 1):
        avg = rgb[flat == n].mean(0)
        name = color_name(avg)
        used[name] = used.get(name, 0) + 1
        info.append({'name': name, 'color': '#%02x%02x%02x' % tuple(int(v) for v in avg)})
    # 同じ名前が 2 つ以上あれば、明るい方を「明るい〜」にする
    for name, count in used.items():
        if count < 2:
            continue
        same = sorted([p for p in info if p['name'] == name], key=lambda p: sum(int(p['color'][k:k + 2], 16) for k in (1, 3, 5)))
        for idx, p in enumerate(same):
            p['name'] = ('暗い' if idx == 0 else '明るい' if idx == len(same) - 1 else '') + name
    return mask, info


def main():
    meta = {}
    for path in sorted(GAME.glob('*.webp')):
        name = path.stem
        if name.startswith('resident_'):
            continue
        img = Image.open(path).convert('RGBA')
        entry = {}
        if name in CORNER_ITEMS:
            entry['corners'] = corners(np.asarray(img)[..., 3] > 128)
        mask, info = parts(img)
        Image.fromarray(mask, 'L').save(GAME / f'{name}_parts.png', optimize=True)
        entry['parts'] = info
        meta[name] = entry
        print(f"{name}: {', '.join(p['name'] for p in info)}" + (f"  角 {entry['corners']}" if 'corners' in entry else ''))
    (GAME / 'sprites.json').write_text(json.dumps(meta, ensure_ascii=False, indent=1), encoding='utf-8')


if __name__ == '__main__':
    main()
