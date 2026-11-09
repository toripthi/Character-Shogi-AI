/**
 * 評価項: 攻め駒ボーナス（REQUIREMENTS §5.3、簡易版）。
 * 敵陣に入った攻め駒（飛・角・銀・桂・香・歩と、その成り駒）の寄与の合計 − 自陣に入られた敵の攻め駒の寄与の合計。
 *
 * 2026-11-09 改修（docs/specs/eval-2piece-spec-2026-11-09.md §3・§5）：
 *   1枚の寄与は、飛・角・馬・龍は 1（距離を見ない。遠くから利く駒）、それ以外は 1 × 敵玉との距離係数。
 *   敵陣の1段目にある金の動きの成り駒（と金・成香・成桂・成銀）は、敵玉との距離が3以上なら 0。
 *   相手の攻め駒が自陣に入った減点も、同じ数え方（相手から見た敵玉＝自玉との距離）で対称に扱う。
 *
 * 評価項: 飛車の筋（rookFile）。
 * 飛・竜が敵陣にいる筋の数。飛車の走る筋の重みの近似。
 */
import { chebyshev, attackPct, firstRankFar } from "../../proximity.js";
import { enemyOf, forEachPiece, inEnemyCamp, inOwnCamp, findKings } from "./util.js";

const ATTACK_PIECES = new Set([
  "pawn",
  "lance",
  "knight",
  "silver",
  "bishop",
  "rook",
  "promPawn",
  "promLance",
  "promKnight",
  "promSilver",
  "horse",
  "dragon",
]);

// 遠くから利く駒（距離係数を掛けない）
const LONG_RANGE = new Set(["bishop", "rook", "horse", "dragon"]);
// 金の動きをする成り駒（1段目のルールの対象）
const GOLD_MOVER_PROMOTED = new Set(["promPawn", "promLance", "promKnight", "promSilver"]);

/** 攻め駒1枚の寄与 × 100。 */
function contribution100(piece, file, rank, kings) {
  if (LONG_RANGE.has(piece.type)) {
    return 100;
  }
  const enemyKing = kings[enemyOf(piece.color)];
  const dist = enemyKing ? chebyshev(file, rank, enemyKing.file, enemyKing.rank) : null;
  const atFirstRank = piece.color === "black" ? rank === 1 : rank === 9;
  if (GOLD_MOVER_PROMOTED.has(piece.type) && firstRankFar(atFirstRank, dist)) {
    return 0;
  }
  return attackPct(dist);
}

export function attackTerm(board) {
  const turn = board.turn();
  const enemy = enemyOf(turn);
  const kings = findKings(board);
  let score = 0;
  forEachPiece(board, ({ piece, file, rank }) => {
    if (!ATTACK_PIECES.has(piece.type)) {
      return;
    }
    if (piece.color === turn && inEnemyCamp(rank, turn)) {
      score += contribution100(piece, file, rank, kings);
    } else if (piece.color === enemy && inOwnCamp(rank, turn)) {
      score -= contribution100(piece, file, rank, kings);
    }
  });
  return score / 100;
}

export function rookFileTerm(board) {
  const turn = board.turn();
  const enemy = turn === "black" ? "white" : "black";
  return sideFiles(board, turn) - sideFiles(board, enemy);
}

function sideFiles(board, color) {
  const files = new Set();
  forEachPiece(board, ({ piece, file, rank }) => {
    if (piece.color !== color || !inEnemyCamp(rank, color)) {
      return;
    }
    if (piece.type === "rook" || piece.type === "dragon") {
      files.add(file);
    }
  });
  return files.size;
}
