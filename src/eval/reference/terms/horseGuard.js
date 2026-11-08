/**
 * 評価項: 馬の守り（D-011、簡易版）。
 * 馬（自駒）が自陣内にあり、自玉の近くで守備に利いているときに加点する。
 * 返すのは「重み1あたりの素の加点」。馬1枚あたり 1 + 玉への近さ(3マス以内で最大+1) 、上限3。
 * 初期値は弱め。Phase 5の校正で詰める。
 * K8反対称化：両者の馬の守りを数え、自分側から相手側を引く。
 */
import { forEachPiece, inOwnCamp } from "./util.js";

function sideHorseGuard(board, color) {
  // 自玉の位置を探す
  let kingSq = null;
  forEachPiece(board, ({ piece, file, rank }) => {
    if (!kingSq && piece.color === color && piece.type === "king") {
      kingSq = { file, rank };
    }
  });

  let score = 0;
  forEachPiece(board, ({ piece, file, rank }) => {
    if (piece.color !== color || piece.type !== "horse") {
      return;
    }
    if (!inOwnCamp(rank, color)) {
      return;
    }
    let bonus = 1;
    if (kingSq) {
      const dist = Math.abs(file - kingSq.file) + Math.abs(rank - kingSq.rank);
      // 玉に近いほど加点（3マス以内で逓減）
      bonus += Math.max(0, 3 - dist) * 0.5;
    }
    score += Math.min(bonus, 3);
  });
  return score;
}

export function horseGuardTerm(board) {
  const turn = board.turn();
  const enemy = turn === "black" ? "white" : "black";
  return sideHorseGuard(board, turn) - sideHorseGuard(board, enemy);
}
