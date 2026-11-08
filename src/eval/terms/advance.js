/**
 * 評価項: 前進PST（位置価値テーブル）。
 * 攻め屋は前進寄り（REQUIREMENTS §5.3）。
 * 段ベースの簡易テーブルで、玉には適用しない。
 * 符号は手番視点（自陣→敵陣への前進を加点）。
 * 初期配置の合計が0になるよう中央（5段）を0点にする。
 *
 * 2026-11-05：駒リストを直接読む高速版。値は最適化前の実装（src/eval/reference/terms/advance.js）と同じ。
 */
import { IX_R, KING } from "./fast.js";
import { referenceAdvanceTerm } from "../reference-link.js";

export function advanceTerm(board) {
  const fb = board.fb;
  if (!fb) {
    return referenceAdvanceTerm(board);
  }
  const turn = fb.turnN;
  const cells = fb.board;
  let score = 0;
  for (let c = 0; c < 2; c++) {
    const pos = fb.piecePos[c];
    const n = fb.pieceCnt[c];
    for (let i = 0; i < n; i++) {
      const ix = pos[i];
      if ((cells[ix] & 15) === KING) {
        continue;
      }
      // rank: 1〜9（1が先手から見て敵陣側）。中央5段を0として前進を加点。
      const rank = IX_R[ix];
      const b = c === 0 ? (5 - rank) * 10 : (rank - 5) * 10;
      if (c === turn) {
        score += b;
      } else {
        score -= b;
      }
    }
  }
  return score;
}
