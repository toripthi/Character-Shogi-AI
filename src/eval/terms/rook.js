/**
 * 飛車の項（4-2）：rookSwung（振り飛車の筋・自陣）、rookHome（居飛車の筋・自陣）。
 * 文脈 context = { me } が必要。なければ 0。rook のみ（dragon は除く）。
 * 自陣 = 自分の視点で 7〜9 段目（先手は g〜i、後手は a〜c の盤上）。
 * 筋の範囲は matchup.js の STANCE_FILES を参照する（数字を直書きしない）。
 * 手番側視点で反対称（K8）：board.turn() === me なら +個数、そうでなければ −個数。
 *
 * 2026-11-05：飛車の駒リストだけを読む高速版。値は最適化前の実装（src/eval/reference/terms/rook.js）と同じ。
 */
import { STANCE_FILES } from "../../behavior/matchup.js";
import { IX_F, IX_R, ROOK, colorNum } from "./fast.js";
import { referenceRookSwungTerm, referenceRookHomeTerm } from "../reference-link.js";

const CAMP_MIN_RANK = 7; // 自分の視点の段（9が最奥）

/** me の飛車（rook のみ。dragon は除く）のうち、範囲 [lo, hi] の筋・自陣にあるものの数 */
function countRooks(fb, me, lo, hi) {
  const cells = fb.board;
  const pos = fb.piecePos[me];
  const n = fb.pieceCnt[me];
  let count = 0;
  for (let i = 0; i < n; i++) {
    const ix = pos[i];
    if ((cells[ix] & 15) !== ROOK) {
      continue;
    }
    const myFile = me === 0 ? IX_F[ix] : 10 - IX_F[ix];
    const myRank = me === 0 ? IX_R[ix] : 10 - IX_R[ix];
    if (myFile >= lo && myFile <= hi && myRank >= CAMP_MIN_RANK) {
      count++;
    }
  }
  return count;
}

function sided(board, context, range, reference) {
  if (!context || !context.me) {
    return 0;
  }
  const fb = board.fb;
  const me = colorNum(context.me);
  if (!fb || me < 0) {
    return reference(board, undefined, context);
  }
  const n = countRooks(fb, me, range[0], range[1]);
  // 手番側でなければ符号を反転（n=0 のとき -0 になる点も、最適化前と同じ）
  return fb.turnN === me ? n : -n;
}

export const rookSwungTerm = (board, _style, context) => sided(board, context, STANCE_FILES.furi, referenceRookSwungTerm);

export const rookHomeTerm = (board, _style, context) => sided(board, context, STANCE_FILES.ibisha, referenceRookHomeTerm);
