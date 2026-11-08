/**
 * 評価関数の器。
 *   score = Σ ( style.weights[項] × 項(局面) )          （REQUIREMENTS §6）
 * 項は registry.js に登録されたものを順に回すだけで、個々の項の名前は知らない。
 * 評価値は手番側視点（negamax）。項ごとの寄与(breakdown)を必ず返す。
 *
 * style の形:
 *   { pieceSet?: "kyuui"|"neutral"|"aono", pieceValues?: {...}, weights?: { 項id: 重み } }
 * style は不変として扱う（変えたいときは新しいオブジェクトを作る）。
 * 作り方は characters/compose.js を見る。
 */
import { PIECE_SETS } from "./pieceSets.js";
import { TERMS, DEFAULT_WEIGHTS, POSITION_TERM_IDS, assertKnownTerms } from "./registry.js";

export { PIECE_SETS, PIECE_SET_NAMES, handValueOf } from "./pieceSets.js";
export {
  TERMS,
  TERM_IDS,
  POSITION_TERM_IDS,
  DEFAULT_WEIGHTS,
  assertKnownTerms,
} from "./registry.js";

export const DEFAULT_PIECE_SET = "kyuui";

const RESOLVED = Symbol("resolvedStyle");

/**
 * style を完全な形に直す。未指定は既定値、未知の項・駒セットはエラー。
 * 解決済みの style を渡した場合はそのまま返す（探索の内側で何度呼んでも軽い）。
 */
export function resolveStyle(style = {}) {
  if (style[RESOLVED]) {
    return style;
  }
  const pieceSet = style.pieceSet ?? DEFAULT_PIECE_SET;
  if (!style.pieceValues && !PIECE_SETS[pieceSet]) {
    throw new Error(`未知の駒セット "${pieceSet}"（${Object.keys(PIECE_SETS).join(", ")}）`);
  }
  assertKnownTerms(style.weights, "style.weights");
  const resolved = {
    pieceSet,
    pieceValues: style.pieceValues ?? PIECE_SETS[pieceSet],
    weights: Object.freeze({ ...DEFAULT_WEIGHTS, ...style.weights }),
  };
  Object.defineProperty(resolved, RESOLVED, { value: true });
  return Object.freeze(resolved);
}

/**
 * 手番視点のスコアを返す（negamax と相性が良い）。
 * 重み0の項は計算せず 0 を返す（breakdown のキーは常に全項そろう）。
 * @param {import("../core/board.js").ShogiBoard} board
 * @param {object} [style]
 * @returns {{ score: number, breakdown: Record<string, number> }}
 */
export function evaluate(board, style = {}, context = undefined) {
  const s = resolveStyle(style);
  let score = 0;
  const breakdown = {};
  for (const id of POSITION_TERM_IDS) {
    const weight = s.weights[id];
    // context は戦法の項（4-2）だけが使う。他の項は無視する。
    const value = weight === 0 ? 0 : TERMS[id].eval(board, s, context) * weight;
    breakdown[id] = value;
    score += value;
  }
  return { score, breakdown };
}

// style ごとの「重みが0でない項」の一覧（style は不変なので、1回作って使い回す）
const ACTIVE_TERMS = new WeakMap();
function activeTermsOf(s) {
  let a = ACTIVE_TERMS.get(s);
  if (a === undefined) {
    const ids = POSITION_TERM_IDS.filter((id) => s.weights[id] !== 0);
    a = { ids, weights: ids.map((id) => s.weights[id]) };
    ACTIVE_TERMS.set(s, a);
  }
  return a;
}

/**
 * evaluate(...).score と同じ値を、breakdown を作らずに返す（探索の葉ノード用。2026-11-05）。
 * 評価は探索の葉ごとに呼ばれ、内訳（項ごとの寄与）が要るのは根の最善手だけなので、内訳を作らない版を分けた。
 * 足す順序は evaluate と同じ（POSITION_TERM_IDS の順。重み0の項は 0 を足すだけなので飛ばしても同じ値）。
 */
export function evaluateScore(board, style = {}, context = undefined) {
  const s = resolveStyle(style);
  const { ids, weights } = activeTermsOf(s);
  let score = 0;
  for (let i = 0; i < ids.length; i++) {
    score += TERMS[ids[i]].eval(board, s, context) * weights[i];
  }
  return score;
}
