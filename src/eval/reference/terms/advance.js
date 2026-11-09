/**
 * 評価項: 前進PST（位置価値テーブル）。
 * 攻め屋は前進寄り（REQUIREMENTS §5.3）。
 * 段ベースの簡易テーブルで、玉には適用しない。
 * 符号は手番視点（自陣→敵陣への前進を加点）。
 * 初期配置の合計が0になるよう中央（5段）を0点にする。
 *
 * 2026-11-09 改修（docs/specs/eval-2piece-spec-2026-11-09.md §9）：
 *   加点に敵玉との距離係数を掛ける（敵玉から遠い駒の前進は点にならない）。
 *   前進の役割は「駒をぶつかる位置まで運ぶこと」で、玉に向かわない前進に点を与えないため。
 *   飛・角・馬・龍は距離係数を掛けない（§8。遠くから利く駒）。相手の駒の減点も同じ数え方（相手から見た敵玉＝自玉との距離）。
 */
import { chebyshev, attackPct } from "../../proximity.js";
import { enemyOf, forEachPiece, findKings } from "./util.js";

const LONG_RANGE = new Set(["bishop", "rook", "horse", "dragon"]);

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
  const kings = findKings(board);
  let score = 0;
  forEachPiece(board, ({ piece, file, rank }) => {
    if (piece.type === "king") {
      return;
    }
    let pct = 100;
    if (!LONG_RANGE.has(piece.type)) {
      const enemyKing = kings[enemyOf(piece.color)];
      pct = attackPct(enemyKing ? chebyshev(file, rank, enemyKing.file, enemyKing.rank) : null);
    }
    const b = advanceBonus(rank, piece.color) * pct;
    if (piece.color === turn) {
      score += b;
    } else if (piece.color === enemy) {
      score -= b;
    }
  });
  return score / 100;
}
