/**
 * 評価項で共通に使う盤面ヘルパー。
 * 座標は tsshogi 流（筋1〜9、段1〜9 = a〜i）。段1が先手から見て敵陣側。
 */
import { forEachPieceFast } from "../../../core/fastboard.js";

export const FILES = [1, 2, 3, 4, 5, 6, 7, 8, 9];
export const RANKS = [1, 2, 3, 4, 5, 6, 7, 8, 9];

/** (筋, 段) → "7g" のようなマス名 */
export function squareName(file, rank) {
  return `${file}${"abcdefghi"[rank - 1]}`;
}

/** 手番の反対 */
export function enemyOf(color) {
  return color === "black" ? "white" : "black";
}

/** color から見た敵陣（相手側3段）に rank があるか */
export function inEnemyCamp(rank, color) {
  return color === "black" ? rank <= 3 : rank >= 7;
}

/** color から見た自陣（自分側3段）に rank があるか */
export function inOwnCamp(rank, color) {
  return color === "black" ? rank >= 7 : rank <= 3;
}

/** color から見た敵陣の段番号の一覧 */
export function enemyCampRanks(color) {
  return color === "black" ? [1, 2, 3] : [7, 8, 9];
}

/**
 * 盤上の全駒を走査する。cb({ piece, file, rank, sq })
 * 走査順は 筋1→9、段1→9（従来の各項と同じ）。
 * → ShogiBoardFast（board.fb あり）であれば内部配列を直接読む
 *   （fastboard.js 側の forEachPieceFast に委譲する）。
 */
export function forEachPiece(board, cb) {
  if (board.fb) {
    forEachPieceFast(board, cb);
    return;
  }
  for (const file of FILES) {
    for (const rank of RANKS) {
      const sq = squareName(file, rank);
      const piece = board.pieceAt(sq);
      if (piece) {
        cb({ piece, file, rank, sq });
      }
    }
  }
}

/**
 * 両玉のマスを探す（2026-11-09：玉との距離で評価を変える項が使う）。玉がいない色は null。
 * @returns {{ black: {file:number, rank:number}|null, white: {file:number, rank:number}|null }}
 */
export function findKings(board) {
  const kings = { black: null, white: null };
  forEachPiece(board, ({ piece, file, rank }) => {
    if (piece.type === "king") {
      kings[piece.color] = { file, rank };
    }
  });
  return kings;
}
