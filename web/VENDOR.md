# web/ の流用元（shogi-kifu-narabe）

盤・持ち駒の描画は、ユーザーの別プロジェクト **shogi-kifu-narabe**（棋譜並べPWA）から取り込んだ。
2026-11-07 時点の複製で、**無改変**。改変せずに保つのは、元の修正（盤サイズ・駒の切り出しなど）を後から取り込みやすくするため。
手を入れたいときは、複製を直さずに `js/main.js`・`js/layout.js`・`css/app.css`（この repo 独自）側で上書き・包む。どうしても直すときはこの表のハッシュも更新する（`npm test` が不一致を検出する）。

| 取り込んだもの | sha256 |
|---|---|
| `js/assets/asset-fit.js` | `48d8b261064413f9631ad7ffa38de8bf976b4d7b17857db9da05e4aeafefffaa` |
| `js/assets/asset-manifest.js` | `64198cf9a757517b24729c14bbcd48232bbf05c9e02d03d32edcc3ea7ac716e7` |
| `js/assets/layout-loader.js` | `6f61fa9ae4c3f5afdbadf0fff9549fc4e0e0c2b7d9296879a7d84481983c19f8` |
| `js/ui/board-view.js` | `e8b22f9d7fffb6607dfeec7d16371218a7998f2a98c9d8bc7a7eb731b8993a08` |
| `js/ui/player-info.js` | `25de68abc754f3d9b3cf62328a799bf220b522b78423fa71348b52559cebf6ce` |
| `js/models/board.js` | `81eb732062b960dfad6499611345c70da225d948be81e052331dfa20e5111603` |
| `js/models/kifu.js` | `2509bf41ffaa3924586bbc5470557e515b6e0be15ea1b663607d4f00847186f2` |
| `js/core/apply-move.js` | `2e06fe7d440045f3ae1c1a982053ca911c5117429a54590f2f9350583819f9ee` |
| `js/models/move.js` | `5ab63c7a803c2f72b605697d01caf173f25c7676e017a1ec909551049a898e2f` |
| `assets/layout/board-layout.json` | `315e21fda789b8134f5710a93b6f4a710505782becef08cfdb891acfbc5d2b67` |
| `assets/layout/piece-layout.json` | `c108ed2ce1ecb6f0e0113e3834efac488b993a2feddf813c451ab08bbffd6d42` |
| `assets/layout/piece-fit.json` | `67275ddb11027db967f087b614133ec57cdbda344dcf1763c7f52065e8017e53` |
| `assets/boards/wood.avif` | `a6350a15c4ea72692f51df1d48d45c8fa376f88af436aa4839fdc7489fbe9a7c` |
| `assets/pieces/maki_ryoko_1_letter.avif` | `fc1f069ea0aa0e4942e5e71e133e0a17ae016a2373bd2df5494534b4a4638b55` |
| `css/style.css[328-533] -> css/vendor-player-info.css` | `db9b590f24a1870fbe3050ce51614a5f0ba733a3f9c944c99ad7ba7fe8b40f33` |
| `css/style.css[534-705] -> css/vendor-board.css` | `c63d94bd4f247c67f7b5784d22cabb6359696e47cc9b72fa33e0e97e99515840` |

## 取り込み方
- JS は元の相対 import が通るよう、`js/assets/`・`js/ui/`・`js/models/` の構成をそのまま保つ。
- CSS は元の `css/style.css` から節ごとに行範囲で切り出し（③⑤ プレイヤー情報・持ち駒 / ④ 盤面）。先頭の2行のコメントだけ追記している（ハッシュは追記を除いた本体）。
- `assets/layout/assets-manifest.json` だけは、盤 wood と駒 maki_ryoko_1_letter の2件に絞った版（元の参照先画像を持ち込まないため）。
- この repo で新規に書いた: `index.html`・`css/app.css`・`js/main.js`・`js/layout.js`。

## 未取り込み（必要になった段階で）
- 手の入力（`ui/selection.js`・`core/nari-judge.js`・`ui/nari-popup.js`）は **取り込まないことにした**（D-036。合法手で判定する `game/input.js` と `ui/promotion-popup.js` を独自に書いた）
- 他の盤・駒セット、アセット切替UI、棋譜まわり、PWA（`service-worker.js`・`manifest`）

## 素材のライセンス（要確認）
`assets/boards/wood.avif` と `assets/pieces/maki_ryoko_1_letter.avif` の出典・利用条件は、流用元の docs にも「要確認」としか書かれていない（`docs/requirements.md` 8.3）。公開・配布する前に出典を確認し、`NOTICE-THIRD-PARTY.md` に記載すること。
