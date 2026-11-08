/**
 * 評価項: 攻め駒ボーナス（REQUIREMENTS §5.3、簡易版）。
 * 敵陣に入った攻め駒（飛・角・銀・桂・香・歩と、その成り駒）の数 − 自陣に入られた敵の攻め駒の数。
 *
 * 評価項: 飛車の筋（rookFile）。
 * 飛・竜が敵陣にいる筋の数。飛車の走る筋の重みの近似。
 *
 * 2026-11-05：駒リストを直接読む高速版。値は最適化前の実装（src/eval/reference/terms/attack.js）と同じ。
 */
import {
  IX_F,
  IX_R,
  PAWN,
  LANCE,
  KNIGHT,
  SILVER,
  BISHOP,
  ROOK,
  PROM_PAWN,
  PROM_LANCE,
  PROM_KNIGHT,
  PROM_SILVER,
  HORSE,
  DRAGON,
} from "./fast.js";
import { referenceAttackTerm, referenceRookFileTerm } from "../reference-link.js";

// 攻め駒（歩・香・桂・銀・角・飛と、その成り駒。金・玉は除く）の型の集合（ビット）
let ATTACK_MASK = 0;
for (const t of [PAWN, LANCE, KNIGHT, SILVER, BISHOP, ROOK, PROM_PAWN, PROM_LANCE, PROM_KNIGHT, PROM_SILVER, HORSE, DRAGON]) {
  ATTACK_MASK |= 1 << t;
}

export function attackTerm(board) {
  const fb = board.fb;
  if (!fb) {
    return referenceAttackTerm(board);
  }
  const turn = fb.turnN;
  const cells = fb.board;
  let score = 0;
  // 手番側の攻め駒が敵陣（先手なら1〜3段、後手なら7〜9段）にいる → +1
  let pos = fb.piecePos[turn];
  let n = fb.pieceCnt[turn];
  for (let i = 0; i < n; i++) {
    const ix = pos[i];
    if ((ATTACK_MASK >> (cells[ix] & 15)) & 1) {
      const rank = IX_R[ix];
      if (turn === 0 ? rank <= 3 : rank >= 7) {
        score += 1;
      }
    }
  }
  // 相手の攻め駒が、手番側の自陣（先手なら7〜9段、後手なら1〜3段）にいる → -1
  pos = fb.piecePos[turn ^ 1];
  n = fb.pieceCnt[turn ^ 1];
  for (let i = 0; i < n; i++) {
    const ix = pos[i];
    if ((ATTACK_MASK >> (cells[ix] & 15)) & 1) {
      const rank = IX_R[ix];
      if (turn === 0 ? rank >= 7 : rank <= 3) {
        score -= 1;
      }
    }
  }
  return score;
}

/** color の飛・竜が敵陣にいる筋の数（筋の重複は1つと数える） */
function sideFiles(fb, color) {
  const cells = fb.board;
  const pos = fb.piecePos[color];
  const n = fb.pieceCnt[color];
  let mask = 0;
  for (let i = 0; i < n; i++) {
    const ix = pos[i];
    const t = cells[ix] & 15;
    if (t !== ROOK && t !== DRAGON) {
      continue;
    }
    const rank = IX_R[ix];
    if (color === 0 ? rank <= 3 : rank >= 7) {
      mask |= 1 << IX_F[ix];
    }
  }
  let count = 0;
  while (mask !== 0) {
    mask &= mask - 1;
    count++;
  }
  return count;
}

export function rookFileTerm(board) {
  const fb = board.fb;
  if (!fb) {
    return referenceRookFileTerm(board);
  }
  const turn = fb.turnN;
  return sideFiles(fb, turn) - sideFiles(fb, turn ^ 1);
}
