/**
 * 飛車の項（4-2）：rookSwung（振り飛車の筋・自陣）、rookHome（居飛車の筋・自陣）。
 * 文脈 context = { me } が必要。なければ 0。rook のみ（dragon は除く）。
 * 自陣 = 自分の視点で 7〜9 段目（先手は g〜i、後手は a〜c の盤上）。
 * 筋の範囲は matchup.js の STANCE_FILES を参照する（数字を直書きしない）。
 * 手番側視点で反対称（K8）：board.turn() === me なら +個数、そうでなければ −個数。
 */
import { STANCE_FILES } from "../matchup-ref.js";

const CAMP_MIN_RANK = 7; // 自分の視点の段（9が最奥）

function countRooks(board, me, pred) {
  let n = 0;
  for (let f = 1; f <= 9; f++) {
    for (let r = 1; r <= 9; r++) {
      const sqName = `${f}${"abcdefghi"[r - 1]}`;
      const p = board.pieceAt(sqName);
      if (!p || p.color !== me || p.type !== "rook") continue;
      const myFile = me === "black" ? f : 10 - f;
      const myRank = me === "black" ? r : 10 - r;
      if (pred(myFile, myRank)) n++;
    }
  }
  return n;
}

function sided(board, context, pred) {
  if (!context || !context.me) return 0;
  const n = countRooks(board, context.me, pred);
  return board.turn() === context.me ? n : -n;
}

export const rookSwungTerm = (board, _style, context) =>
  sided(board, context, (file, rank) => file >= STANCE_FILES.furi[0] && file <= STANCE_FILES.furi[1] && rank >= CAMP_MIN_RANK);

export const rookHomeTerm = (board, _style, context) =>
  sided(board, context, (file, rank) => file >= STANCE_FILES.ibisha[0] && file <= STANCE_FILES.ibisha[1] && rank >= CAMP_MIN_RANK);
