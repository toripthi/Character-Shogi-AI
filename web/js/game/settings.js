/**
 * 対局の設定。画面の入力（文字列）→ 検証 → エンジンの設定（createPlayer のオプション）への変換と、保存・URL の読み込み。
 * 不正な値は黙って直さずエラーにする（棋力の測定で、意図しない設定で指すのを避ける）。
 *
 * 入力の形（raw）はすべて文字列。空欄は「指定なし（エンジンの既定）」:
 *   side('sente'|'gote'|'furigoma'), opening('random'|'ibisha'|'furi'), temperament('balance'|'seme'|'mamori'),
 *   time(持ち時間のプリセット id。game/time-control.js), customMin, customInc,
 *   depth, maxNodes, maxDepth, margin, slip, slipMargin, book('1'|'0'), seed, style, maxMoves,
 *   persona（旧：ペルソナ id を直接指定。URL のときだけ使える。保存はしない。指定すると opening・temperament より優先）
 * 手番・棋風・持ち時間は開始画面（ui/start-screen.js）で選ぶ。それ以外は設定シート（ui/menu-sheet.js）。
 * 優先順位: URL のクエリ > 保存済みの設定 > 既定値。
 */
import { buildTimeControl } from "./time-control.js";
import { axisPersonaId, personaSpecFromAxes } from "../../../src/characters/axes.js";

export const DEFAULT_RAW = Object.freeze({
  persona: "", opening: "ibisha", temperament: "seme", depth: "3", maxNodes: "", maxDepth: "", margin: "", slip: "", slipMargin: "",
  book: "1", seed: "", side: "sente", time: "none", customMin: "10", customInc: "0", style: "", maxMoves: "300",
});
export const RAW_KEYS = Object.keys(DEFAULT_RAW);
const SAVED_KEYS = RAW_KEYS.filter((k) => k !== "persona"); // persona（旧）は保存しない：保存すると開始画面の選択を黙って上書きしてしまう
export const STYLES = ["真面目", "雑な早指し", "変則"]; // 指し方（記録用。5局の物差し：docs/WEB-UI-PLAN.md §4）
const STORAGE_KEY = "csai.settings";

function num(raw, key, { int = false, min, max } = {}) {
  const text = String(raw[key] ?? "").trim();
  if (text === "") return undefined;
  const n = Number(text);
  if (!Number.isFinite(n) || (int && !Number.isInteger(n)) || (min !== undefined && n < min) || (max !== undefined && n > max)) {
    throw new Error(`${key} の値が不正です: "${text}"`);
  }
  return n;
}

/**
 * raw（文字列の組）→ { humanSide, furigoma, seed, playStyle, maxMoves, timeControl, config }。不正ならエラー。
 * side が furigoma のとき humanSide は null（対局を始めるたびに振り駒で決める）。
 */
export function buildSettings(raw) {
  const r = { ...DEFAULT_RAW, ...raw };
  const side = String(r.side).toLowerCase();
  if (side !== "sente" && side !== "gote" && side !== "furigoma") throw new Error(`side は sente・gote・furigoma のどれかです: "${r.side}"`);
  if (String(r.book) !== "0" && String(r.book) !== "1") throw new Error(`book は 0 か 1 です: "${r.book}"`);
  // ペルソナ：旧 persona が指定されていればそれ、なければ 戦法×気質（"ibisha-seme" など。characters/axes.js）
  const legacy = String(r.persona ?? "").trim();
  let persona = legacy;
  if (!persona) {
    personaSpecFromAxes(String(r.opening), String(r.temperament)); // 不正ならここでエラー（戦法・気質の値）
    persona = axisPersonaId(String(r.opening), String(r.temperament));
  }
  const timeControl = buildTimeControl({ time: r.time, customMin: r.customMin, customInc: r.customInc });

  const depth = num(r, "depth", { int: true, min: 1, max: 6 }) ?? 3;
  const maxNodes = num(r, "maxNodes", { int: true, min: 0 });
  const maxDepth = num(r, "maxDepth", { int: true, min: 1, max: 12 });
  if ((maxNodes === undefined) !== (maxDepth === undefined)) {
    throw new Error("maxNodes と maxDepth は両方入れるか、両方空にしてください");
  }
  const margin = num(r, "margin", { min: 0 });
  const slipRate = num(r, "slip", { min: 0, max: 1 });
  const slipMargin = num(r, "slipMargin", { min: 0 });

  const search = { depth };
  if (maxNodes !== undefined) { search.maxNodes = maxNodes; search.maxDepth = maxDepth; }
  const config = { persona, search, book: { enabled: String(r.book) !== "0" } };
  const selection = {};
  if (margin !== undefined) selection.margin = margin;
  if (slipRate !== undefined) selection.slipRate = slipRate;
  if (slipMargin !== undefined) selection.slipMargin = slipMargin;
  if (Object.keys(selection).length) config.selection = selection;

  return {
    humanSide: side === "sente" ? "SENTE" : side === "gote" ? "GOTE" : null,
    furigoma: side === "furigoma",
    timeControl,
    seed: num(r, "seed", { int: true, min: 0 }),
    playStyle: String(r.style ?? "").trim() || null,
    maxMoves: num(r, "maxMoves", { int: true, min: 2 }),
    config,
  };
}

/** URL のクエリ → raw の一部（指定されたキーだけ） */
export function rawFromSearch(search) {
  const params = typeof search === "string" ? new URLSearchParams(search) : search;
  const out = {};
  for (const k of RAW_KEYS) if (params.has(k)) out[k] = params.get(k);
  return out;
}

/** 互換：URL だけから設定を作る（保存済みの設定は見ない） */
export function parseSettings(search) {
  return buildSettings(rawFromSearch(search));
}

/** 保存済みの設定（無い・壊れていれば空）。storage は localStorage 互換 */
export function loadSavedRaw(storage) {
  try {
    const obj = JSON.parse(storage.getItem(STORAGE_KEY) ?? "{}");
    const out = {};
    for (const k of SAVED_KEYS) if (typeof obj[k] === "string") out[k] = obj[k];
    return out;
  } catch {
    return {};
  }
}

export function saveRaw(storage, raw) {
  const out = {};
  for (const k of SAVED_KEYS) out[k] = String(raw[k] ?? DEFAULT_RAW[k]);
  storage.setItem(STORAGE_KEY, JSON.stringify(out));
}

/** 既定 < 保存済み < URL を重ねた raw */
export function resolveRaw({ saved = {}, url = {} } = {}) {
  return { ...DEFAULT_RAW, ...saved, ...url };
}
