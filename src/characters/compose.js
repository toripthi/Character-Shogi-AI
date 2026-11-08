/**
 * 特性の組み合わせ → style（評価関数に渡す形）。
 *
 * 合成ルール:
 *   1. 既定の重み（material=1 ほか）から始める
 *   2. spec.traits の各特性の weights を「加算」する
 *   3. spec.weights を「上書き」する（微調整）
 * 同じ group の特性を2つ選ぶ、未知の特性・未知の評価項を使う、はエラー。
 */
import { DEFAULT_WEIGHTS, assertKnownTerms, resolveStyle } from "../eval/index.js";
import { TRAITS } from "./traits/index.js";

/**
 * @param {{ traits?: string[], weights?: Record<string, number>, pieceSet?: string, pieceValues?: object }} [spec]
 * @param {Record<string, object>} [traitTable] 特性の表（テスト用に差し替え可）
 */
export function composeStyle(spec = {}, traitTable = TRAITS) {
  const weights = { ...DEFAULT_WEIGHTS };
  const groups = new Map(); // group → 選ばれた特性id
  const seen = new Set();

  for (const id of spec.traits ?? []) {
    const trait = traitTable[id];
    if (!trait) {
      throw new Error(`未知の特性 "${id}"（${Object.keys(traitTable).join(", ")}）`);
    }
    if (seen.has(id)) {
      throw new Error(`特性 "${id}" が重複している`);
    }
    seen.add(id);
    if (trait.group) {
      if (groups.has(trait.group)) {
        throw new Error(
          `特性 "${groups.get(trait.group)}" と "${id}" は同時に選べない（group: ${trait.group}）`,
        );
      }
      groups.set(trait.group, id);
    }
    assertKnownTerms(trait.weights, `特性 ${id}`);
    for (const [term, w] of Object.entries(trait.weights ?? {})) {
      weights[term] = (weights[term] ?? 0) + w;
    }
  }

  assertKnownTerms(spec.weights, "上書きの weights");
  Object.assign(weights, spec.weights);

  return resolveStyle({ pieceSet: spec.pieceSet, pieceValues: spec.pieceValues, weights });
}
