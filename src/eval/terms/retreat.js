/**
 * 手の項: 後退ペナルティ（手を渡さない傾向、REQUIREMENTS §5.3）。
 *
 * 局面ではなく「指し手」に対する項なので kind: "move"。
 * 自陣方向への後退（先手ならrank増、後手ならrank減）なら 1、それ以外は 0 を返す
 * （重みを掛けて減点にするのは呼び出し側）。玉の移動と打つ手は対象外。
 *
 * ⚠ 現状、探索・選択のどちらからも呼ばれていない（未接続）。
 *   seme の retreat 重みは設定されているが、まだ棋風に効いていない。
 */
export function retreatTerm(board, move) {
  if (!move.from || typeof move.from !== "object") {
    return 0; // 打つ手は対象外
  }
  if (move.pieceType === "king") {
    return 0;
  }
  const turn = board.turn();
  const dr = move.to.rank - move.from.rank;
  const isRetreat = turn === "black" ? dr > 0 : dr < 0;
  return isRetreat ? 1 : 0;
}
