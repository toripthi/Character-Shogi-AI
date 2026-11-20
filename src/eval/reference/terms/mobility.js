/**
 * 評価項: 角・飛車の可動範囲（2026-11-20 実装、設計は 2026-11-12「飛車の横揺れ対策」）。
 * 角・飛車（と成った馬・龍）の「走り」で移動できるマス数の合計を、手番側 − 相手側で返す。
 *   - 数えるのは走りのマスだけ（馬・龍の1マス動きは含めない）。
 *   - 空きマスは数えて進む。敵の駒のあるマスは数えて止まる。自分の駒のあるマスは数えず止まる。
 * 移動できる範囲が大きい位置にいるほど加点され、無意味に端へ寄るのを抑える狙い。
 */

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
const DIRS = { bishop: DIAG, horse: DIAG, rook: ORTH, dragon: ORTH };

function mobilityOf(board, color) {
  let total = 0;
  for (let f = 1; f <= 9; f++) {
    for (let r = 1; r <= 9; r++) {
      const p = board.pieceAt(`${f}${"abcdefghi"[r - 1]}`);
      if (!p || p.color !== color) continue;
      const dirs = DIRS[p.type];
      if (!dirs) continue;
      for (const [df, dr] of dirs) {
        let nf = f + df;
        let nr = r + dr;
        while (nf >= 1 && nf <= 9 && nr >= 1 && nr <= 9) {
          const q = board.pieceAt(`${nf}${"abcdefghi"[nr - 1]}`);
          if (!q) {
            total++;
          } else {
            if (q.color !== color) total++;
            break;
          }
          nf += df;
          nr += dr;
        }
      }
    }
  }
  return total;
}

export function mobilityTerm(board) {
  const turn = board.turn();
  const enemy = turn === "black" ? "white" : "black";
  return mobilityOf(board, turn) - mobilityOf(board, enemy);
}
