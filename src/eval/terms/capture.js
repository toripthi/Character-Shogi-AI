/**
 * 手の項: 取る手への加減点（駒交換への態度。docs/specs/eval-2piece-spec-2026-11-09.md §7）。
 *
 * 局面ではなく「指し手」に対する項なので kind: "move"（retreat と同じ受け口）。
 * 取った駒の価値（style.pieceValues の、取った駒の型の値。持ち駒の割り増しや距離の割引は掛けない）を返す。
 * 取らない手は 0。重みは棋風ごとの合計（攻め +0.15 / バランス +0.05 / 守り -0.05。既定 +0.05 に特性の加算を重ねる）で、掛けて加減点にするのは呼び出し側
 * （selection の scoreRootMoves。実際に指すルートの手のスコアにだけ、margin 判定より前に足す）。
 * 探索の内部の局面評価には入れない。
 *
 * 傾斜（2026-11-12 本人指定）：相手陣（奥から数えて1〜4段目）で取る手は、取った駒の価値に
 * 「相手の玉の筋との距離」による傾斜を乗算する。相手の玉と関係ない位置の駒（遊び駒）を
 * むやみに取るのを抑える狙い。相手陣5段目より手前（中盤〜自陣）での取りには適用しない。
 *   筋距離 0〜2: +0.05 ／ 3: 0 ／ 4: -0.10 ／ 5: -0.25 ／ 6以上: -0.30
 *
 * 傾斜と重みの符号（2026-11-20 本人決定・案A）：傾斜は「加減点の絶対値」を縮める掛け算なので、
 * 重みが負（受け）のときは、遠い取りほど減点まで縮んで狙いと逆向きになる。そのため呼び出し側の
 * 重み（第4引数 weight）が負のときは傾斜を反転して適用する（遠い取りほど減点が大きくなる）。
 * 重みが正（攻め・バランス）のときの数値は従来と完全に同一。
 */
import { PIECE_SETS } from "../pieceSets.js";
import { IX_F } from "./fast.js";

/** 筋距離（0〜6。7以上は6と同じ）→ 価値への乗算傾斜 */
export const CAPTURE_KING_FILE_GRADIENT = [0.05, 0.05, 0.05, 0, -0.1, -0.25, -0.3];
/** 傾斜を適用する相手陣の深さ（奥から数えた段数の上限） */
export const CAPTURE_GRADIENT_MAX_DEPTH = 4;

/** 相手の玉の筋（1〜9）。見つからなければ null。参照実装には依存しない（import 経路の制約）。 */
function enemyKingFile(board, turn) {
  const fb = board.fb;
  if (fb) {
    const k = fb.kingSq[turn === "black" ? 1 : 0];
    return k >= 0 ? IX_F[k] : null;
  }
  for (let file = 1; file <= 9; file++) {
    for (let rank = 1; rank <= 9; rank++) {
      const piece = board.pieceAt(`${file}${"abcdefghi"[rank - 1]}`);
      if (piece && piece.type === "king" && piece.color !== turn) {
        return file;
      }
    }
  }
  return null;
}

/**
 * @param {object} board
 * @param {object} move
 * @param {object} [style]
 * @param {number} [weight] 呼び出し側が掛ける重み。負なら傾斜を反転する（冒頭の「傾斜と重みの符号」参照）。
 *   省略時は正の重みとして扱う（従来どおり）。
 */
export function captureTerm(board, move, style, weight = 1) {
  const captured = move.capturedPieceType;
  if (!captured) {
    return 0;
  }
  const values = style?.pieceValues ?? PIECE_SETS.kyuui;
  const base = values[captured] ?? 0;
  if (!base || !move.to) {
    return base;
  }
  const turn = board.turn();
  // 相手陣の深さ（奥から数えた段）：先手は段そのもの、後手は 10 − 段
  const depth = turn === "black" ? move.to.rank : 10 - move.to.rank;
  if (depth > CAPTURE_GRADIENT_MAX_DEPTH) {
    return base;
  }
  const kingFile = enemyKingFile(board, turn);
  if (kingFile === null) {
    return base;
  }
  const dist = Math.abs(move.to.file - kingFile);
  const gradient = CAPTURE_KING_FILE_GRADIENT[Math.min(dist, 6)];
  return base * (1 + (weight < 0 ? -gradient : gradient));
}
