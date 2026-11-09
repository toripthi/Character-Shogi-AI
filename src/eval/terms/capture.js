/**
 * 手の項: 取る手への加減点（駒交換への態度。docs/specs/eval-2piece-spec-2026-11-09.md §7）。
 *
 * 局面ではなく「指し手」に対する項なので kind: "move"（retreat と同じ受け口）。
 * 取った駒の価値（style.pieceValues の、取った駒の型の値。持ち駒の割り増しや距離の割引は掛けない）を返す。
 * 取らない手は 0。重みは気質ごと（攻め +0.1 / バランス 0 / 守り -0.05）で、掛けて加減点にするのは呼び出し側
 * （selection の scoreRootMoves。実際に指すルートの手のスコアにだけ、margin 判定より前に足す）。
 * 探索の内部の局面評価には入れない。
 */
import { PIECE_SETS } from "../pieceSets.js";

export function captureTerm(board, move, style) {
  const captured = move.capturedPieceType;
  if (!captured) {
    return 0;
  }
  const values = style?.pieceValues ?? PIECE_SETS.kyuui;
  return values[captured] ?? 0;
}
