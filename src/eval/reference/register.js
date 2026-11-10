/**
 * 参照実装を、評価の項（src/eval/terms/）の受け口（src/eval/reference-link.js）に登録する。
 * これを import すると tsshogi が読み込まれる。本番（ブラウザ含む）の経路からは import しないこと。
 * tsshogi 版の盤（board-tsshogi.js）を使う検証・テストだけが import する。
 */
import { registerReference } from "../reference-link.js";
import { materialTerm } from "./terms/material.js";
import { advanceTerm } from "./terms/advance.js";
import { controlTerm } from "./terms/control.js";
import { attackTerm, rookFileTerm } from "./terms/attack.js";
import { rookDangerTerm } from "./terms/rookDanger.js";
import { horseGuardTerm } from "./terms/horseGuard.js";
import { matchForm, castlePoints } from "./terms/castle.js";
import { rookSwungTerm, rookHomeTerm } from "./terms/rook.js";
import { kingHomeTerm, kingAdvanceTerm, kingGuardTerm } from "./terms/king.js";

registerReference({
  materialTerm,
  advanceTerm,
  controlTerm,
  attackTerm,
  rookFileTerm,
  rookDangerTerm,
  horseGuardTerm,
  matchForm,
  castlePoints,
  rookSwungTerm,
  rookHomeTerm,
  kingHomeTerm,
  kingAdvanceTerm,
  kingGuardTerm,
});
