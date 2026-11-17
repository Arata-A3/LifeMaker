# まとめて描く絵（3×3）のプロンプト

このファイルは `python tools/sheet_prompt.py` で [sheets.json](sheets.json) から作る（手で直さない）。
住人・家具と同じ ChatGPT の会話に貼る。できた絵は `art/source/<名前>.png` に保存する（例: `art/source/wall_1.png`）。
9 個のうち崩れた物があっても、切り出したあとに直せる（ほかの物は使える）。

## wall_1（壁掛け（正面の絵）。窓・アーチ窓・絵は、前の斜めの絵と置き換わる） → `art/source/wall_1.png`

| 場所 | アイテム | 部位 |
| --- | --- | --- |
| 1 段目 1 番 | 絵（風景）（`picture`） | 額縁・空・丘 |
| 1 段目 2 番 | 窓（`window`） | カーテン・窓枠・ガラス |
| 1 段目 3 番 | 窓（アーチ）（`window2`） | 窓枠・ガラス |
| 2 段目 1 番 | 山のポスター（`poster_mountain`） | 背景・山・枠と太陽 |
| 2 段目 2 番 | ねこのポスター（`poster_cat`） | 背景・ねこ・枠 |
| 2 段目 3 番 | 月と星のポスター（`poster_moon`） | 夜空・月と星・枠 |
| 3 段目 1 番 | 壁かけ時計（`clock`） | 文字盤・枠・針 |
| 3 段目 2 番 | 鏡（`mirror`） | 鏡・枠 |
| 3 段目 3 番 | ガーランド（`garland`） | 旗 1・旗 2・ひも |

```
Same art style as the previous images (thin dark navy line art, flat muted colors, cute and calm).
Draw a sprite sheet of 9 separate wall decorations for a cozy room game, arranged in a 3 x 3 grid.
VIEW: every object is drawn straight-on from the front, like a flat scan: orthographic, perfectly upright,
NO perspective, NO isometric angle, NO depth, NO side faces, NO thickness. Rectangular frames have perfectly
horizontal top and bottom edges and perfectly vertical sides.

OBJECTS (left to right, top to bottom):
1. (top left) a framed landscape painting of rolling hills under the sky. proportions width:height = 4:3. Parts and colors: dark walnut brown frame; pale blue sky; sage green hills.
2. (top center) a rectangular wooden window with a cross-shaped mullion and curtains tied back on both sides, the curtains hanging inside the frame. proportions width:height = 4:3. Parts and colors: muted red curtains; dark brown wooden frame; light blue glass.
3. (top right) a tall arched gothic window: the arch is at the top, the sides and the bottom are straight. proportions width:height = 2:3. Parts and colors: dark brown wooden frame; night blue glass.
4. (middle left) a simple graphic poster of a mountain silhouette with a round sun, in a thin frame. proportions width:height = 3:4. Parts and colors: cream background; dusty teal mountain; mustard yellow frame and sun.
5. (center) a simple graphic poster of a sitting cat silhouette, in a thin frame. proportions width:height = 3:4. Parts and colors: dusty pink background; soft warm gray cat; light wood frame.
6. (middle right) a simple graphic poster of a crescent moon and a few stars, in a thin frame. proportions width:height = 3:4. Parts and colors: dusty indigo night sky; pale gold moon and stars; warm gray frame.
7. (bottom left) a round wall clock with simple hour marks (lines, no numbers) and two hands. proportions width:height = 1:1. Parts and colors: off-white clock face; dark green rim; cocoa brown hands and marks.
8. (bottom center) an oval wall mirror with a simple frame. proportions width:height = 2:3. Parts and colors: pale silver blue mirror glass; antique gold frame.
9. (bottom right) a bunting garland: a gently sagging string with seven small triangle flags in two alternating colors. proportions width:height = 3:1. Parts and colors: dusty rose flags; sage green flags; beige string.

COLOR RULES (very important, the game recolors each part separately):
- Each object is made only of the parts listed for it. Fill each part with ONE flat color as listed.
  The only extra allowed is ONE slightly darker shade of the same color for soft shading.
- Different parts must have clearly different colors (a different hue or a very different brightness).
- Every part is surrounded by the thin dark navy outline, so parts never blend into each other.
- Never fill a part with black or a color as dark as the outline (keep fills clearly lighter than the outline).
- No gradients, no textures, no patterns inside a part, no noise, no tiny details, no sparkles,
  no highlights in other colors, no text, no letters, no numbers.

LAYOUT: each object is centered in its own cell, as large as possible but with clear magenta space around it.
Objects never touch each other or the cell edges. No grid lines, no labels, no shadows, no wall, no floor.
Background: one solid flat magenta color (#FF00FF) everywhere.
```

## rug_1（敷物（真上から見た絵）） → `art/source/rug_1.png`

| 場所 | アイテム | 部位 |
| --- | --- | --- |
| 1 段目 1 番 | しま模様のラグ（`rug_stripe`） | 地・しま |
| 1 段目 2 番 | 丸いラグ（`rug_round`） | 地・ふち |
| 1 段目 3 番 | チェックのラグ（`rug_check`） | マス 1・マス 2 |
| 2 段目 1 番 | ひし形のラグ（`rug_diamond`） | 地・ひし形・ふち |
| 2 段目 2 番 | 花柄のラグ（`rug_flower`） | 地・花・花の中 |
| 2 段目 3 番 | 細長いラグ（`rug_runner`） | 地・ジグザグ |
| 3 段目 1 番 | 波のラグ（`rug_wave`） | 地・波 |
| 3 段目 2 番 | 小さなマット（`mat_small`） | 地・ふち |
| 3 段目 3 番 | 丸いマット（`mat_round`） | 外側・内側 |

```
Same art style as the previous images (thin dark navy line art, flat muted colors, cute and calm).
Draw a sprite sheet of 9 separate rugs and mats for a cozy room game, arranged in a 3 x 3 grid.
VIEW: every rug is seen from directly above (top-down), perfectly flat, NO perspective, NO isometric angle,
NO thickness, NO tassels or fringe. Rectangular rugs are perfectly axis-aligned rectangles with exactly the given proportions.

OBJECTS (left to right, top to bottom):
1. (top left) a rectangular rug with wide stripes running along its length. proportions width:length = 3:4. Parts and colors: oatmeal beige base; terracotta stripes.
2. (top center) a round rug with one plain ring border. square proportions. Parts and colors: dusty blue base; cream ring border.
3. (top right) a rectangular rug with a large simple checkerboard pattern. proportions width:length = 3:4. Parts and colors: ivory squares; moss green squares.
4. (middle left) a rectangular rug with a row of large diamonds in the middle and a plain border. proportions width:length = 3:4. Parts and colors: muted red base; beige diamonds; dark brown border.
5. (center) a square rug with five large simple flower shapes. square proportions. Parts and colors: soft lavender base; white flowers; mustard yellow flower centers.
6. (middle right) a long narrow runner rug with a simple zigzag line along its length. proportions width:length = 1:4. Parts and colors: slate gray base; cream zigzag.
7. (bottom left) a rectangular rug with three simple wavy bands. proportions width:length = 2:3. Parts and colors: sand beige base; teal waves.
8. (bottom center) a small rectangular doormat with a plain border. proportions width:length = 2:1. Parts and colors: warm brown base; dark brown border.
9. (bottom right) a small round braided mat with two rings. square proportions. Parts and colors: mustard yellow outer ring; rust orange center.

COLOR RULES (very important, the game recolors each part separately):
- Each object is made only of the parts listed for it. Fill each part with ONE flat color as listed.
  The only extra allowed is ONE slightly darker shade of the same color for soft shading.
- Different parts must have clearly different colors (a different hue or a very different brightness).
- Every part is surrounded by the thin dark navy outline, so parts never blend into each other.
- Never fill a part with black or a color as dark as the outline (keep fills clearly lighter than the outline).
- No gradients, no textures, no patterns inside a part, no noise, no tiny details, no sparkles,
  no highlights in other colors, no text, no letters, no numbers.

LAYOUT: each object is centered in its own cell, as large as possible but with clear magenta space around it.
Objects never touch each other or the cell edges. No grid lines, no labels, no shadows, no wall, no floor.
Background: one solid flat magenta color (#FF00FF) everywhere.
```
