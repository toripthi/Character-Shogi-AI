/**
 * 評価項: 前進PST（位置価値テーブル）。
 * 攻め将棋は前進寄り（REQUIREMENTS §5.3）。
 * 段ベースの簡易テーブルで、玉には適用しない。
 * 符号は手番視点（自分の駒の合計 − 相手の駒の合計）。
 * 値は持ち主から見た段 × 10（自陣の後段＝1段目で10、敵陣の後段＝9段目で90）で、全て正の値。
 * 敵玉との距離係数は掛けない。意味の説明は参照実装のファイル先頭を見る。
 *
 * 2026-11-05：駒リストを直接読む高速版。値は参照実装（src/eval/reference/terms/advance.js）と同じ。
 * 2026-11-10 §3：前進の対象を歩・桂馬・銀だけに限定（金・香・飛・角・成り駒・馬・龍には前進項の加点を付けない）。
 * 2026-11-21 改修：中央0点の符号つき表＋距離係数から、この一律の段表に作り替えた。
 */
import { IX_R, PAWN, KNIGHT, SILVER } from "./fast.js";
import { referenceAdvanceTerm } from "../reference-link.js";

// 前進の対象（歩・桂馬・銀。成っていないものだけ）の型の集合（ビット）
let TARGET_MASK = 0;
for (const t of [PAWN, KNIGHT, SILVER]) {
  TARGET_MASK |= 1 << t;
}

export function advanceTerm(board) {
  const fb = board.fb;
  if (!fb) {
    return referenceAdvanceTerm(board);
  }
  const turn = fb.turnN;
  const cells = fb.board;
  let score = 0;
  for (let c = 0; c < 2; c++) {
    const pos = fb.piecePos[c];
    const n = fb.pieceCnt[c];
    let side = 0;
    for (let i = 0; i < n; i++) {
      const ix = pos[i];
      const t = cells[ix] & 15;
      if (((TARGET_MASK >> t) & 1) === 0) {
        continue; // 歩・桂・銀以外は前進項の対象外
      }
      // rank: 1〜9（1が先手から見て敵陣側）。持ち主から見た段（自陣の後段＝1）× 10。
      const rank = IX_R[ix];
      side += (c === 0 ? 10 - rank : rank) * 10;
    }
    if (c === turn) {
      score += side;
    } else {
      score -= side;
    }
  }
  return score;
}
