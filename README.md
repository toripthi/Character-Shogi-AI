# Character-Shogi-AI

人間らしい級位者NPCを目指す自作将棋AI。詳しくは [`docs/`](docs/) を見る。

- 概要・使い方: [`docs/README.md`](docs/README.md)
- 要件: [`docs/REQUIREMENTS.md`](docs/REQUIREMENTS.md)
- 設計判断: [`docs/DECISIONS.md`](docs/DECISIONS.md)

## 使い方

```sh
npm install
npm run demo      # 初期局面の合法手列挙デモ
npm run smoke     # 生存確認（壊れていないか）
npm test          # 回帰テスト（期待通りに指すか）
```

エンジン(`src/`)は Node / ブラウザ / Web Worker 共通のピュアなJS(ESM)。

## ライセンス / 帰属表示

本プロジェクトは [tsshogi](https://github.com/sunfish-shogi/tsshogi)
(MIT License, Copyright (c) 2023 Kubo, Ryosuke) を利用している。
詳細は `NOTICE-THIRD-PARTY.md` を参照。
