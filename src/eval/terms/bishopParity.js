/**
 * 評価項: 角の筋違い（減点）。筋違い角を避けるための項（2026-11-21 本人の指示で追加）。
 * （筋＋段）の和が奇数のマスにいる角（未成）に −90、馬に −5（馬は仮置き）。
 * 角の移動では和の偶奇が変わらず、初期位置（先手8八・後手2二）は和が偶数なので、
 * 奇数のマスの角は打ち込んだ角＝筋違い角である。意味の説明は参照実装のファイル先頭を見る。
 *
 * 駒リストを直接読む高速版。値は参照実装（src/eval/reference/terms/bishopParity.js）と同じ。
 */
import { IX_F, IX_R, BISHOP, HORSE } from "./fast.js";
import { referenceBishopParityTerm } from "../reference-link.js";

const BISHOP_PENALTY = 90; // 角（2026-11-21 に本人が −90 で確定）
const HORSE_PENALTY = 5; // 馬（仮置き）

export function bishopParityTerm(board) {
  const fb = board.fb;
  if (!fb) {
    return referenceBishopParityTerm(board);
  }
  const turn = fb.turnN;
  const cells = fb.board;
  let score = 0;
  for (let c = 0; c < 2; c++) {
    const pos = fb.piecePos[c];
    const n = fb.pieceCnt[c];
    let side = 0;
    for (let i = 0; i < n; i++) {
      const ix = pos[i];
      const t = cells[ix] & 15;
      if (t !== BISHOP && t !== HORSE) {
        continue;
      }
      if (((IX_F[ix] + IX_R[ix]) & 1) === 0) {
        continue; // 和が偶数のマスは罰なし
      }
      side -= t === BISHOP ? BISHOP_PENALTY : HORSE_PENALTY;
    }
    if (c === turn) {
      score += side;
    } else {
      score -= side;
    }
  }
  return score;
}
