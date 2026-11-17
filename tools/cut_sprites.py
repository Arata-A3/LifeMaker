"""art/source の画像から背景のマゼンタを抜き、絵の部分だけを切り出して art/sprites に PNG で保存する。

使い方: python tools/cut_sprites.py
- 家具: 1 枚に 1 つ。いちばん大きなまとまりの周りで切り抜く。
- 住人（resident.*）: 4 列 × 2 行の一覧表。1 人ずつ切り出し、resident_1.png 〜 resident_8.png にする。
  足元をそろえるため、同じ大きさのキャンバスに「下端中央」をそろえて置く。
"""
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / 'art' / 'source'
OUT = ROOT / 'art' / 'sprites'
# マゼンタらしさ（R と B の小さい方 − G）。これより大きいと背景、小さいと絵
KEY_HI, KEY_LO = 150, 70
RESIDENT_GRID = (4, 2)


def key_out(img: Image.Image) -> Image.Image:
    a = np.asarray(img.convert('RGB')).astype(np.float32)
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    m = np.minimum(r, b) - g
    alpha = np.clip((KEY_HI - m) / (KEY_HI - KEY_LO), 0, 1)
    # 背景と離れた小さなゴミを消し、絵の中の穴（背景と同じ色）は残す
    solid = alpha > 0.5
    lab, n = ndimage.label(solid)
    if n:
        sizes = ndimage.sum(solid, lab, range(1, n + 1))
        keep = np.isin(lab, np.nonzero(sizes >= max(200, sizes.max() * 0.02))[0] + 1)
        keep = ndimage.binary_dilation(keep, iterations=3)
        alpha = alpha * keep
    # ふちに残ったマゼンタの色かぶりを取る
    spill = np.clip(m, 0, None) * (1 - alpha)
    r2 = np.clip(r - spill, 0, 255)
    b2 = np.clip(b - spill, 0, 255)
    out = np.dstack([r2, g, b2, alpha * 255]).astype(np.uint8)
    return Image.fromarray(out, 'RGBA')


def crop(img: Image.Image, pad=4) -> Image.Image:
    a = np.asarray(img)[..., 3]
    ys, xs = np.nonzero(a > 24)
    if not len(xs):
        return img
    return img.crop((max(0, xs.min() - pad), max(0, ys.min() - pad), min(img.width, xs.max() + pad + 1), min(img.height, ys.max() + pad + 1)))


def cut_resident(path: Path):
    """一覧表から 1 人ずつ切り出す。マス目ではなく「つながった絵のまとまり」で分ける
    （寝ている絵のように、となりのマスにはみ出すものがあるため）。並びは上の段から左→右。"""
    img = key_out(Image.open(path))
    alpha = np.asarray(img)[..., 3] > 128
    # 髪の毛先などで少し離れた部分も、同じ人としてつなげる
    lab, n = ndimage.label(ndimage.binary_dilation(alpha, iterations=6))
    sizes = ndimage.sum(alpha, lab, range(1, n + 1))
    big = [i + 1 for i in np.argsort(sizes)[::-1][:RESIDENT_GRID[0] * RESIDENT_GRID[1]] if sizes[i] > sizes.max() * 0.1]
    blobs = []
    for k in big:
        ys, xs = np.nonzero(lab == k)
        blobs.append((ys.mean(), xs.mean(), k, xs.min(), ys.min(), xs.max(), ys.max()))
    rows = RESIDENT_GRID[1]
    blobs.sort(key=lambda b: (int(b[0] / (img.height / rows)), b[1]))
    cells = []
    arr = np.asarray(img).copy()
    for _, _, k, x0, y0, x1, y1 in blobs:
        part = arr.copy()
        part[..., 3] = np.where(lab == k, part[..., 3], 0) # ほかの人の部分は消す
        cells.append(crop(Image.fromarray(part, 'RGBA').crop((x0, y0, x1 + 1, y1 + 1))))
    # 同じ大きさのキャンバスに、下端中央をそろえて置く（足元が原点になる）
    W = max(c.width for c in cells) + 8
    H = max(c.height for c in cells) + 8
    for i, c in enumerate(cells, 1):
        canvas = Image.new('RGBA', (W, H))
        canvas.paste(c, ((W - c.width) // 2, H - c.height - 4), c)
        canvas.save(OUT / f'resident_{i}.png')
    print(f'resident: {len(cells)} pieces ({W}x{H})')


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    for path in sorted(SRC.iterdir()):
        if path.suffix.lower() not in ('.png', '.jpg', '.jpeg', '.webp'):
            continue
        if path.stem == 'resident':
            cut_resident(path)
            continue
        img = crop(key_out(Image.open(path)))
        img.save(OUT / f'{path.stem}.png')
        print(f'{path.stem}: {img.width}x{img.height}')


if __name__ == '__main__':
    main()
