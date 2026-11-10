/**
 * 評価項の登録簿。評価関数が知っている項はここに載っているものだけ。
 *
 * 項を足すとき: terms/ に1ファイル書いて、ここに1行足す。
 * eval/index.js・キャラのデータ・探索は触らない。
 *
 * 項の約束:
 *  - eval は「素の値」を返す。重みは掛けない（重みは style.weights[id]）。
 *  - kind: "position" は局面の評価項。eval(board, style) → number（手番側視点）。
 *    kind: "move" は指し手に対する項。eval(board, move) → number。評価関数の合計には入らない。
 *  - defaultWeight は style.weights で指定がないときの値。
 */
import { materialTerm } from "./terms/material.js";
import { advanceTerm } from "./terms/advance.js";
import { controlTerm } from "./terms/control.js";
import { attackTerm, rookFileTerm } from "./terms/attack.js";
import { rookDangerTerm } from "./terms/rookDanger.js";
import { horseGuardTerm } from "./terms/horseGuard.js";
import { retreatTerm } from "./terms/retreat.js";
import { captureTerm } from "./terms/capture.js";
import { castleFuriTerm, castleIbishaTerm } from "./terms/castle.js";
import { rookSwungTerm, rookHomeTerm } from "./terms/rook.js";
import { kingHomeTerm, kingAdvanceTerm, kingGuardTerm } from "./terms/king.js";

export const TERMS = {
  material: { kind: "position", label: "駒得", defaultWeight: 1, eval: materialTerm },
  advance: { kind: "position", label: "前進", defaultWeight: 0, eval: advanceTerm },
  control: { kind: "position", label: "敵陣制圧", defaultWeight: 0, eval: controlTerm },
  attack: { kind: "position", label: "攻め駒", defaultWeight: 20, eval: attackTerm },
  rookFile: { kind: "position", label: "飛車の筋", defaultWeight: 0, eval: rookFileTerm },
  rookDanger: { kind: "position", label: "飛車への愛着", defaultWeight: 0, eval: rookDangerTerm },
  horseGuard: { kind: "position", label: "馬の守り", defaultWeight: 0, eval: horseGuardTerm },
  // 4-2：文脈（context = { me, matchup }）が要る。文脈がなければ 0。重みの既定は 0（OFF）
  castleFuri: { kind: "position", label: "振り飛車の囲い", defaultWeight: 0, eval: castleFuriTerm },
  castleIbisha: { kind: "position", label: "居飛車の囲い", defaultWeight: 0, eval: castleIbishaTerm },
  rookSwung: { kind: "position", label: "振り飛車の筋（自陣）", defaultWeight: 0, eval: rookSwungTerm },
  rookHome: { kind: "position", label: "居飛車の筋（自陣）", defaultWeight: 0, eval: rookHomeTerm },
  // 玉の位置（2026-11-10 §4）。重みは自己対局の測定で 40/40/15 に決めた（scripts/measure-king.js、報告書参照）。
  // kingAdvance のみ 2026-11-10 夜に本人の設計判断で 80 に変更：「3段目以上にいる限り一律」のゾーン罰とし、
  // 初期位置の居座り罰（kingHome 40）と同額で拮抗していた状態を崩すため。段ごとの逓増にはしない。
  kingHome: { kind: "position", label: "玉の初期位置（11〜30手目）", defaultWeight: 40, eval: kingHomeTerm },
  kingAdvance: { kind: "position", label: "玉の出すぎ（30手目まで）", defaultWeight: 80, eval: kingAdvanceTerm },
  kingGuard: { kind: "position", label: "玉の守り（金2銀1）", defaultWeight: 15, eval: kingGuardTerm },
  // 未接続（retreat.js 参照）
  retreat: { kind: "move", label: "後退ペナルティ", defaultWeight: 0, eval: retreatTerm },
  // 取る手への加減点（2026-11-09 §7）。取った駒の価値を返す。重みは気質ごと（攻め +0.1 / 受け -0.05）
  capture: { kind: "move", label: "取る手の加減点", defaultWeight: 0, eval: captureTerm },
};

export const TERM_IDS = Object.keys(TERMS);
export const POSITION_TERM_IDS = TERM_IDS.filter((id) => TERMS[id].kind === "position");

/** 全項の既定の重み */
export const DEFAULT_WEIGHTS = Object.freeze(
  Object.fromEntries(TERM_IDS.map((id) => [id, TERMS[id].defaultWeight])),
);

/**
 * weights のキーがすべて登録済みの項か検査する。
 * 綴りの間違いが「効かないだけ」で見過ごされるのを防ぐ。
 * @param {Record<string, number>} weights
 * @param {string} [where] エラーメッセージに添える出所
 */
export function assertKnownTerms(weights, where = "weights") {
  for (const [id, value] of Object.entries(weights ?? {})) {
    if (!TERMS[id]) {
      throw new Error(`${where}: 未知の評価項 "${id}"（登録済み: ${TERM_IDS.join(", ")}）`);
    }
    if (typeof value !== "number" || Number.isNaN(value)) {
      throw new Error(`${where}: 評価項 "${id}" の重みが数値ではない (${value})`);
    }
  }
}
