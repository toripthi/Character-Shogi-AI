/**
 * REQUIREMENTS 付録A: 駒の価値セット（歩≒100スケールに統一）。
 * 標準は kyuui（谷川理論）。neutral は自己対局の基準、aono は別ペルソナ用。
 * 成駒の値は仮置き（D-010）。ぴよ将棋との対局と定性チェックで見直す。
 */

export const PIECE_SETS = {
  neutral: {
    pawn: 101,
    lance: 254,
    knight: 267,
    silver: 385,
    gold: 466,
    bishop: 567,
    rook: 661,
    king: 0,
    promPawn: 424,
    promLance: 424,
    promKnight: 462,
    promSilver: 477,
    horse: 831,
    dragon: 1002,
  },
  kyuui: {
    pawn: 100,
    lance: 300,
    knight: 400,
    silver: 500,
    gold: 600,
    bishop: 800,
    rook: 1000,
    king: 0,
    promPawn: 500,
    promLance: 500,
    promKnight: 500,
    promSilver: 600,
    horse: 1000,
    dragon: 1300,
  },
  aono: {
    pawn: 100,
    lance: 400,
    knight: 500,
    silver: 700,
    gold: 800,
    bishop: 1100,
    rook: 1200,
    king: 0,
    promPawn: 500,
    promLance: 500,
    promKnight: 500,
    promSilver: 600,
    horse: 1000,
    dragon: 1300,
  },
};

export const PIECE_SET_NAMES = Object.keys(PIECE_SETS);

/**
 * 持ち駒としての価値（取られて戻る元駒の値、D-010）。
 * 成駒を持ち駒にできないため、盤上評価と持ち駒評価で参照を分ける。
 */
const UNPROMOTE_MAP = {
  promPawn: "pawn",
  promLance: "lance",
  promKnight: "knight",
  promSilver: "silver",
  horse: "bishop",
  dragon: "rook",
};

export function handValueOf(type, values) {
  const base = UNPROMOTE_MAP[type] ?? type;
  return values[base] ?? 0;
}
