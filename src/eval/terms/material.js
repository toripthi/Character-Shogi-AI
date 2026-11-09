/**
 * 評価項: 駒得（material）。手番側視点。
 * 重みは掛けない（掛けるのは eval/index.js）。
 *
 * 2026-11-05：駒リストを直接読む高速版。値は参照実装（src/eval/reference/terms/material.js）と同じ。
 * 2026-11-09 改修（docs/specs/eval-2piece-spec-2026-11-09.md §4・§5・§6・§10）：
 *   持ち駒 1.25 倍／成り駒の上乗せ分に距離係数／敵陣1段目の金・金の動きの成り駒の割引／盤上の香車の段係数。
 *   意味の説明は参照実装のファイル先頭を見る（先に参照を直してから、ここを直す）。
 *   計算は「点 × 百分率」を整数のまま足し、最後に100で割る（proximity.js の冒頭）。
 */
import {
  valueTables,
  IX_F,
  IX_R,
  LANCE,
  GOLD,
  PROM_PAWN,
  PROM_LANCE,
  PROM_KNIGHT,
  PROM_SILVER,
  PAWN,
  KNIGHT,
  SILVER,
} from "./fast.js";
import {
  ATTACK_PCT,
  DEFENSE_PCT,
  LANCE_PCT,
  HAND_PCT,
  GOLD_FIRST_RANK_PCT,
  FIRST_RANK_MIN_DIST,
} from "../proximity.js";
import { referenceMaterialTerm } from "../reference-link.js";

// 駒の型 → 種別（0=そのまま、1=香車、2=金、3=金の動きの成り駒）と、成り駒の元駒の型
const KIND = new Uint8Array(15);
const BASE_TYPE = new Uint8Array(15);
KIND[LANCE] = 1;
KIND[GOLD] = 2;
for (const [prom, base] of [
  [PROM_PAWN, PAWN],
  [PROM_LANCE, LANCE],
  [PROM_KNIGHT, KNIGHT],
  [PROM_SILVER, SILVER],
]) {
  KIND[prom] = 3;
  BASE_TYPE[prom] = base;
}

/** color の盤上の駒の価値 × 100 の合計（持ち駒は含まない）。 */
function sideBoardValue100(fb, color, v) {
  const cells = fb.board;
  const pos = fb.piecePos[color];
  const n = fb.pieceCnt[color];
  const ownKing = fb.kingSq[color];
  const enemyKing = fb.kingSq[color ^ 1];
  const ekf = enemyKing >= 0 ? IX_F[enemyKing] : 0;
  const ekr = enemyKing >= 0 ? IX_R[enemyKing] : 0;
  const okf = ownKing >= 0 ? IX_F[ownKing] : 0;
  const okr = ownKing >= 0 ? IX_R[ownKing] : 0;
  let sum = 0;
  for (let i = 0; i < n; i++) {
    const ix = pos[i];
    const t = cells[ix] & 15;
    const kind = KIND[t];
    if (kind === 0) {
      sum += v[t] * 100;
      continue;
    }
    const f = IX_F[ix];
    const r = IX_R[ix];
    if (kind === 1) {
      const advanced = color === 0 ? 9 - r : r - 1;
      sum += v[t] * LANCE_PCT[advanced >= 3 ? 3 : advanced];
      continue;
    }
    // 敵玉との距離（玉がいなければ -1）。敵陣の1段目か。
    const dEnemy = enemyKing >= 0 ? Math.max(Math.abs(f - ekf), Math.abs(r - ekr)) : -1;
    const far = (color === 0 ? r === 1 : r === 9) && dEnemy >= FIRST_RANK_MIN_DIST;
    if (kind === 2) {
      sum += v[t] * (far ? GOLD_FIRST_RANK_PCT : 100);
      continue;
    }
    // 金の動きの成り駒：元駒 ＋ 上乗せ分 × max(攻めの係数, 守りの係数)。1段目のルールが効けば上乗せ分 0
    let pct = 0;
    if (!far) {
      pct = dEnemy < 0 ? 100 : ATTACK_PCT[dEnemy];
      if (ownKing >= 0) {
        const def = DEFENSE_PCT[Math.max(Math.abs(f - okf), Math.abs(r - okr))];
        if (def > pct) {
          pct = def;
        }
      }
    }
    const base = v[BASE_TYPE[t]];
    sum += base * 100 + (v[t] - base) * pct;
  }
  return sum;
}

export function materialTerm(board, style) {
  const fb = board.fb;
  if (!fb) {
    return referenceMaterialTerm(board, style);
  }
  const { v, h } = valueTables(style);
  const turn = fb.turnN;
  const enemy = turn ^ 1;

  let mine = sideBoardValue100(fb, turn, v);
  let theirs = sideBoardValue100(fb, enemy, v);

  const myHand = fb.hands[turn];
  const enemyHand = fb.hands[enemy];
  for (let k = 0; k < 7; k++) {
    const hv = h[k] * HAND_PCT;
    mine += myHand[k] * hv;
    theirs += enemyHand[k] * hv;
  }

  return (mine - theirs) / 100;
}
