/**
 * 評価項: 馬の守り（D-011、簡易版）。
 * 馬（自駒）が自陣内にあり、自玉の近くで守備に利いているときに加点する。
 * 返すのは「重み1あたりの素の加点」。馬1枚あたり 1 + 玉への近さ(3マス以内で最大+1) 、上限3。
 * 初期値は弱め。Phase 5の校正で詰める。
 * K8反対称化：両者の馬の守りを数え、自分側から相手側を引く。
 *
 * 2026-11-05：駒リストを直接読む高速版。値は最適化前の実装（src/eval/reference/terms/horseGuard.js）と同じ。
 */
import { IX_F, IX_R, HORSE } from "./fast.js";
import { referenceHorseGuardTerm } from "../reference-link.js";

function sideHorseGuard(fb, color) {
  const cells = fb.board;
  const pos = fb.piecePos[color];
  const n = fb.pieceCnt[color];
  const kingIx = fb.kingSq[color]; // 玉がなければ負
  let score = 0;
  for (let i = 0; i < n; i++) {
    const ix = pos[i];
    if ((cells[ix] & 15) !== HORSE) {
      continue;
    }
    const rank = IX_R[ix];
    if (color === 0 ? rank < 7 : rank > 3) {
      continue; // 自陣（先手は7〜9段、後手は1〜3段）の外
    }
    let bonus = 1;
    if (kingIx >= 0) {
      const dist = Math.abs(IX_F[ix] - IX_F[kingIx]) + Math.abs(rank - IX_R[kingIx]);
      // 玉に近いほど加点（3マス以内で逓減）
      bonus += Math.max(0, 3 - dist) * 0.5;
    }
    score += Math.min(bonus, 3);
  }
  return score;
}

export function horseGuardTerm(board) {
  const fb = board.fb;
  if (!fb) {
    return referenceHorseGuardTerm(board);
  }
  const turn = fb.turnN;
  return sideHorseGuard(fb, turn) - sideHorseGuard(fb, turn ^ 1);
}
