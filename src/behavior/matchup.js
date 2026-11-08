/**
 * 戦法の判定（4-2）。純関数。定義は確定（指示書 4-2「判定の定義」、src/eval/castles.js の冒頭）。
 *  - 筋の範囲は、この STANCE_FILES だけに書く（他の場所に数字を直書きしない）。
 *  - 飛車の筋は、その色の視点（先手は筋そのまま、後手は 10 − 筋）。rook か dragon。盤上になければ判定しない。
 *  - 相手の戦法は一度「振り飛車」と判定したら、その局では戻さない（ラッチ）。
 *  - 角換わりは、6条件がすべて同時に成り立つ局面を一度でも見たら、その局では固定（ラッチ）。
 */

import { IX_F } from "../core/fastboard.js";

export const STANCE_FILES = Object.freeze({ ibisha: [1, 4], furi: [5, 9], naka: 5 });
export const INITIAL_MATCHUP = Object.freeze({ opponent: "ibisha", kakugawari: false });

const ROOK_TYPES = new Set(["rook", "dragon"]);

/** 指定の色の飛車（rook または dragon）の、その色の視点の筋。なければ null。 */
export function rookFileOf(board, color) {
  // 高速版（2026-11-05）：駒リストを直接読む。盤を筋→段の順に見て最初に見つかる飛車の筋は、
  // 飛車（rook/dragon）がいる筋のうち最小のもの。値は最適化前（src/eval/reference/matchup-ref.js）と同じ。
  const fb = board.fb;
  if (fb && (color === "black" || color === "white")) {
    const c = color === "black" ? 0 : 1;
    const cells = fb.board;
    const pos = fb.piecePos[c];
    const n = fb.pieceCnt[c];
    let min = 10;
    for (let i = 0; i < n; i++) {
      const ix = pos[i];
      const t = cells[ix] & 15;
      if (t === 7 || t === 14) {
        const f = IX_F[ix]; // 7=rook, 14=dragon
        if (f < min) min = f;
      }
    }
    return min === 10 ? null : c === 0 ? min : 10 - min;
  }
  return findRookFile(board, color);
}

function findRookFile(board, color) {
  for (const f of [1, 2, 3, 4, 5, 6, 7, 8, 9]) {
    for (const r of "abcdefghi") {
      const p = board.pieceAt(`${f}${r}`);
      if (p && p.color === color && ROOK_TYPES.has(p.type)) {
        return color === "black" ? f : 10 - f;
      }
    }
  }
  return null;
}

/** 筋（その色の視点）から戦法を決める。居飛車 1〜4、振り飛車 5〜9、中飛車は 5。 */
export function stanceOfFile(file) {
  if (file >= STANCE_FILES.ibisha[0] && file <= STANCE_FILES.ibisha[1]) return { type: "ibisha", naka: false };
  if (file >= STANCE_FILES.furi[0] && file <= STANCE_FILES.furi[1]) return { type: "furi", naka: file === STANCE_FILES.naka };
  return null;
}

/** 角換わりの6条件（すべて同時に成り立つ局面）。 */
export function isKakugawari(board) {
  const at = (sq, color, type) => {
    const p = board.pieceAt(sq);
    return !!p && p.color === color && p.type === type;
  };
  return (
    at("2h", "black", "rook") &&
    at("8b", "white", "rook") &&
    board.hand("black").bishop >= 1 &&
    board.hand("white").bishop >= 1 &&
    at("7g", "black", "silver") &&
    at("3c", "white", "silver")
  );
}

/**
 * @param {object} board  ShogiBoard
 * @param {"black"|"white"} myColor  自分の色
 * @param {{opponent: "ibisha"|"furi", kakugawari: boolean}} [prev]
 * @returns {{opponent: "ibisha"|"furi", kakugawari: boolean}}
 */
export function classifyMatchup(board, myColor, prev = INITIAL_MATCHUP) {
  const oppColor = myColor === "black" ? "white" : "black";
  let opponent = prev.opponent;
  // 相手の戦法：ラッチ。一度 furi になったら戻さない。飛車がなければ前回の判定を保つ。
  if (opponent !== "furi") {
    const f = rookFileOf(board, oppColor);
    if (f !== null) {
      const s = stanceOfFile(f);
      if (s) opponent = s.type;
    }
  }
  const kakugawari = prev.kakugawari || isKakugawari(board);
  return { opponent, kakugawari };
}
