/**
 * 評価項: 飛車への愛着（D-003、D-011）。
 * 王の価値は評価値に入れない。飛車（竜含む）が相手の利きにあり
 * 逃げ場が少ない局面を、別項の減点として持つ。
 * 返すのは「素の減点量」（0以下）。重みは eval/index.js が掛ける。
 * K8反対称化：両者の飛車の危険度を数え、自分側から相手側を引く。
 */
import { forEachPiece } from "./util.js";

function sideDanger(board, color, enemy) {
  let penalty = 0;
  forEachPiece(board, ({ piece, sq }) => {
    if (piece.color !== color) {
      return;
    }
    if (piece.type !== "rook" && piece.type !== "dragon") {
      return;
    }
    const attackers = board.countAttackers(sq, enemy);
    if (attackers === 0) {
      return;
    }
    const defenders = board.countAttackers(sq, color);
    // 敵の利きがあり、守りが足りないほど減点。逃げ場の少なさは利き差で近似。
    penalty -= attackers + Math.max(0, attackers - defenders);
  });
  return penalty;
}

export function rookDangerTerm(board) {
  const turn = board.turn();
  const enemy = turn === "black" ? "white" : "black";
  return sideDanger(board, turn, enemy) - sideDanger(board, enemy, turn);
}
