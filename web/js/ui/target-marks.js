/**
 * 選んだ駒の動ける先に印を重ねる（この repo 独自）。空きマスは小さな点、相手の駒を取れるマスは輪。
 * 盤の描画（board-view.js）の後に毎回呼ぶ。盤の描画が .board-wrap を使い回している間は、前回の印を消して描き直す。
 */
import { getSquareSizePx, getBoardOriginPx } from "../assets/asset-fit.js";

export function renderTargetMarks(boardEl, boardLayout, boardState, targets) {
  const wrap = boardEl.querySelector(".board-wrap");
  const img = boardEl.querySelector(".board-image");
  if (!wrap || !img) return;
  wrap.querySelector(".target-marks-layer")?.remove();
  if (!targets.length) return;
  const size = { width: img.clientWidth, height: img.clientHeight };
  if (!size.width || !size.height) return;
  const sq = getSquareSizePx(size, boardLayout);
  const origin = getBoardOriginPx(size, boardLayout);

  const layer = document.createElement("div");
  layer.className = "target-marks-layer";
  for (const t of targets) {
    const dispFile = boardState.isFlipped ? t.file : 10 - t.file;
    const dispRank = boardState.isFlipped ? 10 - t.rank : t.rank;
    const el = document.createElement("div");
    const capture = !!boardState.squares[t.file - 1][t.rank - 1];
    el.className = `target-mark ${capture ? "target-mark--capture" : "target-mark--move"}`;
    el.style.left = `${origin.x + (dispFile - 1) * sq.width}px`;
    el.style.top = `${origin.y + (dispRank - 1) * sq.height}px`;
    el.style.width = `${sq.width}px`;
    el.style.height = `${sq.height}px`;
    layer.appendChild(el);
  }
  wrap.appendChild(layer);
}

/**
 * 盤上のクリック位置 → {file, rank}（盤の外なら null）。表示上の位置から実際の筋・段への変換は
 * board-view.js の描画（displayFile = isFlipped ? file : 10 - file）の逆変換。
 */
export function squareAtPoint(boardEl, boardLayout, boardState, clientX, clientY) {
  const img = boardEl.querySelector(".board-image");
  if (!img) return null;
  const rect = img.getBoundingClientRect();
  const size = { width: img.clientWidth, height: img.clientHeight };
  const sq = getSquareSizePx(size, boardLayout);
  const origin = getBoardOriginPx(size, boardLayout);
  const dispFile = Math.floor((clientX - rect.left - origin.x) / sq.width) + 1;
  const dispRank = Math.floor((clientY - rect.top - origin.y) / sq.height) + 1;
  if (dispFile < 1 || dispFile > 9 || dispRank < 1 || dispRank > 9) return null;
  return {
    file: boardState.isFlipped ? dispFile : 10 - dispFile,
    rank: boardState.isFlipped ? 10 - dispRank : dispRank,
  };
}
