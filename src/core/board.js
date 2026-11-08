/**
 * Phase B-5: 盤面コアを自前実装（fastboard）に差し替えた窓口。
 *
 * 公開 API（legalMoves / makeMove / unmakeMove / isGameOver / pieceAt / hand /
 * turn / inCheck / sfen / makeMoveByUSI / countAttackers / attackCounts の 12
 * メソッド）は、tsshogi 版（`src/core/board-tsshogi.js` に退避・オラクルとして
 * 残す）と名前・引数・戻り値の形が同一。
 *
 * tsshogi をオラクルに使う厳密な一致検証は `scripts/verify-fastboard.js` と
 * `test/core/fastboard.test.js`（オラクルは board-tsshogi.js を import）で行う。
 * 速度の前後比較は `scripts/bench-core.js`（`docs/BENCH-CORE.md`）。
 */
export { ShogiBoardFast as ShogiBoard, INITIAL_SFEN } from "./fastboard.js";
