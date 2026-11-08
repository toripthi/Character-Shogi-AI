/**
 * 評価項: 飛車への愛着（D-003、D-011）。
 * 王の価値は評価値に入れない。飛車（竜含む）が相手の利きにあり
 * 逃げ場が少ない局面を、別項の減点として持つ。
 * 返すのは「素の減点量」（0以下）。重みは eval/index.js が掛ける。
 * K8反対称化：両者の飛車の危険度を数え、自分側から相手側を引く。
 *
 * 2026-11-05：飛車の駒リストだけを読む高速版。値は最適化前の実装（src/eval/reference/terms/rookDanger.js）と同じ。
 * 2026-11-06：利き数は飛車のマスから12方向へ走査して数える（`countAttackersScan`。全駒を調べる `countAttackers` と同じ値）。
 */
import { ROOK, DRAGON } from "./fast.js";
import { referenceRookDangerTerm } from "../reference-link.js";

function sideDanger(fb, color, enemy) {
  const cells = fb.board;
  const pos = fb.piecePos[color];
  const n = fb.pieceCnt[color];
  let penalty = 0;
  for (let i = 0; i < n; i++) {
    const ix = pos[i];
    const t = cells[ix] & 15;
    if (t !== ROOK && t !== DRAGON) {
      continue;
    }
    const attackers = fb.countAttackersScan(ix, enemy);
    if (attackers === 0) {
      continue;
    }
    const defenders = fb.countAttackersScan(ix, color);
    // 敵の利きがあり、守りが足りないほど減点。逃げ場の少なさは利き差で近似。
    penalty -= attackers + Math.max(0, attackers - defenders);
  }
  return penalty;
}

export function rookDangerTerm(board) {
  const fb = board.fb;
  if (!fb) {
    return referenceRookDangerTerm(board);
  }
  const turn = fb.turnN;
  const enemy = turn ^ 1;
  return sideDanger(fb, turn, enemy) - sideDanger(fb, enemy, turn);
}
