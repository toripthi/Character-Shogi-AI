/**
 * 評価項: 前進PST（位置価値テーブル）。
 * 攻め将棋は前進寄り（REQUIREMENTS §5.3）。
 * 段ベースの簡易テーブルで、玉には適用しない。
 * 符号は手番視点（自分の駒の合計 − 相手の駒の合計）。
 *
 * 値は持ち主から見た段 × 10（自陣の後段＝1段目で10、敵陣の後段＝9段目で90）。
 * 打った駒も置かれた段で数える。前進の役割は「駒をぶつかる位置まで運ぶこと」で、
 * 全ての値が正の一律の表にし、敵玉との距離係数は掛けない。
 * 2026-11-10 §3：前進の対象を歩・桂馬・銀だけに限定。金・香・飛・角・成り駒（と金・成桂・成銀・馬・龍など）には
 *   前進項の加点を付けない。
 * 2026-11-21 改修：旧作り（中央5段を0点とする符号つきの表に、敵玉との距離係数を掛ける）を廃し、この段表にした。
 *   旧作りでは自陣の駒が負の値を持ち、相手の駒の係数が「相手から見た敵玉＝自玉」との距離で決まるため、
 *   自玉が敵陣へ近づくほど相手の自陣駒の負値が増幅され、玉が前に出ることが自軍の加点になる逆転が起きた。
 */
import { enemyOf, forEachPiece } from "./util.js";

const TARGETS = new Set(["pawn", "knight", "silver"]);

function advanceBonus(rank, color) {
  // rank: 1〜9（1が先手から見て敵陣側）。持ち主から見た段（自陣の後段＝1）× 10。
  if (color === "black") {
    return (10 - rank) * 10;
  }
  return rank * 10;
}

export function advanceTerm(board) {
  const turn = board.turn();
  const enemy = enemyOf(turn);
  let score = 0;
  forEachPiece(board, ({ piece, rank }) => {
    if (!TARGETS.has(piece.type)) {
      return; // 歩・桂・銀以外は前進項の対象外
    }
    const b = advanceBonus(rank, piece.color);
    if (piece.color === turn) {
      score += b;
    } else if (piece.color === enemy) {
      score -= b;
    }
  });
  return score;
}
