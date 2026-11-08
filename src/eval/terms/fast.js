/**
 * 評価の項の高速版で共通に使うもの（2026-11-05）。
 * 評価の項は、盤を1マスずつ走査して駒ごとにオブジェクトを作る代わりに、FastBoard が持つ駒のリスト
 * （fb.piecePos / fb.pieceCnt）と盤の配列（fb.board）を直接読む。値は、最適化前の実装
 * （src/eval/reference/）と完全に同じ。fb を持たない盤面（tsshogi 版）では、各項が参照の実装を使う。
 */
import { WHITE_BIT, IX_F, IX_R, SQ_TO_IX, TYPE_STRING } from "../../core/fastboard.js";
import { handValueOf } from "../pieceSets.js";

export { WHITE_BIT, IX_F, IX_R, SQ_TO_IX, TYPE_STRING };

// 駒の型の番号（fastboard.js の TYPE_STRING の添字）
export const PAWN = 1;
export const LANCE = 2;
export const KNIGHT = 3;
export const SILVER = 4;
export const GOLD = 5;
export const BISHOP = 6;
export const ROOK = 7;
export const KING = 8;
export const PROM_PAWN = 9;
export const PROM_LANCE = 10;
export const PROM_KNIGHT = 11;
export const PROM_SILVER = 12;
export const HORSE = 13;
export const DRAGON = 14;

/** 色の文字列 → 内部の色番号（0=先手, 1=後手）。それ以外は -1。 */
export const colorNum = (color) => (color === "black" ? 0 : color === "white" ? 1 : -1);

const TABLES = new WeakMap();
/**
 * style の駒の価値を、型の番号で引ける表にする（style ごとに1回）。
 *   v[型] … 盤上の駒の価値、h[持ち駒の添字 0..6（歩香桂銀金角飛）] … 持ち駒の価値（成駒は元駒、D-010）
 */
export function valueTables(style) {
  let t = TABLES.get(style);
  if (t === undefined) {
    const v = new Float64Array(15);
    for (let c = 1; c <= 14; c++) {
      v[c] = style.pieceValues[TYPE_STRING[c]] ?? 0;
    }
    const h = new Float64Array(7);
    for (let k = 0; k < 7; k++) {
      h[k] = handValueOf(TYPE_STRING[k + 1], style.pieceValues);
    }
    t = { v, h };
    TABLES.set(style, t);
  }
  return t;
}
