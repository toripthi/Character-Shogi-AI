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
import { rookSwungTerm, rookHomeTerm, rookEdgeTerm } from "./terms/rook.js";
import { mobilityTerm } from "./terms/mobility.js";
import { knightJumpTerm } from "./terms/knightJump.js";
import { dropDefenseTerm } from "./terms/dropDefense.js";
import { kingHomeTerm, kingAdvanceTerm, kingGuardTerm } from "./terms/king.js";
import { bishopParityTerm } from "./terms/bishopParity.js";

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
  // 飛車の横揺れ対策（2026-11-12 設計、2026-11-20 実装）：端の飛車への罰（項は「相手 − 自分」の個数、重み 30 で −30）
  // と、角・飛車の可動範囲への加点（項はマス数の差。係数 2 は仮置き）。
  rookEdge: { kind: "position", label: "飛車の端（減点）", defaultWeight: 30, eval: rookEdgeTerm },
  mobility: { kind: "position", label: "角・飛車の可動範囲", defaultWeight: 2, eval: mobilityTerm },
  // 玉の位置（2026-11-10 §4）。kingHome・kingGuard の重みは自己対局の測定で 40/15 に決めた（scripts/measure-king.js、報告書参照）。
  // kingAdvance は 2026-11-20 の本人決定で段階罰に変更：項が、気質ごとの段階表（eval/kingPos.js の
  // KING_ADVANCE_STAGES_*。style.kingAdvanceStages で渡る）から罰点をそのまま返すため、重みは倍率（既定 1）。
  // 従来は「30手目まで一律 80・31手目から 0」の崖だった。kingHome の窓（11〜30手目）は従来どおり。
  kingHome: { kind: "position", label: "玉の初期位置（11〜30手目）", defaultWeight: 40, eval: kingHomeTerm },
  kingAdvance: { kind: "position", label: "玉の出すぎ（段階罰）", defaultWeight: 1, eval: kingAdvanceTerm },
  kingGuard: { kind: "position", label: "玉の守り（金2銀1）", defaultWeight: 15, eval: kingGuardTerm },
  // 角の筋違い（2026-11-21 本人の指示）：（筋＋段）の和が奇数のマスの角・馬への罰。項が罰点を
  // そのまま返すため、重みは倍率（既定 1）で全棋風に効く。罰点は角 −90（2026-11-21 本人確定）／馬 −5（仮置き）。
  bishopParity: { kind: "position", label: "角の筋違い（減点）", defaultWeight: 1, eval: bishopParityTerm },
  // 未接続（retreat.js 参照）
  retreat: { kind: "move", label: "後退ペナルティ", defaultWeight: 0, eval: retreatTerm },
  // 取る手への加減点（2026-11-09 §7）。取った駒の価値を返す。重みは棋風ごとの合計（攻め +0.15 / バランス +0.05 / 守り -0.05。2026-11-12 調整）
  capture: { kind: "move", label: "取る手の加減点", defaultWeight: 0.05, eval: captureTerm },
  // 守りの桂（2026-11-12 設計、2026-11-20 実装）：自玉に最も近い桂を跳ねる手に −30（全棋風の既定）。
  knightJump: { kind: "move", label: "守りの桂（跳ぶ手の減点）", defaultWeight: 30, eval: knightJumpTerm },
  // 自陣への打ち込み報酬（2026-11-13 着想、2026-11-20 実装）：既定 0。受けの特性だけが +30（仮置き）を足す。
  dropDefense: { kind: "move", label: "自陣への打ち込み（受けの報酬）", defaultWeight: 0, eval: dropDefenseTerm },
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
