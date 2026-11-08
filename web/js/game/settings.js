/**
 * 対局の設定を URL のクエリから読む（設定パネルは D 段階。それまでの暫定の入口）。
 *   ?persona=ibisha-seme&depth=3&seed=1&side=gote&style=真面目&book=0&margin=0&slip=0&maxMoves=300
 * 未指定は既定値。値が不正なら、黙って既定値に直さずエラーにする（棋力の測定で、意図しない設定で指すのを避ける）。
 */
export const DEFAULT_SETTINGS = { persona: "ibisha-seme", depth: 3, side: "sente" };

function int(params, key, { min, max } = {}) {
  if (!params.has(key)) return undefined;
  const raw = params.get(key);
  const n = Number(raw);
  if (raw === "" || !Number.isInteger(n) || (min !== undefined && n < min) || (max !== undefined && n > max)) {
    throw new Error(`${key} の値が不正です: "${raw}"`);
  }
  return n;
}
function num(params, key, { min, max } = {}) {
  if (!params.has(key)) return undefined;
  const raw = params.get(key);
  const n = Number(raw);
  if (raw === "" || !Number.isFinite(n) || (min !== undefined && n < min) || (max !== undefined && n > max)) {
    throw new Error(`${key} の値が不正です: "${raw}"`);
  }
  return n;
}

/** @param {string|URLSearchParams} search */
export function parseSettings(search) {
  const params = typeof search === "string" ? new URLSearchParams(search) : search;
  const side = (params.get("side") ?? DEFAULT_SETTINGS.side).toLowerCase();
  if (side !== "sente" && side !== "gote") throw new Error(`side は sente か gote です: "${side}"`);
  const persona = params.get("persona") ?? DEFAULT_SETTINGS.persona;
  const depth = int(params, "depth", { min: 1, max: 6 }) ?? DEFAULT_SETTINGS.depth;
  const margin = num(params, "margin", { min: 0 });
  const slipRate = num(params, "slip", { min: 0, max: 1 });
  const slipMargin = num(params, "slipMargin", { min: 0 });
  const bookParam = params.get("book");
  if (bookParam !== null && bookParam !== "0" && bookParam !== "1") throw new Error(`book は 0 か 1 です: "${bookParam}"`);

  const selection = {};
  if (margin !== undefined) selection.margin = margin;
  if (slipRate !== undefined) selection.slipRate = slipRate;
  if (slipMargin !== undefined) selection.slipMargin = slipMargin;
  const config = { persona, search: { depth }, book: { enabled: bookParam !== "0" } };
  if (Object.keys(selection).length) config.selection = selection;

  return {
    humanSide: side === "sente" ? "SENTE" : "GOTE",
    seed: int(params, "seed", { min: 0 }),
    playStyle: params.get("style") || null,
    maxMoves: int(params, "maxMoves", { min: 2 }),
    config,
  };
}
