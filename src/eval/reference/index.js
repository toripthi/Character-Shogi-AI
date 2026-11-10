/**
 * 【参照用（オラクル）】評価の項の、最適化前の実装のコピー（2026-11-05）。
 * 本体（src/eval/terms/*.js）は、速くするために駒リストを直接読む実装に替えた。このフォルダは
 * 替える前の実装をそのまま残したもので、本体とは別に独立して動く（board-tsshogi.js と同じ位置づけ）。
 *   - test/eval/fast-vs-reference.test.js が、本体と参照を多数の局面・style・文脈で突き合わせる。
 *   - 本体の評価の意味（点の付け方）を変えるときは、先にここを直してから本体を直す。
 *   - 本体は、駒リストを持たない盤面（board.fb がない tsshogi 版）では、この参照の実装にフォールバックする。
 * 本体のコードから import するのは、そのフォールバックだけ。
 */
import { POSITION_TERM_IDS, DEFAULT_WEIGHTS } from "../registry.js";
import { resolveStyle } from "../index.js";
import { materialTerm } from "./terms/material.js";
import { advanceTerm } from "./terms/advance.js";
import { controlTerm } from "./terms/control.js";
import { attackTerm, rookFileTerm } from "./terms/attack.js";
import { rookDangerTerm } from "./terms/rookDanger.js";
import { horseGuardTerm } from "./terms/horseGuard.js";
import { castleFuriTerm, castleIbishaTerm } from "./terms/castle.js";
import { rookSwungTerm, rookHomeTerm } from "./terms/rook.js";
import { kingHomeTerm, kingAdvanceTerm, kingGuardTerm } from "./terms/king.js";
import "./register.js"; // 評価の項（terms）の参照実装の受け口に登録（2026-11-07）

export { materialTerm, advanceTerm, controlTerm, attackTerm, rookFileTerm, rookDangerTerm, horseGuardTerm };
export { castleFuriTerm, castleIbishaTerm, rookSwungTerm, rookHomeTerm };
export { kingHomeTerm, kingAdvanceTerm, kingGuardTerm };
export { matchForm, castlePoints } from "./terms/castle.js";
export { rookFileOf } from "./matchup-ref.js";

/** 参照用の項の対応表（id → 参照実装）。項の id と順序・既定の重みは、本体の登録簿と同じものを使う。 */
export const REFERENCE_TERMS = {
  material: materialTerm,
  advance: advanceTerm,
  control: controlTerm,
  attack: attackTerm,
  rookFile: rookFileTerm,
  rookDanger: rookDangerTerm,
  horseGuard: horseGuardTerm,
  castleFuri: castleFuriTerm,
  castleIbisha: castleIbishaTerm,
  rookSwung: rookSwungTerm,
  rookHome: rookHomeTerm,
  kingHome: kingHomeTerm,
  kingAdvance: kingAdvanceTerm,
  kingGuard: kingGuardTerm,
};

/** 最適化前の evaluate（score と breakdown）。 */
export function referenceEvaluate(board, style = {}, context = undefined) {
  const s = resolveStyle(style);
  let score = 0;
  const breakdown = {};
  for (const id of POSITION_TERM_IDS) {
    const weight = s.weights[id];
    const value = weight === 0 ? 0 : REFERENCE_TERMS[id](board, s, context) * weight;
    breakdown[id] = value;
    score += value;
  }
  return { score, breakdown };
}

export { DEFAULT_WEIGHTS };
