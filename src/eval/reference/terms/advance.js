/**
 * 評価項: 前進PST（位置価値テーブル）。
 * 攻め屋は前進寄り（REQUIREMENTS §5.3）。
 * 段ベースの簡易テーブルで、玉には適用しない。
 * 符号は手番視点（自陣→敵陣への前進を加点）。
 * 初期配置の合計が0になるよう中央（5段）を0点にする。
 */
import { enemyOf, forEachPiece } from "./util.js";

function advanceBonus(rank, color) {
  // rank: 1〜9（1が先手から見て敵陣側）。中央5段を0として前進を加点。
  if (color === "black") {
    return (5 - rank) * 10;
  }
  return (rank - 5) * 10;
}

export function advanceTerm(board) {
  const turn = board.turn();
  const enemy = enemyOf(turn);
  let score = 0;
  forEachPiece(board, ({ piece, rank }) => {
    if (piece.type === "king") {
      return;
    }
    const b = advanceBonus(rank, piece.color);
    if (piece.color === turn) {
      score += b;
    } else if (piece.color === enemy) {
      score -= b;
    }
  });
  return score;
}
