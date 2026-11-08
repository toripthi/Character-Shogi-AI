/**
 * 評価項: 駒得（material）。手番側視点。
 * 盤上は駒種そのままの価値、持ち駒は元駒の価値（D-010）。
 * 重みは掛けない（掛けるのは eval/index.js）。
 *
 * 2026-11-05：駒リストを直接読む高速版。値は最適化前の実装（src/eval/reference/terms/material.js）と同じ。
 */
import { valueTables } from "./fast.js";
import { referenceMaterialTerm } from "../reference-link.js";

export function materialTerm(board, style) {
  const fb = board.fb;
  if (!fb) {
    return referenceMaterialTerm(board, style);
  }
  const { v, h } = valueTables(style);
  const turn = fb.turnN;
  const enemy = turn ^ 1;
  const cells = fb.board;
  let mine = 0;
  let theirs = 0;

  let pos = fb.piecePos[turn];
  let n = fb.pieceCnt[turn];
  for (let i = 0; i < n; i++) {
    mine += v[cells[pos[i]] & 15];
  }
  pos = fb.piecePos[enemy];
  n = fb.pieceCnt[enemy];
  for (let i = 0; i < n; i++) {
    theirs += v[cells[pos[i]] & 15];
  }

  const myHand = fb.hands[turn];
  const enemyHand = fb.hands[enemy];
  for (let k = 0; k < 7; k++) {
    mine += myHand[k] * h[k];
    theirs += enemyHand[k] * h[k];
  }

  return mine - theirs;
}
