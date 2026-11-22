# DOCUMENTATION：文書の地図

文書の役割と、種類ごとにどこへ書くかを定める。この地図にない置き場は作らない。

## 役割の定義

- **正本**：従うべき内容を置く。要件と決定はここだけが正本。
- **ガイド**：現行の使い方・進め方の説明を置く。決定の根拠にはならない。
- **計画**：作業中の計画・指示・未決定事項を置く。決定の根拠にはならない。計画の中で決めた事項は、DECISIONS.md に移して初めて決定になる。
- **記録**：経緯・作業記録・測定結果を置く。時点の記録であり、現行仕様として引用しない。

## 文書の一覧

### 正本

| 文書 | 内容 |
|---|---|
| `REQUIREMENTS.md` | 要件（何を作るか） |
| `DECISIONS.md` | 現行の設計決定（どう作ると決めたか） |
| `DOCUMENTATION.md` | 文書の役割と置き場（本書） |

### ガイド

| 文書 | 内容 |
|---|---|
| `../README.md` | リポジトリの入口（概要と正本への案内） |
| `README.md` | 概要・使い方 |
| `BOOK-KIF-GUIDE.md` | 定跡 KIF の書き方（人間用） |

### 計画

| 文書 | 内容 |
|---|---|
| `OPEN-ISSUES.md` | 未決定・不明点の一覧。決定ではない |
| `WEB-UI-PLAN.md` | Web UI の計画と進捗 |
| `NODE-BUDGET-DESIGN.md` | ノード数予算の設計メモ |
| `PHASE4-INSTRUCTIONS.md` | Phase 4 の実装指示書 |
| `PHASE4-PATCH-2026-10-09.md` | Phase 4 指示書への差分 |
| `TEST-INSTRUCTIONS-castle-fix.md` | テスト指示書（保留・実施見送り） |

### 記録

| 文書 | 内容 |
|---|---|
| `DECISIONS-ARCHIVE.md` | 置換・廃止された決定と、その経緯の全文 |
| `specs/eval-2piece-spec-2026-11-09.md` | 当時の改修指示書（決定事項は `DECISIONS.md` へ移行済み） |
| `specs/plan-king-spec-2026-11-10.md` | 当時の実装指示書（決定事項は `DECISIONS.md` へ移行済み） |
| `PLAN.md` | 手順テンプレート層の作業・観測の記録（冒頭に形式の説明を含む） |
| `PHASE4-REPORT.md` | Phase 4 の完了報告 |
| `REPORT-plan-king-2026-11-10.md` | 実装の完了報告 |
| `REVIEW-2026-10-17.md` | レビュー報告 |
| `REVIEW-PACKET.md` | レビュー用の作業資料 |
| `PHASE2-NOTES.md` | Phase 2 の計測メモ |
| `PHASE3-NOTES.md` | Phase 3 の計測メモ |
| `BENCH.md` | 速度の基準測定 |
| `BENCH-CORE.md` | 盤面コアの基準測定 |
| `BENCH-PLAY.md` | 実戦経路の測定記録 |
| `BENCH-SEARCH.md` | 探索の基準測定 |
| `bench-play.json`・`bench-presets.json`・`bench-search-baseline.json`・`bench-search-step3a.json`・`bench-search-step3b.json`・`bench-search-step3c.json` | 測定の生データ |
| `proposals/proto-prune.mjs`・`proposals/root-prune.patch` | 検討時の試作物 |

## 書く場所のルール

- 決定は `DECISIONS.md` にだけ、規則の形で書く。他の文書に決定を書かない。
- 要件は `REQUIREMENTS.md` に書く。
- 未決定・不明点は `OPEN-ISSUES.md` に置く。決まったら `OPEN-ISSUES.md` から消して `DECISIONS.md` に移す。
- 経緯・作業記録・測定結果は記録の文書に置く。`DECISIONS.md` と `REQUIREMENTS.md` には書かない。
- 使い方の説明はガイドに書く。作業の計画・指示は計画の文書に書く。
- 新しい文書を作る前に、この地図で置き場を確認する。合う置き場がなければ勝手に作らず、まずこの地図を改訂して置き場を定める。
- 文書を作った・廃止した・改名した・統合したら、この地図も同時に直す。

## 優先順位と食い違いのルール

- 通常の参照先は正本（`REQUIREMENTS.md`、`DECISIONS.md`）とする。ただし正本にも修正漏れがありうるため、食い違いが見つかったときに正本が常に正しいとは扱わない。
- コードと正本が食い違ったら、どちらが正しいか決めつけない。まず記録（`DECISIONS-ARCHIVE.md` や経緯の記録）と照らし合わせ、原因（コードの誤りか、正本の修正漏れか、記録の時点差か）を整理した上で、ユーザーに確認する。
- ユーザーの確認が取れるまで、コードを正本に合わせて戻したり、正本をコードに合わせて書き換えたりしない。
- 正本と、計画・記録・ガイドの記述が食い違った場合も同じとする。記録側の記述が正本の修正漏れを示している可能性があるときは、照合してユーザーに確認する。
- `REQUIREMENTS.md` と `DECISIONS.md` が食い違うときは、どちらか一方で解釈せず、食い違いを `OPEN-ISSUES.md` に課題として立てる。

## 書き方のルール

- 正本には規則だけを書く。経緯・日付・由来・測定値・作業の完了報告は書かない（記録に置く）。
- 記録には時点が分かるように書き、現行仕様の体裁で書かない。
- 計画には、決まっていることと未決定のことを区別して書く。

## 既存文書の注記（役割と現状のずれ）

- `PLAN.md`：冒頭は手順テンプレート層の仕様説明だが、大半は日付単位の作業・観測の記録である。現行仕様の正本ではない。「居飛車の手順テンプレートはない」など、時点の状態を述べた記述が現行と食い違う場合がある。
- `WEB-UI-PLAN.md`：「決めたこと」の節など、決定の体裁で書かれた箇所がある。現行の決定は `DECISIONS.md` が正本であり、本書の記述は決定として引用しない。
- `NODE-BUDGET-DESIGN.md`：実装の前提になる選択を、決定の体裁でまとめている。現行の決定は `DECISIONS.md` が正本である。
- `PHASE4-PATCH-2026-10-09.md`：「確定事項（ユーザー決定）」と決定の体裁で書かれている。現行の決定は `DECISIONS.md` が正本である。
- `specs/` の指示書2本：当時の実装指示書である。決定事項は `DECISIONS.md` へ移行済みであり、本書は当時の指示の記録として扱う。現行仕様の正本は `REQUIREMENTS.md` と `DECISIONS.md` である。
- `BOOK-KIF-GUIDE.md`：冒頭で `DECISIONS.md` の旧番号（振り直し前）を参照している。現行の決定番号は `DECISIONS.md` 末尾の対応表で読み替える。
- `README.md`（docs/ 内）：Phase 構成などに、初期時点の記述のまま残っている部分がある。
