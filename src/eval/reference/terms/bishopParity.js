/**
 * 評価項: 角の筋違い（減点）。筋違い角を避けるための項（2026-11-21 本人の指示で追加）。
 *
 * 角は斜めにしか動けないため、移動では（筋＋段）の偶奇が変わらない。初期位置は先手8八・
 * 後手2二でどちらも和が偶数なので、和が奇数のマスにいる角は「打ち込んだ角」でしかあり
 * えない＝いわゆる筋違い角。その位置にいること自体へ罰を与える。
 *   - 対象は盤上の角（未成）と馬。和が偶数のマスは罰なし。
 *   - 罰点：角 −90（2026-11-21 に本人が確定。−40 の実験で角交換直後の B*6e 型を
 *     覆すには −85 超が必要と測れたため）、馬 −5（仮置き。かなり軽めの罰。馬は1マス動きで
 *     パリティの違うマスへも移れるため影響が小さい）。
 *   - 符号は手番視点（自分の罰合計 − 相手の罰合計）。重みは既定 1（罰点をそのまま使う。
 *     kingAdvance と同じ持ち方）で、全棋風に効く。
 */
import { enemyOf, forEachPiece } from "./util.js";

export const BISHOP_PARITY_PENALTY = 90; // 角（2026-11-21 に本人が −90 で確定）
export const HORSE_PARITY_PENALTY = 5; // 馬（仮置き）

export function bishopParityTerm(board) {
  const turn = board.turn();
  const enemy = enemyOf(turn);
  let score = 0;
  forEachPiece(board, ({ piece, file, rank }) => {
    if (piece.type !== "bishop" && piece.type !== "horse") {
      return;
    }
    if ((file + rank) % 2 === 0) {
      return; // 和が偶数のマスは罰なし
    }
    const p = piece.type === "bishop" ? BISHOP_PARITY_PENALTY : HORSE_PARITY_PENALTY;
    if (piece.color === turn) {
      score -= p;
    } else if (piece.color === enemy) {
      score += p;
    }
  });
  return score;
}
