"""ゲーム用の絵（img/*.webp）から、置き方と色分けの情報を作る。cut_sprites.py の最後に呼ばれる。

使い方: python tools/sprite_meta.py

1. 床の角（corners）: 絵の下側の輪郭から、床に着く 3 つの角（左・手前・右）を探す。
   ゲームでは、左右の角を足元の四角の左右の端に、手前の角を床の高さに合わせて、縦横同じ倍率で縮める。
   調べる家具は CORNER_ITEMS だけ（丸い物・細い物・壁掛けは、角がはっきりしないので調べない）。
   壁掛け（WALL_ITEMS）は、絵を囲む平行四辺形（wall）を求め、壁の上の四角に合わせる。
   ほかの物は、底（base: 真ん中の x・いちばん下の y・幅）を求め、足元の四角の真ん中に置く。
2. 色の部分（parts）: 線（ほぼ黒の紺）を除いた色を、似た色ごとに 2〜4 個にまとめる。
   img/<名前>_parts.png に、点ごとの部分の番号（0 は線で、色を変えない）を書く。
   部分の名前（PART_NAMES の「布団」「枠」など）と代表の色は img/sprites.json に書く。
"""
import colorsys
import json
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
GAME = ROOT / 'img'
CORNER_ITEMS = {'bed', 'sofa', 'chair', 'table', 'desk', 'bookshelf', 'wardrobe', 'chest', 'nightstand', 'tvstand', 'rug', 'lowtable'}
WALL_ITEMS = {'window', 'window2', 'picture'}
# 壁掛けの本体（窓枠・額縁の正面）の 4 つの角 [左上, 右上, 左下, 右下]。img/<名前>.webp の上の位置（目で読み取った値）。
# ゲームでは、この四角を壁の上の四角に合わせる（カーテン・レール・アーチなどの飾りは、外にはみ出してよい）。
# 絵を作り直したら、読み取り直す
WALL_FACES = {
    'picture': [[7, 17], [442, 220], [5, 365], [440, 585]],
    'window': [[30, 20], [402, 157], [30, 416], [402, 594]],   # 左端と右下はカーテンに隠れているので、見えている線を延ばした所
    'window2': [[27, 250], [270, 135], [30, 570], [270, 427]],  # アーチの付け根を上の辺にする
}
MAX_PARTS = 4
# 部分の名前（面積の大きい順）。部分の数が合わないとき（絵を作り直したときなど）は、色の名前にして知らせる
PART_NAMES = {
    'bed': ['布団', '枠', 'シーツ・枕'], 'bookshelf': ['本棚', '本 1', '本 2'], 'chair': ['木', '座面'],
    'lamp': ['かさ', '柱'], 'lamp2': ['本体', 'かさの内側'], 'picture': ['絵', '額縁', '飾り'],
    'plant': ['葉', '鉢', '土'], 'plant2': ['葉', '鉢', '土'], 'rug': ['柄 1', '柄 2', 'ふさ'],
    'sofa': ['布', '脚', 'クッション'], 'vase': ['花びん', '葉', '花 1', '花 2'], 'vase2': ['花びんと花', '葉'],
    'window': ['カーテン', '窓枠', 'ガラス'],
}
# 部分の数の上限（輪郭沿いの細いふちだけの部分ができる絵は、まわりの部分にまとめる）
MAX_PARTS_BY = {'nightstand': 1, 'window2': 1, 'tvstand': 1, 'wardrobe': 1, 'plant': 3, 'plant2': 3, 'vase2': 2}
LINE_L = 22          # これより暗い点は線（Lab の L）
LINE_L_BY = {'nightstand': 9, 'vase2': 9, 'window2': 9}  # 塗りがとても暗い絵は、線の基準を下げる
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


# ---------- 底（丸い物・細い物） ----------
def base(alpha):
    """いちばん下の部分（植木鉢の底・脚の先）の真ん中の x、いちばん下の y、底の幅"""
    ys, xs = np.nonzero(alpha)
    bottom, h = ys.max(), ys.max() - ys.min()
    near = ys >= bottom - max(4, h * 0.03)
    wide = ys >= bottom - max(8, h * 0.1)
    return [round(float(xs[near].mean()), 1), int(bottom), int(xs[wide].max() - xs[wide].min())]


# ---------- 壁掛けの四角 ----------
def wall_box(alpha):
    """壁掛けの絵を囲む平行四辺形。辺の傾き s と、左端での上の辺 a・下の辺 b（y = a + s x、y = b + s x）"""
    h, w = alpha.shape
    cols = [x for x in range(w) if alpha[:, x].any()]
    top = np.array([np.argmax(alpha[:, x]) for x in cols], dtype=np.float64)
    bot = np.array([h - 1 - np.argmax(alpha[::-1, x]) for x in cols], dtype=np.float64)
    xs = np.array(cols, dtype=np.float64)
    mid = (xs > w * 0.3) & (xs < w * 0.7)  # 端の飾り（カーテンのすそなど）は見ない。真ん中の窓枠・額縁で測る
    # 上の辺と下の辺のうち、まっすぐな方（ずれの小さい方）で傾きを測る（アーチの窓は上の辺が曲がっている）
    fits = []
    for edge in (top, bot):
        k, c = np.polyfit(xs[mid], edge[mid], 1)
        fits.append((float(np.sqrt(np.mean((edge[mid] - (k * xs[mid] + c)) ** 2))), float(k)))
    s = min(fits)[1]
    return {'s': round(s, 4), 'a': round(float((top - s * xs).min()), 1), 'b': round(float((bot - s * xs).max()), 1)}


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


def parts(img, line_l=LINE_L, max_parts=MAX_PARTS):
    a = np.asarray(img.convert('RGBA'))
    alpha = a[..., 3] > 128
    rgb = a[..., :3][alpha].astype(np.float64)
    lab = rgb_to_lab(rgb)
    color = lab[:, 0] >= line_l
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
        elif d[i, j] >= MERGE_DIST and len(centers) <= max_parts:
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


def name_parts(name, info):
    names = PART_NAMES.get(name)
    if len(info) == 1:
        info[0]['name'] = '本体'
    elif names and len(names) == len(info):
        for p, n in zip(info, names):
            p['name'] = n
    else:
        print(f'  ※ {name}: 部分の名前の表（PART_NAMES）と数が合わないので、色の名前にしました')


def main():
    meta = {}
    for path in sorted(GAME.glob('*.webp')):
        name = path.stem
        if name.startswith('resident_'):
            continue
        img = Image.open(path).convert('RGBA')
        entry = {}
        alpha = np.asarray(img)[..., 3] > 128
        if name in CORNER_ITEMS:
            entry['corners'] = corners(alpha)
        elif name in WALL_ITEMS:
            entry['wall'] = {'face': WALL_FACES[name]} if name in WALL_FACES else wall_box(alpha)
        else:
            entry['base'] = base(alpha)
        mask, info = parts(img, LINE_L_BY.get(name, LINE_L), MAX_PARTS_BY.get(name, MAX_PARTS))
        Image.fromarray(mask, 'L').save(GAME / f'{name}_parts.png', optimize=True)
        name_parts(name, info)
        entry['parts'] = info
        meta[name] = entry
        print(f"{name}: {', '.join(p['name'] for p in info)}  " + json.dumps({k: v for k, v in entry.items() if k != 'parts'}))
    (GAME / 'sprites.json').write_text(json.dumps(meta, ensure_ascii=False, indent=1), encoding='utf-8')


if __name__ == '__main__':
    main()
