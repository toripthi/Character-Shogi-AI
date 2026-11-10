/**
 * 参照実装（src/eval/reference/）への受け口。
 *
 * 評価の項（src/eval/terms/*.js）は、FastBoard の駒リスト（board.fb）を持たない盤面
 * （＝ tsshogi 版の盤 board-tsshogi.js。検証用オラクル）が渡されたときだけ、最適化前の参照実装に
 * 処理を渡す。本番の盤（ShogiBoard = FastBoard）は必ず fb を持つので、この経路は通らない。
 *
 * 以前は評価の項が参照実装を静的に import していたため、参照実装が使う tsshogi が本番の
 * import 経路（src/index.js → eval → terms → reference）に混入していた。ブラウザ（ビルドなし）に
 * エンジンを載せるため、静的 import をやめて、ここに登録された実装を呼ぶ形にした（2026-11-07）。
 *
 * 登録は src/eval/reference/register.js が行う（reference/index.js が読み込む）。
 * tsshogi 版の盤を評価する検証・テストは、reference/register.js（または reference/index.js）を
 * import してから評価する。未登録のまま fb 無しの盤が来たら、黙って別の値を返さず、例外で知らせる。
 */

const REF = { table: null };

/** 参照実装の関数表を登録する（register.js から1回だけ呼ぶ） */
export function registerReference(table) {
  REF.table = table;
}

function need(name) {
  const fn = REF.table && REF.table[name];
  if (typeof fn !== "function") {
    throw new Error(
      `参照実装 ${name} が未登録です。fb を持たない盤（tsshogi 版）を評価するには、` +
        `先に src/eval/reference/register.js を import してください。`
    );
  }
  return fn;
}

export const referenceMaterialTerm = (...a) => need("materialTerm")(...a);
export const referenceAdvanceTerm = (...a) => need("advanceTerm")(...a);
export const referenceControlTerm = (...a) => need("controlTerm")(...a);
export const referenceAttackTerm = (...a) => need("attackTerm")(...a);
export const referenceRookFileTerm = (...a) => need("rookFileTerm")(...a);
export const referenceRookDangerTerm = (...a) => need("rookDangerTerm")(...a);
export const referenceHorseGuardTerm = (...a) => need("horseGuardTerm")(...a);
export const referenceMatchForm = (...a) => need("matchForm")(...a);
export const referenceCastlePoints = (...a) => need("castlePoints")(...a);
export const referenceRookSwungTerm = (...a) => need("rookSwungTerm")(...a);
export const referenceRookHomeTerm = (...a) => need("rookHomeTerm")(...a);
export const referenceKingHomeTerm = (...a) => need("kingHomeTerm")(...a);
export const referenceKingAdvanceTerm = (...a) => need("kingAdvanceTerm")(...a);
export const referenceKingGuardTerm = (...a) => need("kingGuardTerm")(...a);
