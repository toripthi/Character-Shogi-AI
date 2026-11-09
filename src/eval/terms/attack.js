/**
 * 評価項: 攻め駒ボーナス（REQUIREMENTS §5.3、簡易版）。
 * 敵陣に入った攻め駒（飛・角・銀・桂・香・歩と、その成り駒）の寄与の合計 − 自陣に入られた敵の攻め駒の寄与の合計。
 *
 * 評価項: 飛車の筋（rookFile）。
 * 飛・竜が敵陣にいる筋の数。飛車の走る筋の重みの近似。
 *
 * 2026-11-05：駒リストを直接読む高速版。値は参照実装（src/eval/reference/terms/attack.js）と同じ。
 * 2026-11-09 改修（docs/specs/eval-2piece-spec-2026-11-09.md §3・§5）：寄与に敵玉との距離係数を掛ける
 *   （飛・角・馬・龍は 1 のまま）。敵陣の1段目の金の動きの成り駒は、敵玉と距離3以上なら 0。
 *   意味の説明は参照実装のファイル先頭を見る。
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
import { ATTACK_PCT, FIRST_RANK_MIN_DIST } from "../proximity.js";
import { referenceAttackTerm, referenceRookFileTerm } from "../reference-link.js";

// 攻め駒（歩・香・桂・銀・角・飛と、その成り駒。金・玉は除く）の型の集合（ビット）
let ATTACK_MASK = 0;
for (const t of [PAWN, LANCE, KNIGHT, SILVER, BISHOP, ROOK, PROM_PAWN, PROM_LANCE, PROM_KNIGHT, PROM_SILVER, HORSE, DRAGON]) {
  ATTACK_MASK |= 1 << t;
}
// 遠くから利く駒（距離係数を掛けない）・金の動きの成り駒（1段目のルールの対象）の型の集合（ビット）
let LONG_MASK = 0;
for (const t of [BISHOP, ROOK, HORSE, DRAGON]) {
  LONG_MASK |= 1 << t;
}
let GOLD_MOVER_MASK = 0;
for (const t of [PROM_PAWN, PROM_LANCE, PROM_KNIGHT, PROM_SILVER]) {
  GOLD_MOVER_MASK |= 1 << t;
}

/** color の攻め駒1枚（盤の ix・型 t）の寄与 × 100。 */
function contribution100(fb, color, ix, t) {
  if ((LONG_MASK >> t) & 1) {
    return 100;
  }
  const enemyKing = fb.kingSq[color ^ 1];
  if (enemyKing < 0) {
    return 100; // 敵玉がいない盤は割り引かない
  }
  const rank = IX_R[ix];
  const dist = Math.max(Math.abs(IX_F[ix] - IX_F[enemyKing]), Math.abs(rank - IX_R[enemyKing]));
  if (((GOLD_MOVER_MASK >> t) & 1) && (color === 0 ? rank === 1 : rank === 9) && dist >= FIRST_RANK_MIN_DIST) {
    return 0;
  }
  return ATTACK_PCT[dist];
}

export function attackTerm(board) {
  const fb = board.fb;
  if (!fb) {
    return referenceAttackTerm(board);
  }
  const turn = fb.turnN;
  const cells = fb.board;
  let score = 0;
  // 手番側の攻め駒が敵陣（先手なら1〜3段、後手なら7〜9段）にいる → 寄与を足す
  let pos = fb.piecePos[turn];
  let n = fb.pieceCnt[turn];
  for (let i = 0; i < n; i++) {
    const ix = pos[i];
    const t = cells[ix] & 15;
    if ((ATTACK_MASK >> t) & 1) {
      const rank = IX_R[ix];
      if (turn === 0 ? rank <= 3 : rank >= 7) {
        score += contribution100(fb, turn, ix, t);
      }
    }
  }
  // 相手の攻め駒が、手番側の自陣（先手なら7〜9段、後手なら1〜3段）にいる → 寄与を引く
  pos = fb.piecePos[turn ^ 1];
  n = fb.pieceCnt[turn ^ 1];
  for (let i = 0; i < n; i++) {
    const ix = pos[i];
    const t = cells[ix] & 15;
    if ((ATTACK_MASK >> t) & 1) {
      const rank = IX_R[ix];
      if (turn === 0 ? rank >= 7 : rank <= 3) {
        score -= contribution100(fb, turn ^ 1, ix, t);
      }
    }
  }
  return score / 100;
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
