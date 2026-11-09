/**
 * D-007: Math.random() を直接使わず、シード付き乱数に一本化する。
 * テスト・自己対局はシード固定で再現、本番は毎回変える。
 * Node / ブラウザ / Web Worker 共通のピュアJS(ESM)。
 */

// mulberry32: 小さく速いシード付きPRNG
export function createRng(seed) {
  let state = seed >>> 0;
  function next() {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  // 乱数の内部状態の保存・復元（「待った」で AI の状態を巻き戻すため。乱数列そのものは変わらない）
  next.getState = () => state;
  next.setState = (s) => {
    state = s >>> 0;
  };
  return next;
}

/** @param {() => number} rng @param {number} n */
export function pickIndex(rng, n) {
  return Math.floor(rng() * n);
}

/** @param {() => number} rng @param {Array} arr */
export function pick(rng, arr) {
  if (arr.length === 0) {
    return undefined;
  }
  return arr[pickIndex(rng, arr.length)];
}
