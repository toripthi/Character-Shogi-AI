/**
 * 手の項: 守りの桂（2026-11-20 実装、設計は 2026-11-12「飛車の横揺れ対策」）。
 *
 * 局面ではなく「指し手」に対する項なので kind: "move"（retreat・capture と同じ受け口）。
 * 自玉に最も近い自軍の桂馬（成っていない桂）を動かす手なら 1、それ以外は 0 を返す
 * （重みを掛けて減点にするのは呼び出し側＝ selection の scoreRootMoves。margin 判定より前に引く）。
 * 玉の守りの桂を安易に飛ばさないようにする狙い。
 *   - 距離はチェビシェフ距離。2枚の桂が同じ距離なら、どちらも「近い方」として扱う。
 *   - 自玉がいない盤、桂以外の手、打つ手には 0。
 */
import { IX_F, IX_R, KNIGHT } from "./fast.js";

export function knightJumpTerm(board, move) {
  if (!move || !move.from || typeof move.from !== "object" || move.pieceType !== "knight") {
    return 0;
  }
  const turn = board.turn();
  let king = null;
  const knights = [];
  const fb = board.fb;
  if (fb) {
    const c = turn === "black" ? 0 : 1;
    const k = fb.kingSq[c];
    if (k < 0) {
      return 0;
    }
    king = { file: IX_F[k], rank: IX_R[k] };
    const cells = fb.board;
    const pos = fb.piecePos[c];
    const n = fb.pieceCnt[c];
    for (let i = 0; i < n; i++) {
      const ix = pos[i];
      if ((cells[ix] & 15) === KNIGHT) {
        knights.push({ file: IX_F[ix], rank: IX_R[ix] });
      }
    }
  } else {
    for (let f = 1; f <= 9; f++) {
      for (let r = 1; r <= 9; r++) {
        const p = board.pieceAt(`${f}${"abcdefghi"[r - 1]}`);
        if (!p || p.color !== turn) {
          continue;
        }
        if (p.type === "king") {
          king = { file: f, rank: r };
        } else if (p.type === "knight") {
          knights.push({ file: f, rank: r });
        }
      }
    }
    if (!king) {
      return 0;
    }
  }
  const dist = (s) => Math.max(Math.abs(s.file - king.file), Math.abs(s.rank - king.rank));
  const mine = dist(move.from);
  return knights.every((s) => mine <= dist(s)) ? 1 : 0;
}
