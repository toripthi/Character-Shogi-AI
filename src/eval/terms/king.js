/**
 * 評価項: 玉の位置（2026-11-10 指示書 §4）。駒リストを直接読む高速版。値は参照実装
 * （src/eval/reference/terms/king.js）と同じ。定義は src/eval/kingPos.js の冒頭を見る。
 *   kingHome … 11〜30手目に初期位置の玉を減点／kingAdvance … 30手目まで3段目以上の玉を減点／
 *   kingGuard … 自玉に近い金2枚・銀1枚の守り（距離係数つき）。いずれも「自分 − 相手」（手番視点）。
 */
import { IX_F, IX_R, GOLD, SILVER } from "./fast.js";
import { DEFENSE_PCT } from "../proximity.js";
import {
  inKingHomeWindow,
  inKingAdvanceWindow,
  KING_ADVANCE_MIN_OWN_RANK,
  GUARD_GOLDS,
  GUARD_SILVERS,
} from "../kingPos.js";
import {
  referenceKingHomeTerm,
  referenceKingAdvanceTerm,
  referenceKingGuardTerm,
} from "../reference-link.js";

/** color（0=先手, 1=後手）の玉の、自陣側からの段（1〜9）。玉がいなければ 0。 */
function ownRank(fb, c) {
  const k = fb.kingSq[c];
  if (k < 0) return 0;
  return c === 0 ? 10 - IX_R[k] : IX_R[k];
}

export function kingHomeTerm(board) {
  const fb = board.fb;
  if (!fb) return referenceKingHomeTerm(board);
  if (!inKingHomeWindow(fb.plyN)) return 0;
  const turn = fb.turnN;
  const at = (c) => {
    const k = fb.kingSq[c];
    return k >= 0 && IX_F[k] === 5 && ownRank(fb, c) === 1 ? 1 : 0;
  };
  return at(turn ^ 1) - at(turn);
}

export function kingAdvanceTerm(board) {
  const fb = board.fb;
  if (!fb) return referenceKingAdvanceTerm(board);
  if (!inKingAdvanceWindow(fb.plyN)) return 0;
  const turn = fb.turnN;
  const at = (c) => (fb.kingSq[c] >= 0 && ownRank(fb, c) >= KING_ADVANCE_MIN_OWN_RANK ? 1 : 0);
  return at(turn ^ 1) - at(turn);
}

/** c の玉の守り（百分率の合計）：自玉に近い金 GUARD_GOLDS 枚・銀 GUARD_SILVERS 枚（GUARD_* は 2・1 固定の実装）。 */
function guardPct100(fb, c) {
  const king = fb.kingSq[c];
  if (king < 0) return 0;
  const kf = IX_F[king];
  const kr = IX_R[king];
  const cells = fb.board;
  const pos = fb.piecePos[c];
  const n = fb.pieceCnt[c];
  // 距離が近いほど係数が大きい（単調）ので、金は係数の大きい上位2つ、銀は最大の1つ
  let g1 = 0;
  let g2 = 0;
  let s1 = 0;
  for (let i = 0; i < n; i++) {
    const ix = pos[i];
    const t = cells[ix] & 15;
    if (t !== GOLD && t !== SILVER) continue;
    const pct = DEFENSE_PCT[Math.max(Math.abs(IX_F[ix] - kf), Math.abs(IX_R[ix] - kr))];
    if (t === GOLD) {
      if (pct > g1) {
        g2 = g1;
        g1 = pct;
      } else if (pct > g2) {
        g2 = pct;
      }
    } else if (pct > s1) {
      s1 = pct;
    }
  }
  return g1 + g2 + s1;
}

export function kingGuardTerm(board) {
  const fb = board.fb;
  if (!fb) return referenceKingGuardTerm(board);
  const turn = fb.turnN;
  return (guardPct100(fb, turn) - guardPct100(fb, turn ^ 1)) / 100;
}
