/**
 * キャラクター層: 特性（部品）とペルソナ（保存した組み合わせ）。すべて純データ。
 * UI のドロップダウンは listTraits() / listPersonas() から作れる。
 */
import { TRAITS } from "./traits/index.js";
import { PERSONAS } from "./personas/index.js";
import { composeStyle } from "./compose.js";
import { createRng } from "../core/rng.js";
import { parseAxisPersonaId, personaSpecFromAxes } from "./axes.js";

export { TRAITS, PERSONAS, composeStyle };
export { OPENING_AXIS, TEMPERAMENT_AXIS, axisPersonaId, personaSpecFromAxes, parseAxisPersonaId, listAxisPersonas } from "./axes.js";

/** UI用: 特性の一覧（group が同じものは排他 = ラジオボタン、なければチェックボックス） */
export function listTraits() {
  return Object.values(TRAITS).map(({ id, name, description, group }) => ({
    id,
    name,
    description,
    group: group ?? null,
  }));
}

/** UI用: ペルソナの一覧 */
export function listPersonas() {
  return Object.values(PERSONAS).map(({ id, name, description, traits }) => ({
    id,
    name,
    description,
    traits: [...traits],
  }));
}

const tagsOf = (traits) => [...new Set(traits.flatMap((t) => TRAITS[t]?.bookTags ?? []))];
/** 手順テンプレートの id。ペルソナの plan が優先、なければ特性の plan（先頭のもの）。なければ null。 */
const planOf = (spec, traits) => spec.plan ?? traits.map((t) => TRAITS[t]?.plan).find((p) => p) ?? null;

/**
 * オールラウンダー（D-029 (e)）：choose を持つ特性があれば、候補ごとに「その特性を候補に置き換えた」
 * 一式（traits・bookTags・style）を作る。なければ null。
 * 抽選の重みは特性の choose、ペルソナの openingWeights で上書きできる（キーは候補の特性id）。
 */
function resolveOpenings(spec) {
  const traits = spec.traits ?? [];
  const chooserId = traits.find((t) => TRAITS[t]?.choose);
  if (!chooserId) return null;
  const weights = { ...TRAITS[chooserId].choose };
  for (const [id, w] of Object.entries(spec.openingWeights ?? {})) {
    if (!(id in weights)) {
      throw new Error(`openingWeights の \"${id}\" は候補にない（${Object.keys(weights).join(", ")}）`);
    }
    weights[id] = w;
  }
  for (const [id, w] of Object.entries(weights)) {
    if (!TRAITS[id] || TRAITS[id].choose) throw new Error(`抽選の候補 \"${id}\" は通常の特性であること`);
    if (!Number.isFinite(w) || w < 0) throw new Error(`抽選の重みは 0 以上の数: ${id}=${w}`);
  }
  if (!Object.values(weights).some((w) => w > 0)) throw new Error("抽選の重みが全部 0");
  const variants = {};
  for (const id of Object.keys(weights)) {
    const vTraits = traits.map((t) => (t === chooserId ? id : t));
    variants[id] = { traits: vTraits, bookTags: tagsOf(vTraits), plan: planOf(spec, vTraits), style: composeStyle({ ...spec, traits: vTraits }) };
  }
  return { chooser: chooserId, weights, variants };
}

/** 色ごとに別の乱数系統を作る（同じシードから再現でき、手選びの乱数 state.rng とは混ざらない）。 */
function openingRng(seed, side) {
  let h = Math.imul((seed >>> 0) ^ (side === "black" ? 0x9e3779b9 : 0x85ebca6b), 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return createRng(h);
}

/**
 * 対局開始時の戦法の抽選（D-029 (e)）。先手・後手を別々に引く。openings が null なら両方 null。
 * @param {ReturnType<typeof resolveOpenings>} openings resolvePersona(...).openings
 * @param {number} seed
 * @returns {{ black: string|null, white: string|null }}
 */
export function drawOpenings(openings, seed) {
  if (!openings) return { black: null, white: null };
  const entries = Object.entries(openings.weights);
  const total = entries.reduce((a, [, w]) => a + w, 0);
  const draw = (side) => {
    let r = openingRng(seed, side)() * total;
    for (const [id, w] of entries) {
      if (w > 0 && r < w) return id;
      r -= w;
    }
    return entries.filter(([, w]) => w > 0).at(-1)[0];
  };
  return { black: draw("black"), white: draw("white") };
}

/**
 * ペルソナ id、またはその場で作った組み合わせ（{ traits: [...], ... }）を style つきに解決する。
 * @param {string | { id?: string, name?: string, description?: string, traits?: string[], weights?: object, pieceSet?: string, openingWeights?: Record<string, number> }} ref
 * @returns {{ id: string, name: string, description: string, traits: string[], style: object }}
 */
export function resolvePersona(ref) {
  // 文字列は、登録済みのペルソナ id か、軸の組み合わせ id（"random-balance" など。axes.js）
  let spec = ref;
  if (typeof ref === "string") {
    const axes = PERSONAS[ref] ? null : parseAxisPersonaId(ref);
    spec = PERSONAS[ref] ?? (axes ? personaSpecFromAxes(axes.opening, axes.temperament) : undefined);
  }
  if (!spec) {
    throw new Error(`未知のペルソナ "${ref}"（${Object.keys(PERSONAS).join(", ")}）`);
  }
  // 先に通常の合成を行う（同じ group の併用・未知の特性などのエラーを、openings より先に出すため）。
  const style = composeStyle(spec);
  return {
    id: spec.id ?? "custom",
    name: spec.name ?? "カスタム",
    description: spec.description ?? "",
    traits: [...(spec.traits ?? [])],
    // 定跡の戦法タグ（特性の bookTags の和集合、D-015）。composeStyle の戻り値は変えない。
    bookTags: tagsOf(spec.traits ?? []),
    // オールラウンダー（D-029 (e)）：対局開始時に戦法を抽選する。通常のペルソナは null。
    // このとき style / bookTags は「戦法が決まる前」の値（戦法の重み・タグを含まない）。実際に使う一式は variants。
    openings: resolveOpenings(spec),
    // 定跡を使うか（D-029）。false のペルソナ（balance）は book を有効にしても引かない。
    usesBook: spec.usesBook !== false,
    // 手順テンプレートの id（src/plan）。ペルソナの plan、なければ特性の plan（振り飛車党）。なければ null（使わない）。
    // オールラウンダーは戦法が決まる前なので null。実際に使う plan は戦法ごとの variants[*].plan。
    plan: planOf(spec, spec.traits ?? []),
    style,
  };
}
