/**
 * 評価項: 敵陣制圧度（REQUIREMENTS §5.3）。
 * 両者の敵陣で「自駒の利き数 − 敵駒の利き数」を数え、自分側から相手側を引く。
 * （K8反対称化：手番を入れ替えても符号だけが反転する）
 * 初期局面で大きな負値にならないよう、自駒の利きが0のマスは
 * 「敵の利きの厚み」ではなく「未制圧」として0点にする。
 */
import { Square } from "tsshogi";
import { FILES, enemyCampRanks, squareName } from "./util.js";

function sideControl(black, white, color) {
  const mine = color === "black" ? black : white;
  const theirs = color === "black" ? white : black;
  let score = 0;
  for (const file of FILES) {
    for (const rank of enemyCampRanks(color)) {
      const index = Square.newByUSI(squareName(file, rank)).index;
      const m = mine[index];
      if (m === 0) {
        continue; // 未制圧マスは減点しない（初期局面で負に発散しないため）
      }
      score += m - theirs[index];
    }
  }
  return score;
}

export function controlTerm(board) {
  const { black, white } = board.attackCounts();
  const turn = board.turn();
  const enemy = turn === "black" ? "white" : "black";
  return sideControl(black, white, turn) - sideControl(black, white, enemy);
}
