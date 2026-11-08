/**
 * ④盤面・座標符号の描画（設計書 第5部）
 */
import { getSquareSizePx, getBoardOriginPx, getPieceRenderRect, resolvePieceCell, getGridLinesPx, getStarPointsPx, createPieceSpriteElement } from '../assets/asset-fit.js';
import { findBoardAsset, findPieceAsset } from '../assets/asset-manifest.js';
import { determineKingLabels } from '../models/kifu.js';
import { isPromotedPiece } from '../models/board.js';

let boardEl = null;
let boardWrapEl = null;
let boardImageEl = null;
let boardLayout = null;
let pieceLayout = null;
let pieceFit = null;
let manifest = null;
let imageLoadCallback = null;

/**
 * 盤画像・駒・ハイライト・座標ラベルの再配置一式。renderBoard()から呼ばれる。
 *
 * 修正（盤サイズ循環参照の根本対応）: .board-wrapのサイズ確定は
 * main.js側の方程式計算（computeLayoutSizes→setBoardWrapSizePx）が
 * 責務を持つ。ここではサイズ確定"済み"の.board-wrapを前提に、
 * 格子線・駒・座標ラベルの再配置だけを行う。
 * （旧resyncBoardSize()は、renderBoard()より前にサイズが確定する現方式では
 * 不要になったため削除した。）
 */
function renderBoardDependents(boardAsset, boardState, lastMove, pieceAssetBySide, selectedSource) {
  renderGridOverlay(boardAsset);
  placeSquareHighlights(boardState, lastMove);
  placePieces(boardState, pieceAssetBySide, selectedSource);
  renderCoordinates(boardState.isFlipped);
}

/**
 * 盤面描画の初期化。
 * @param {HTMLElement} containerEl - 盤面コンテナ
 * @param {Object} layouts - { boardLayout, pieceLayout, pieceFit }
 * @param {AssetManifest} assetManifest
 * @param {() => void} [onImageLoad] - 盤画像のロード完了時に呼ばれるコールバック（任意）。
 *   app-frameがheight:autoのため、画像ロード前後で実高さが変わりうる。
 *   呼び出し側（main.js）はこれを使ってscale再計算のタイミングを取る。
 */
export function initBoardView(containerEl, layouts, assetManifest, onImageLoad) {
  boardEl = containerEl;
  boardLayout = layouts.boardLayout;
  pieceLayout = layouts.pieceLayout;
  pieceFit = layouts.pieceFit;
  manifest = assetManifest;
  imageLoadCallback = onImageLoad || null;
}

/**
 * 盤面を描画する。
 * @param {BoardState} boardState
 * @param {string} selectedBoardId
 * @param {{sente: string, gote: string}} selectedPieceIds - 修正①（新規要望）:
 *   先手用・後手用それぞれの駒セットID。盤上の各駒は piece.side（今その駒を
 *   保有している陣営）に応じてどちらの画像セットを使うかを決める。
 * @param {SelectedSource|null} selectedSource
 * @param {Move|null} [lastMove] - 直前に指された手。移動元（lastMove.from）と
 *   移動先（lastMove.to）の両マスに背景ハイライト（淡い白／やや濃い淡い白）を敷き、
 *   将棋ウォーズ準拠で今どちらの手番かを視覚的にわかるようにする
 *   （placeSquareHighlights()参照。旧・黄色点滅の.board-piece--last-moveは廃止し、
 *   移動先の表現はこの静的背景ハイライトに一本化した）。
 * @param {{width: number, height: number}|null} [boardWrapSize] - 修正
 *   （盤サイズ循環参照の根本対応）: main.js側のcomputeLayoutSizes()が
 *   .board-containerの実測値を経由せず方程式で求めた.board-wrapの目標サイズ。
 *   渡された場合、boardWrapEl生成直後・使い回し時のどちらでも駒配置の
 *   前に必ずこのサイズを適用する。渡されなかった場合（呼び出し元が
 *   計算できなかった場合の保険）は、boardWrapElの現状サイズをそのまま使う。
 */
export function renderBoard(boardState, selectedBoardId, selectedPieceIds, selectedSource, lastMove, boardWrapSize) {
  if (!boardEl) return;

  const boardAsset = findBoardAsset(manifest, selectedBoardId);
  const pieceAssetBySide = {
    SENTE: findPieceAsset(manifest, selectedPieceIds.sente),
    GOTE: findPieceAsset(manifest, selectedPieceIds.gote)
  };

  // 修正（無限ループ対策）: 以前はrenderBoard()が呼ばれるたびに<img>要素を
  // 作り直していた。新しく生成された<img>はブラウザキャッシュがあっても
  // completeがfalseから始まり得るため、load完了時にimageLoadCallback()
  // （main.jsのrenderAll）を呼ぶ設計と組み合わさると、
  // 「renderAll → renderBoard → 新img生成 → load → renderAll → …」という
  // 再帰ループになり、CPUを食い潰し続けてしまう（盤しか出ない・端末が
  // 発熱する症状の原因）。
  // 対策: 盤画像（boardAsset.image）が前回と同じ場合はboardWrapEl／
  // boardImageElを使い回し、<img>の再生成・再ロードを起こさない。
  // 盤の種類を切り替えた場合のみ新しい<img>を生成してロード完了を待つ。
  const isSameBoardImage = boardWrapEl && boardImageEl
    && boardEl.contains(boardWrapEl)
    && boardImageEl.getAttribute('src') === boardAsset.image;

  const renderDependents = () => {
    // 修正（盤サイズ循環参照の根本対応）: 駒配置(placePieces等)は
    // boardImageEl.clientWidth/clientHeightを基準にするため、それより前に
    // 必ずboardWrapElへ目標サイズを適用する。boardWrapSizeが渡されなかった
    // 場合（呼び出し元がまだ計算できていない初回等）は、boardWrapElの
    // 現状サイズ（CSSでは無指定のためauto=中身依存）のまま進む。
    if (boardWrapSize) {
      boardWrapEl.style.width = `${Math.floor(boardWrapSize.width)}px`;
      boardWrapEl.style.height = `${Math.floor(boardWrapSize.height)}px`;
    }
    renderBoardDependents(boardAsset, boardState, lastMove, pieceAssetBySide, selectedSource);
  };

  if (isSameBoardImage) {
    // 盤画像は変わっていないので<img>はそのまま、駒・ハイライト・座標だけ描き直す。
    // imageLoadCallbackはここでは呼ばない（画像を再ロードしていないため）。
    renderDependents();
    return;
  }

  // 盤画像コンテナ
  boardEl.innerHTML = '';
  boardEl.className = 'board-container';

  // 盤画像と駒レイヤーの基準を一致させるためのラッパー。
  // .board-container 自体はflexで中央寄せされる領域（画像より広い場合がある）ため、
  // pieces-layer を直接 .board-container 基準（top:0,left:0,100%）で重ねると、
  // 中央寄せによる余白の分だけ盤画像の実位置とズレる。
  // このラッパーに position:relative を持たせ、画像とpieces-layerの両方をこの中に置くことで、
  // ラッパー自体がflexで中央寄せされても、内部の座標系（top:0,left:0,100%）は常に画像に一致する。
  boardWrapEl = document.createElement('div');
  boardWrapEl.className = 'board-wrap';
  boardEl.appendChild(boardWrapEl);

  // 盤画像
  boardImageEl = document.createElement('img');
  boardImageEl.src = boardAsset.image;
  boardImageEl.className = 'board-image';
  boardImageEl.draggable = false;
  boardWrapEl.appendChild(boardImageEl);

  // 画像ロード後にマス計算・駒配置・座標符号の描画を行う。
  // 3つとも boardImageEl.clientWidth/clientHeight（盤画像の実表示サイズ）に
  // 依存する計算のため、ロード完了を待たずに呼ぶと座標が0基準のまま描画されてしまう。
  // そのため必ずこの1関数にまとめてから呼び出す（個別に呼び出し口を増やさない）。
  // imageLoadCallback（main.jsのrenderAll）は「盤の実寸が変わった直後、持ち駒の
  // サイズ計算をやり直すため」の1回限りの通知として、新規ロード時のみ呼ぶ。
  const renderDependentsAndNotify = () => {
    renderDependents();
    if (imageLoadCallback) imageLoadCallback();
  };

  if (boardImageEl.complete) {
    renderDependentsAndNotify();
  } else {
    boardImageEl.addEventListener('load', renderDependentsAndNotify);
  }
}

/**
 * 盤面座標(file, rank)を、反転状態を加味した表示上の座標(displayFile, displayRank)に変換する。
 * placePieces() 内の座標計算と同一の規則（1筋=画面右端が非反転時の標準表記）に必ず合わせること。
 * @param {number} file
 * @param {number} rank
 * @param {boolean} isFlipped
 * @returns {{displayFile: number, displayRank: number}}
 */
function toDisplayCoord(file, rank, isFlipped) {
  const displayFile = isFlipped ? file : 10 - file;
  const displayRank = isFlipped ? 10 - rank : rank;
  return { displayFile, displayRank };
}

/**
 * テクスチャ盤（画像に線が焼き込まれていない盤）に、格子線・星をSVGで重ね描画する。
 * boardAsset.gridOverlay.enabled が true のときだけ描画し、それ以外（wood.avif等、
 * 画像自体に線が焼き込み済みの盤）では何もしない＝二重描画を避ける。
 *
 * 線・星の座標は asset-fit.js の getGridLinesPx()/getStarPointsPx() を通じて
 * board-layout.json の比率から算出したものをそのまま使う。これにより、駒の配置
 * （placePieces内 getSquareSizePx/getBoardOriginPx）と全く同じ基準になるため、
 * テクスチャ盤に切り替えても駒とマス目の位置がズレない。
 * @param {BoardAssetEntry} boardAsset
 */
function renderGridOverlay(boardAsset) {
  const existing = boardWrapEl.querySelector('.grid-overlay-layer');
  if (existing) existing.remove();

  const overlay = boardAsset.gridOverlay;
  if (!overlay || !overlay.enabled) return;

  const boardSize = { width: boardImageEl.clientWidth, height: boardImageEl.clientHeight };
  // 画像ロード直後などでまだ実寸が取れていない場合は描画をスキップ（次の再描画で改めて呼ばれる）
  if (!boardSize.width || !boardSize.height) return;

  const grid = getGridLinesPx(boardSize, boardLayout);
  // 「目立たないが、うっすら判別できる」バランス（要望に基づき確定）。
  // 純白(#fff)・純黒(#000)は使わず、白は#d8d8d5、黒は#272725
  // （白基準からの明度距離39を黒側にも対称に適用した値）とする。
  const strokeColor = overlay.lineColor === 'white' ? '#d8d8d5' : '#272725';

  const svgNs = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(svgNs, 'svg');
  svg.setAttribute('class', 'grid-overlay-layer');
  svg.setAttribute('width', String(boardSize.width));
  svg.setAttribute('height', String(boardSize.height));
  svg.setAttribute('viewBox', `0 0 ${boardSize.width} ${boardSize.height}`);

  const linesGroup = document.createElementNS(svgNs, 'g');
  linesGroup.setAttribute('stroke', strokeColor);
  linesGroup.setAttribute('stroke-width', '2');
  linesGroup.setAttribute('shape-rendering', 'crispEdges');

  grid.vertical.forEach(x => {
    const line = document.createElementNS(svgNs, 'line');
    const px = grid.originX + x;
    line.setAttribute('x1', String(px));
    line.setAttribute('y1', String(grid.originY));
    line.setAttribute('x2', String(px));
    line.setAttribute('y2', String(grid.originY + grid.innerHeight));
    linesGroup.appendChild(line);
  });

  grid.horizontal.forEach(y => {
    const line = document.createElementNS(svgNs, 'line');
    const py = grid.originY + y;
    line.setAttribute('x1', String(grid.originX));
    line.setAttribute('y1', String(py));
    line.setAttribute('x2', String(grid.originX + grid.innerWidth));
    line.setAttribute('y2', String(py));
    linesGroup.appendChild(line);
  });

  svg.appendChild(linesGroup);

  if (overlay.showStars) {
    const starPoints = getStarPointsPx(boardSize, boardLayout);
    const starsGroup = document.createElementNS(svgNs, 'g');
    // 目立たせすぎない: 既存wood.avifの黒丸相当ではなく、半透明かつ小さめの半径にする
    // （テクスチャ素材の見た目を線が邪魔しすぎないようにするため）。
    // 修正（星点の視認性調整・ユーザー要望）: 半径5px→4px、不透明度0.45→0.6に変更。
    // 色を少し濃くしつつ小さくすることで、盤面を邪魔しすぎない範囲で視認性を上げる。
    starsGroup.setAttribute('fill', strokeColor);
    starsGroup.setAttribute('opacity', '0.6');
    starPoints.forEach(pt => {
      const circle = document.createElementNS(svgNs, 'circle');
      circle.setAttribute('cx', String(grid.originX + pt.x));
      circle.setAttribute('cy', String(grid.originY + pt.y));
      circle.setAttribute('r', '4');
      starsGroup.appendChild(circle);
    });
    svg.appendChild(starsGroup);
  }

  // pieces-layer 等より先に挿入する（boardWrapEl先頭＝盤画像の直後）ことで、
  // 駒やハイライトより下のレイヤーになるようにする。
  boardWrapEl.appendChild(svg);
}

/**
 * 修正③（新規要望）: 直前に指した手の「移動元マス」「移動先マス（現在位置）」に
 * 背景ハイライトを描く。placePieces() は駒が存在するマスしかループしないため、
 * 移動元（多くの場合、駒が去った空マス）はここで別途描画する必要がある。
 * pieces-layer と同じ座標系（boardWrapEl基準）に重ねる別レイヤーとして追加し、
 * この関数は必ず placePieces() より先に呼ぶ（駒の下に敷く＝視覚的に駒が前面に来る）。
 * @param {BoardState} boardState
 * @param {Move|null} lastMove
 */
function placeSquareHighlights(boardState, lastMove) {
  const existing = boardWrapEl.querySelector('.square-highlights-layer');
  if (existing) existing.remove();

  if (!lastMove) return;

  const boardSize = { width: boardImageEl.clientWidth, height: boardImageEl.clientHeight };
  const squareSize = getSquareSizePx(boardSize, boardLayout);
  const boardOrigin = getBoardOriginPx(boardSize, boardLayout);

  const layer = document.createElement('div');
  layer.className = 'square-highlights-layer';
  boardWrapEl.appendChild(layer);

  const addHighlight = (square, modifierClass) => {
    if (!square) return; // 駒打ち（DROP）は from が null のため対象外
    const { displayFile, displayRank } = toDisplayCoord(square.file, square.rank, boardState.isFlipped);
    const el = document.createElement('div');
    el.className = `board-square-highlight ${modifierClass}`;
    el.style.left = `${boardOrigin.x + (displayFile - 1) * squareSize.width}px`;
    el.style.top = `${boardOrigin.y + (displayRank - 1) * squareSize.height}px`;
    el.style.width = `${squareSize.width}px`;
    el.style.height = `${squareSize.height}px`;
    layer.appendChild(el);
  };

  addHighlight(lastMove.from, 'board-square-highlight--from');
  addHighlight(lastMove.to, 'board-square-highlight--to');
}

/**
 * 駒を配置する。
 * @param {BoardState} boardState
 * @param {{SENTE: Object, GOTE: Object}} pieceAssetBySide - 修正①（新規要望）:
 *   陣営ごとの駒画像アセット。各駒の描画時は piece.side（現在の保有者。取った駒は
 *   持ち駒になった時点で保有者側のsideに書き換わる既存仕様＝apply-move.js）で
 *   引くため、成り駒や相手から取った駒であっても「今それを持っている側」の
 *   見た目になる（要望の「取った瞬間に持ってる側の駒に変換される」と一致）。
 * @param {SelectedSource|null} selectedSource
 */
function placePieces(boardState, pieceAssetBySide, selectedSource) {
  // 既存の駒要素をクリア（pieces-layer は boardWrapEl 側に付け替えたため、そちらから探す）
  const existing = boardWrapEl.querySelector('.pieces-layer');
  if (existing) existing.remove();

  const boardSize = { width: boardImageEl.clientWidth, height: boardImageEl.clientHeight };
  const squareSize = getSquareSizePx(boardSize, boardLayout);
  const boardOrigin = getBoardOriginPx(boardSize, boardLayout);
  // 先手=玉・後手=王。駒落ちでも同じ（上手=後手=王。docs/requirements.md 8.11節）。
  const kingLabels = determineKingLabels(null);

  const piecesLayer = document.createElement('div');
  piecesLayer.className = 'pieces-layer';
  // boardEl（flexで中央寄せされる領域）ではなく boardWrapEl（画像とサイズが一致するラッパー）に
  // 追加することで、top:0/left:0/100% の基準を常に盤画像の実位置に一致させる。
  boardWrapEl.appendChild(piecesLayer);

  for (let file = 1; file <= 9; file++) {
    for (let rank = 1; rank <= 9; rank++) {
      const piece = boardState.squares[file - 1][rank - 1];
      if (!piece) continue;

      // 表示位置の計算（反転対応）
      // 筋（file）は「非反転時：1筋が画面右端、9筋が画面左端」が将棋の標準表記。
      // renderCoordinates() の座標ラベルはこの規則で描画しているため、駒側のX座標も
      // 同じ規則（displayFile=1のとき右端＝9マス目）に合わせる必要がある。
      const { displayFile, displayRank } = toDisplayCoord(file, rank, boardState.isFlipped);

      const kingLabel = piece.side === 'SENTE' ? kingLabels.senteKingLabel : kingLabels.goteKingLabel;
      // 駒の向き（正立/倒立）は盤の実所属（piece.side）だけでなく、盤面反転(isFlipped)も
      // 加味する必要がある。反転＝盤ごと180度回転して見ている状態なので、反転時は
      // 見た目の向きが先手・後手で入れ替わる（asset-fit.js resolvePieceCell()のコメント参照）。
      const displaySide = boardState.isFlipped
        ? (piece.side === 'SENTE' ? 'GOTE' : 'SENTE')
        : piece.side;
      // piece.type は成り状態を含む駒種（例: TO, RY）を保持しているため、
      // resolvePieceCell() には「成り後IDかどうか」を渡す必要がある。
      // ただしOU（王/玉）は成りの概念がなく、promotedはkingLabelの読み替えに使われる
      // 特殊仕様のため、常にfalseで固定する（board.js Piece.type の定義参照）。
      const promotedFlag = piece.type === 'OU' ? false : isPromotedPiece(piece.type);

      // 1マスのセル解決に失敗しても他マスの描画を止めないようにする。
      // resolvePieceCell()はpiece-layout.jsonに該当セルが無いとthrowする仕様のため、
      // ここでcatchしないと for ループ全体が中断し、以降の駒が軒並み描画されなくなる。
      let cell;
      try {
        cell = resolvePieceCell(piece.type, displaySide, promotedFlag, kingLabel, pieceLayout);
      } catch (e) {
        console.error(`駒の描画に失敗しました (file=${file}, rank=${rank}, type=${piece.type}):`, e);
        continue;
      }

      const pieceEl = document.createElement('div');
      pieceEl.className = 'board-piece';
      pieceEl.dataset.file = String(file);
      pieceEl.dataset.rank = String(rank);

      // 選択中ハイライト（修正③: 移動元と同系色の淡い白＋点滅。CSS側 .board-piece--selected 参照）
      if (selectedSource && selectedSource.origin === 'BOARD'
          && selectedSource.square && selectedSource.square.file === file
          && selectedSource.square.rank === rank) {
        pieceEl.classList.add('board-piece--selected');
      }

      // 修正③（新規要望）: 「直前に動いた駒」の点滅表示（旧 .board-piece--last-move、黄色）は廃止。
      // 移動先マスの表現は placeSquareHighlights() が描く静的な背景ハイライト
      // （濃い淡い白）に一本化した。lastMove引数は placeSquareHighlights() 側で
      // 引き続き使用するため、renderBoard/placePieces のシグネチャからは削除していない。

      // 駒画像をスプライトから切り出し
      // 修正①（新規要望）: piece.side（今この駒を保有している陣営。表示上の反転とは無関係の
      // 実所属）に応じて、先手用／後手用いずれの画像セットを使うかを決める。
      const pieceAsset = pieceAssetBySide[piece.side];
      renderPieceImage(pieceEl, pieceAsset, cell, squareSize);

      // 配置位置（盤の外枠オフセット分を加算する）
      pieceEl.style.left = `${boardOrigin.x + (displayFile - 1) * squareSize.width}px`;
      pieceEl.style.top = `${boardOrigin.y + (displayRank - 1) * squareSize.height}px`;
      pieceEl.style.width = `${squareSize.width}px`;
      pieceEl.style.height = `${squareSize.height}px`;

      piecesLayer.appendChild(pieceEl);
    }
  }
}

/**
 * 駒画像をスプライトから切り出して配置する。
 *
 * <img>のobject-fit:none + object-positionは「画像原寸をボックス内に置く」指定であり、
 * background-positionのような「切り出し位置の指定」としては機能しない。
 * そのため、divのbackground-image + background-size + background-positionで
 * スプライトシートを1コマ分だけ切り出す方式に置き換える。
 */
function renderPieceImage(pieceEl, pieceAsset, cell, squareSize) {
  const pieceImageSize = { width: pieceAsset.width, height: pieceAsset.height };
  const renderRect = getPieceRenderRect(squareSize, pieceImageSize, pieceLayout, pieceFit);

  pieceEl.innerHTML = '';
  const spriteEl = createPieceSpriteElement(renderRect, cell, pieceLayout, pieceAsset.image);
  pieceEl.appendChild(spriteEl);
}

/**
 * 座標符号を描画する。
 */
function renderCoordinates(isFlipped) {
  // 既存の座標要素をクリア
  const existing = document.querySelectorAll('.coordinate-label');
  existing.forEach(el => el.remove());

  if (!boardWrapEl) return;

  const boardSize = { width: boardImageEl.clientWidth, height: boardImageEl.clientHeight };
  const squareSize = getSquareSizePx(boardSize, boardLayout);
  const boardOrigin = getBoardOriginPx(boardSize, boardLayout);

  // 修正（筋番号ラベルが.board-containerのoverflow:hiddenで上半分が
  // 切れる不具合の根本対応）: 従来はラベルのtopを'-8px'という固定値で
  // 指定していた。.board-containerのpadding-top（座標ラベル用の余白）は
  // rem基準でhtmlのfont-sizeに応じて可変（clamp(14px,3.6vmin+4px,19px)）
  // なので、固定8pxでは実際のpadding-topと連動せず、フォントサイズが
  // 大きい端末ではラベル文字の上半分がpadding領域からはみ出し、
  // .board-containerのoverflow:hiddenで物理的に切り取られていた
  // （「数字が若干切れている」として報告された不具合）。
  // .board-containerの実測padding-topを取得し、その中央（padding領域の
  // ちょうど真ん中）に文字の中心が来るよう配置する。これなら文字サイズ
  // (0.625rem)がpadding-top以下である限り、はみ出しが起きない。
  const containerCs = boardEl ? window.getComputedStyle(boardEl) : null;
  const paddingTopPx = containerCs ? parseFloat(containerCs.paddingTop) : 10;
  const fileLabelTop = -(paddingTopPx / 2);

  // 筋（上）※ boardWrapEl は画像と同サイズなので、pieces-layer と同じ基準（top:0,left:0）で配置できる
  const files = isFlipped ? [1,2,3,4,5,6,7,8,9] : [9,8,7,6,5,4,3,2,1];
  files.forEach((file, i) => {
    const label = document.createElement('div');
    label.className = 'coordinate-label coordinate-label--file';
    label.textContent = String(file);
    label.style.left = `${boardOrigin.x + i * squareSize.width + squareSize.width / 2}px`;
    label.style.top = `${fileLabelTop}px`;
    boardWrapEl.appendChild(label);
  });

  // 段（右）
  const ranks = isFlipped ? [9,8,7,6,5,4,3,2,1] : [1,2,3,4,5,6,7,8,9];
  const kanji = ['一','二','三','四','五','六','七','八','九'];
  ranks.forEach((rank, i) => {
    const label = document.createElement('div');
    label.className = 'coordinate-label coordinate-label--rank';
    label.textContent = kanji[rank - 1];
    label.style.top = `${boardOrigin.y + i * squareSize.height + squareSize.height / 2}px`;
    label.style.left = `${boardSize.width + 6}px`;
    boardWrapEl.appendChild(label);
  });
}