/**
 * 評価項: 角・飛車の可動範囲（2026-11-20 実装、設計は 2026-11-12「飛車の横揺れ対策」）。
 * 角・飛車（と成った馬・龍）の「走り」で移動できるマス数の合計を、手番側 − 相手側で返す。
 *   - 数えるのは走りのマスだけ（馬・龍の1マス動きは含めない）。
 *   - 空きマスは数えて進む。敵の駒のあるマスは数えて止まる。自分の駒のあるマスは数えず止まる。
 * 移動できる範囲が大きい位置にいるほど加点され、無意味に端へ寄るのを抑える狙い。
 * 駒リストを直接読む高速版。値は参照実装（src/eval/reference/terms/mobility.js）と同じ。
 */
import { IX_F, IX_R, SQ_TO_IX, BISHOP, ROOK, HORSE, DRAGON, WHITE_BIT } from "./fast.js";
import { referenceMobilityTerm } from "../reference-link.js";

const DIAG = [
  [1, 1],
  [1, -1],
  [-1, 1],
  [-1, -1],
];
const ORTH = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

function mobilityOf(fb, c) {
  const cells = fb.board;
  const pos = fb.piecePos[c];
  const n = fb.pieceCnt[c];
  const whiteBit = c === 1 ? WHITE_BIT : 0;
  let total = 0;
  for (let i = 0; i < n; i++) {
    const ix = pos[i];
    const t = cells[ix] & 15;
    const dirs = t === BISHOP || t === HORSE ? DIAG : t === ROOK || t === DRAGON ? ORTH : null;
    if (!dirs) {
      continue;
    }
    const f0 = IX_F[ix];
    const r0 = IX_R[ix];
    for (const [df, dr] of dirs) {
      let f = f0 + df;
      let r = r0 + dr;
      while (f >= 1 && f <= 9 && r >= 1 && r <= 9) {
        const cell = cells[SQ_TO_IX[f * 10 + r]];
        if (cell === 0) {
          total++;
        } else {
          if ((cell & WHITE_BIT) !== whiteBit) {
            total++; // 敵の駒のあるマスは数えて止まる
          }
          break;
        }
        f += df;
        r += dr;
      }
    }
  }
  return total;
}

export function mobilityTerm(board) {
  const fb = board.fb;
  if (!fb) {
    return referenceMobilityTerm(board);
  }
  const turn = fb.turnN;
  return mobilityOf(fb, turn) - mobilityOf(fb, turn ^ 1);
}
