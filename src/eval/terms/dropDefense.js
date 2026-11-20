/**
 * 手の項: 自陣への打ち込み報酬（受け将棋。2026-11-13 本人の着想、2026-11-20 実装）。
 *
 * 局面ではなく「指し手」に対する項なので kind: "move"（retreat・capture と同じ受け口）。
 * 次のすべてを満たす手なら 1、それ以外は 0 を返す（重みを掛けて報酬にするのは呼び出し側
 * ＝ selection の scoreRootMoves。margin 判定より前に足す）。
 *   - 持ち駒を打つ手である
 *   - 相手の駒が自陣（自分の視点で1〜3段目）に2枚以上ある（攻め込まれているときだけ発動する）
 *   - 打つ場所が自玉からチェビシェフ距離2以内
 * 受けの思想「持ち駒を自陣に打ち付けることを厭わない」の実装。条件付きなので、
 * 何もないときに自陣へ打つ浪費は起きにくい。
 * 報酬の大きさは重み側で決める：既定 0（無効）。受けの特性だけが +30（仮置き）を足す。
 */
import { IX_F, IX_R } from "./fast.js";

export function dropDefenseTerm(board, move) {
  // 打つ手だけが対象（from が駒名の文字列。retreat.js と同じ判定）
  if (!move || !move.to || (move.from && typeof move.from === "object")) {
    return 0;
  }
  const turn = board.turn();
  let king = null;
  let invaders = 0;
  const fb = board.fb;
  if (fb) {
    const c = turn === "black" ? 0 : 1;
    const k = fb.kingSq[c];
    if (k < 0) {
      return 0;
    }
    king = { file: IX_F[k], rank: IX_R[k] };
    const pos = fb.piecePos[c ^ 1];
    const n = fb.pieceCnt[c ^ 1];
    for (let i = 0; i < n; i++) {
      const r = IX_R[pos[i]];
      // 自陣（自分の視点で1〜3段目）：先手は盤の7〜9段目、後手は1〜3段目
      if (c === 0 ? r >= 7 : r <= 3) {
        invaders++;
      }
    }
  } else {
    const enemy = turn === "black" ? "white" : "black";
    for (let f = 1; f <= 9; f++) {
      for (let r = 1; r <= 9; r++) {
        const p = board.pieceAt(`${f}${"abcdefghi"[r - 1]}`);
        if (!p) {
          continue;
        }
        if (p.color === turn && p.type === "king") {
          king = { file: f, rank: r };
        } else if (p.color === enemy && (turn === "black" ? r >= 7 : r <= 3)) {
          invaders++;
        }
      }
    }
    if (!king) {
      return 0;
    }
  }
  if (invaders < 2) {
    return 0;
  }
  const d = Math.max(Math.abs(move.to.file - king.file), Math.abs(move.to.rank - king.rank));
  return d <= 2 ? 1 : 0;
}
