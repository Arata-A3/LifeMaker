"""art/sheets.json から、3×3 にまとめて描いてもらうプロンプトを作り、art/sheet_prompts.md に書く。

使い方: python tools/sheet_prompt.py

色を部位ごとにきれいに変えられるように、部位ごとに 1 色のべた塗り（同じ色の少し暗い影だけ可）で描かせる。
部位の名前と色は sheets.json の parts（[名前, 色の説明, 色の値]）。色の値は、切り出した部位に名前を付けるときに使う（いちばん近い色の部位の名前にする）。ゲームの「色」の部位の名前にもなる。
"""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SHEETS = ROOT / 'art' / 'sheets.json'
OUT = ROOT / 'art' / 'sheet_prompts.md'
POS = ['top left', 'top center', 'top right', 'middle left', 'center', 'middle right', 'bottom left', 'bottom center', 'bottom right']

COLOR_RULES = """COLOR RULES (very important, the game recolors each part separately):
- Each object is made only of the parts listed for it. Fill each part with ONE flat color as listed.
  The only extra allowed is ONE slightly darker shade of the same color for soft shading.
- Different parts must have clearly different colors (a different hue or a very different brightness).
- Every part is surrounded by the thin dark navy outline, so parts never blend into each other.
- Never fill a part with black or a color as dark as the outline (keep fills clearly lighter than the outline).
- No gradients, no textures, no patterns inside a part, no noise, no tiny details, no sparkles,
  no highlights in other colors, no text, no letters, no numbers."""

HEAD = {
    'wall': """Same art style as the previous images (thin dark navy line art, flat muted colors, cute and calm).
Draw a sprite sheet of 9 separate wall decorations for a cozy room game, arranged in a 3 x 3 grid.
VIEW: every object is drawn straight-on from the front, like a flat scan: orthographic, perfectly upright,
NO perspective, NO isometric angle, NO depth, NO side faces, NO thickness. Rectangular frames have perfectly
horizontal top and bottom edges and perfectly vertical sides.""",
    'rug': """Same art style as the previous images (thin dark navy line art, flat muted colors, cute and calm).
Draw a sprite sheet of 9 separate rugs and mats for a cozy room game, arranged in a 3 x 3 grid.
VIEW: every rug is seen from directly above (top-down), perfectly flat, NO perspective, NO isometric angle,
NO thickness, NO tassels or fringe. Rectangular rugs are perfectly axis-aligned rectangles with exactly the given proportions.""",
}
TAIL = """LAYOUT: each object is centered in its own cell, as large as possible but with clear magenta space around it.
Objects never touch each other or the cell edges. No grid lines, no labels, no shadows, no wall, no floor.
Background: one solid flat magenta color (#FF00FF) everywhere."""


def size_text(kind, it):
    if kind == 'rug':
        w, d = it['size']
        return f'proportions width:length = {w}:{d}' if w != d else 'square proportions'
    return f'proportions width:height = {it["ratio"]}'


def prompt(name, sheet):
    kind = sheet['kind']
    lines = [HEAD[kind], '', 'OBJECTS (left to right, top to bottom):']
    for i, it in enumerate(sheet['items']):
        parts = '; '.join(p[1] for p in it['parts'])
        lines.append(f'{i + 1}. ({POS[i]}) {it["draw"]}. {size_text(kind, it)}. Parts and colors: {parts}.')
    lines += ['', COLOR_RULES, '', TAIL]
    return '\n'.join(lines)


def main():
    sheets = json.loads(SHEETS.read_text(encoding='utf-8'))
    md = ['# まとめて描く絵（3×3）のプロンプト', '',
          'このファイルは `python tools/sheet_prompt.py` で [sheets.json](sheets.json) から作る（手で直さない）。',
          '住人・家具と同じ ChatGPT の会話に貼る。できた絵は `art/source/<名前>.png` に保存する（例: `art/source/wall_1.png`）。',
          '9 個のうち崩れた物があっても、切り出したあとに直せる（ほかの物は使える）。', '']
    for name, sheet in sheets.items():
        md += [f'## {name}（{sheet.get("note", "")}） → `art/source/{name}.png`', '']
        md += ['| 場所 | アイテム | 部位 |', '| --- | --- | --- |']
        for i, it in enumerate(sheet['items']):
            md.append(f'| {i // 3 + 1} 段目 {i % 3 + 1} 番 | {it["name"]}（`{it["id"]}`） | {"・".join(p[0] for p in it["parts"])} |')
        md += ['', '```', prompt(name, sheet), '```', '']
    OUT.write_text('\n'.join(md), encoding='utf-8')
    print(f'art/sheet_prompts.md: {len(sheets)} sheets')


if __name__ == '__main__':
    main()
