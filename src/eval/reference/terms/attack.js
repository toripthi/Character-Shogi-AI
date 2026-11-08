/**
 * 評価項: 攻め駒ボーナス（REQUIREMENTS §5.3、簡易版）。
 * 敵陣に入った攻め駒（飛・角・銀・桂・香・歩と、その成り駒）の数 − 自陣に入られた敵の攻め駒の数。
 *
 * 評価項: 飛車の筋（rookFile）。
 * 飛・竜が敵陣にいる筋の数。飛車の走る筋の重みの近似。
 */
import { enemyOf, forEachPiece, inEnemyCamp, inOwnCamp } from "./util.js";

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

export function attackTerm(board) {
  const turn = board.turn();
  const enemy = enemyOf(turn);
  let score = 0;
  forEachPiece(board, ({ piece, rank }) => {
    if (!ATTACK_PIECES.has(piece.type)) {
      return;
    }
    if (piece.color === turn && inEnemyCamp(rank, turn)) {
      score += 1;
    } else if (piece.color === enemy && inOwnCamp(rank, turn)) {
      score -= 1;
    }
  });
  return score;
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
