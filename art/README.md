# 2D版の絵の作り方（画像生成AI）

2D版（斜め上から見る部屋）の住人と家具は、画像生成AI（ChatGPT の画像生成など）で作る。
作った画像は `art/source/` に置く。切り抜き・大きさ合わせ・組み込みは Claude Code が行う。

## 進め方

1. **お試し**: 下の「住人の一覧表」と「家具（ソファ・ベッド）」の 3 枚だけ作る。
2. Claude Code が部屋に組み込んで、見た目と向きのそろい方を確かめる。
3. 良ければ、残りの家具を同じ書き方で作る。

## 全部に共通する決まり

- **向き**: 斜め上から見下ろす「アイソメトリック（2:1）」。家具の正面は**左下**を向ける。右下向きは左右反転で作る。
  - 壁掛け（窓・絵）だけは例外で、**真正面から見た平らな絵**にする。ゲームが壁の角度に合わせて斜めに変形する。
- **背景**: 真っ赤や真っ白ではなく、**一色のマゼンタ（#FF00FF）**。透明はAIだと崩れやすいので、色を抜いて透明にする。
- **影**: 床に落ちる影は描かない（ゲームで付ける）。
- **大きさ**: 1024×1024 か、それ以上の正方形。
- **雰囲気**: 細い紺色の線、くすんだ落ち着いた色、アニメ調のイラスト。参考の絵（ヴァンプ子）をいっしょに渡す。
- **同じ会話の中で続けて作る**: 2 枚目以降は「前の絵と同じタッチで」と添えると、絵柄がそろいやすい。

## 1. 住人の一覧表（1 枚）

参考の絵（ヴァンプ子.png）を添付して、次の文を送る。

```
Use the attached illustration as the character design reference (purple wavy bob hair, pointed ears,
pale skin, red eyes, small fang, dark gothic dress with crimson ribbons and cravat, black tights).

Create a game sprite sheet of this character as a cute chibi with about 4-head-tall proportions,
full body, for an isometric (2:1, viewed from above at about 30 degrees) room game.
Arrange 8 poses in a 4 x 2 grid with generous equal spacing, each pose fully inside its cell:
Row 1: (1) standing, facing down-left  (2) walking step A, facing down-left
       (3) walking step B, facing down-left  (4) standing, facing up-right (back view)
Row 2: (5) sitting on an invisible seat, facing down-left (legs bent forward)
       (6) lying on her back asleep, eyes closed, head to the upper-left (seen from above at an angle)
       (7) happy smile with closed eyes, standing, facing down-left
       (8) waving one hand, facing down-left
Same character, same size and same scale in every cell.
Clean anime illustration: thin dark navy line art, flat muted colors with one soft shade tone,
small white highlights in the hair. No text, no frames, no grid lines, no floor, no shadows.
Background: one solid flat magenta color (#FF00FF) everywhere.
```

## 2. 家具（1 つにつき 1 枚）

住人と同じ会話の中で、次の文の `<家具の説明>` を入れ替えて送る。入れ替え済みの文は [prompts.md](prompts.md) にある。

```
Same art style as the previous image. Draw a single piece of furniture for the same isometric room game:
<家具の説明>
Isometric 2:1 view from above at about 30 degrees, the front of the furniture facing down-left.
Whole object visible and centered, nothing else in the image.
Thin dark navy line art, flat muted colors with one soft shade tone. No text, no floor, no shadow.
Background: one solid flat magenta color (#FF00FF) everywhere.
```

お試しの 2 つ:

| ファイル名 | `<家具の説明>` |
| --- | --- |
| `sofa.png` | a cozy three-seat fabric sofa in dusty sage green with two cushions and short dark wooden legs |
| `bed.png` | a single bed with a dark walnut wooden frame and headboard, white sheets, a pillow, and a dusty blue blanket folded back a little |

あとで作る家具（お試しが良ければ）:

| ファイル名 | `<家具の説明>` |
| --- | --- |
| `chair.png` | a simple wooden dining chair with a cushioned seat |
| `table.png` | a rectangular wooden dining table for four |
| `lowtable.png` | a small round dark wooden coffee table |
| `bookshelf.png` | a tall wooden bookshelf filled with neatly arranged books in muted colors |
| `wardrobe.png` | a tall cream-colored two-door wardrobe |
| `tvstand.png` | a low wooden TV stand with two drawers (without a TV) |
| `desk.png` | a wooden writing desk with one drawer |
| `nightstand.png` | a small bedside table with a drawer |
| `chest.png` | a wooden chest of drawers with three drawers |
| `plant.png` | a tall potted houseplant with long leaves in a terracotta pot |
| `lamp.png` | a floor lamp with a fabric shade |
| `rug.png` | a rectangular rug with a muted red and beige diamond pattern, lying flat on the floor |
| `tv.png` | a small flat-screen TV on a stand base |
| `mug.png` | a ceramic mug with steam |
| `vase.png` | a small vase with flowers |
| `picture.png`・`window.png`・`window2.png` | 壁掛けは**真正面から見た平らな絵**で作る。文は [prompts.md](prompts.md) の「壁掛け」 |

## できた絵

- 住人、家具 17 種類、小物（テレビ・花びん）、壁掛け（窓 2 種・絵）
- マグカップは、良い絵ができなかったので入れていない

## 置き場所

- `art/source/`: 生成したそのままの画像（上の表のファイル名で保存）。住人の一覧表は `resident.png`。
- `art/sprites/`: 切り抜いて大きさをそろえた画像（Claude Code が作る）。

## 決まっていること・制限

- 家具の向きは、まずは左下向きと右下向き（左右反転）の 2 つ。奥向き（背中側）は、必要になったら追加で作る。
- 家具の色は、部位ごとではなく、絵全体の色合い・明るさを変える形になる。
