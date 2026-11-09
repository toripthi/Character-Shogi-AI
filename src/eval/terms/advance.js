/**
 * 評価項: 前進PST（位置価値テーブル）。
 * 攻め屋は前進寄り（REQUIREMENTS §5.3）。
 * 段ベースの簡易テーブルで、玉には適用しない。
 * 符号は手番視点（自陣→敵陣への前進を加点）。
 * 初期配置の合計が0になるよう中央（5段）を0点にする。
 *
 * 2026-11-05：駒リストを直接読む高速版。値は参照実装（src/eval/reference/terms/advance.js）と同じ。
 * 2026-11-09 改修（docs/specs/eval-2piece-spec-2026-11-09.md §9）：加点に敵玉との距離係数を掛ける
 *   （飛・角・馬・龍は掛けない）。意味の説明は参照実装のファイル先頭を見る。
 */
import { IX_F, IX_R, KING, BISHOP, ROOK, HORSE, DRAGON } from "./fast.js";
import { ATTACK_PCT } from "../proximity.js";
import { referenceAdvanceTerm } from "../reference-link.js";

// 遠くから利く駒（距離係数を掛けない）の型の集合（ビット）
let LONG_MASK = 0;
for (const t of [BISHOP, ROOK, HORSE, DRAGON]) {
  LONG_MASK |= 1 << t;
}

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
    const enemyKing = fb.kingSq[c ^ 1];
    const ekf = enemyKing >= 0 ? IX_F[enemyKing] : 0;
    const ekr = enemyKing >= 0 ? IX_R[enemyKing] : 0;
    let side = 0;
    for (let i = 0; i < n; i++) {
      const ix = pos[i];
      const t = cells[ix] & 15;
      if (t === KING) {
        continue;
      }
      // rank: 1〜9（1が先手から見て敵陣側）。中央5段を0として前進を加点。
      const rank = IX_R[ix];
      const b = c === 0 ? (5 - rank) * 10 : (rank - 5) * 10;
      let pct = 100;
      if (((LONG_MASK >> t) & 1) === 0 && enemyKing >= 0) {
        pct = ATTACK_PCT[Math.max(Math.abs(IX_F[ix] - ekf), Math.abs(rank - ekr))];
      }
      side += b * pct;
    }
    if (c === turn) {
      score += side;
    } else {
      score -= side;
    }
  }
  return score / 100;
}
