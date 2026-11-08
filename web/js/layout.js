/**
 * 盤の大きさの算出。
 * 出典の考え方: shogi-kifu-narabe js/main.js computeLayoutSizes()
 *   「盤画像＋padding＋持ち駒の帯×2＋固定の帯」が #app-frame の高さにちょうど収まるよう、
 *   マスの高さを方程式で解く。高さ律速と幅律速の小さい方を採る。
 *   盤サイズを実測値でなく式で決めることで、帯の高さ（--piece-h 連動）との循環参照を避ける。
 * この版は、固定の帯が「ヘッダ・棋譜バー・下部操作列」ではなく「対戦相手の帯（キャラ置き場）」になった点だけが違う。
 */
const PLAYER_INFO_BUFFER_REM = 0.1875; // vendor-player-info.css の --player-info-buffer と同じ値

export function computeLayoutSizes(appFrameEl, boardContainerEl, boardLayout) {
  const appFrameH = appFrameEl.clientHeight;
  if (!appFrameH) return null;

  const rootFontPx = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
  const bufferPx = PLAYER_INFO_BUFFER_REM * rootFontPx;

  // 固定で場所を取る要素（帯）と、帯の上下 margin（持ち駒の帯は --piece-h 連動なので式の側で扱う）
  // 帯は余った高さを受けて伸びる（flex-grow）ので、実高さではなく最小高さ（--stage-h）を使う。実高さを使うと循環する。
  const stageH = parseFloat(getComputedStyle(document.getElementById("stage-band")).minHeight);
  let marginsH = 0;
  for (const el of document.querySelectorAll(".player-info")) {
    const cs = getComputedStyle(el);
    marginsH += parseFloat(cs.marginTop) + parseFloat(cs.marginBottom);
  }
  const fixedH = stageH + marginsH + parseFloat(getComputedStyle(appFrameEl).paddingTop) + parseFloat(getComputedStyle(appFrameEl).paddingBottom);

  const cs = getComputedStyle(boardContainerEl);
  const paddingY = parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom);
  const paddingX = parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight);

  const innerH = 1 - boardLayout.margin_ratio.top - boardLayout.margin_ratio.bottom;
  const innerW = 1 - boardLayout.margin_ratio.left - boardLayout.margin_ratio.right;
  const rows = boardLayout.grid.rows;
  const imageRatio = boardLayout.image.reference_width / boardLayout.image.reference_height;

  // appFrameH = fixedH + 2*(S+buffer) + S*rows/innerH + paddingY  を S について解く
  const heightLimitedS = (appFrameH - fixedH - paddingY - 2 * bufferPx) / (rows / innerH + 2);
  const containerW = boardContainerEl.clientWidth - paddingX;
  const widthLimitedS = (containerW / imageRatio * innerH) / rows;

  const squareH = Math.min(heightLimitedS, widthLimitedS);
  if (!(squareH > 0)) return null;
  const squareW = squareH * (imageRatio * innerW / innerH);
  const boardImageH = (squareH * rows) / innerH;
  return {
    squareSize: { width: squareW, height: squareH },
    boardWrapWidth: boardImageH * imageRatio,
    boardWrapHeight: boardImageH,
  };
}
