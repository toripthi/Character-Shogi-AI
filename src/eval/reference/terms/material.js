/**
 * 評価項: 駒得（material）。手番側視点。
 * 盤上は駒種そのままの価値、持ち駒は元駒の価値（D-010）。
 * 重みは掛けない（掛けるのは eval/index.js）。
 */
import { handValueOf } from "../../pieceSets.js";
import { enemyOf, forEachPiece } from "./util.js";

export function materialTerm(board, style) {
  const values = style.pieceValues;
  const turn = board.turn();
  const enemy = enemyOf(turn);

  let mine = 0;
  let theirs = 0;

  forEachPiece(board, ({ piece }) => {
    const v = values[piece.type] ?? 0;
    if (piece.color === turn) {
      mine += v;
    } else if (piece.color === enemy) {
      theirs += v;
    }
  });

  const myHand = board.hand(turn);
  const enemyHand = board.hand(enemy);
  for (const type of Object.keys(myHand)) {
    const v = handValueOf(type, values);
    mine += (myHand[type] ?? 0) * v;
    theirs += (enemyHand[type] ?? 0) * v;
  }

  return mine - theirs;
}
