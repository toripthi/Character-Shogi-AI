/**
 * 盤マス・駒コマの実ピクセルサイズを比率から算出する（設計書 第4部8章）
 */

/**
 * 盤マス1つの実ピクセルサイズを算出する。
 *
 * 注意: board-layout.json の margin_ratio（左右上下の余白）と cell_ratio（1マスのピッチ）を
 * 単純に「左余白 + 9マス + 右余白」で足し合わせると、合計が画像全体の幅/高さ(=1.0)を
 * 超えてしまう（実測時に線の中心同士のピッチを cell_ratio としているため、9マス分の
 * 「線の中心から線の中心まで」の合計が、外枠の外側までを含む margin_ratio 分と
 * 独立に決まっているわけではない）。そのため cell_ratio をそのまま使うのではなく、
 * 「画像幅から左右の余白を引いた、実際の盤の内枠の幅」を9等分して算出する。
 *
 * @param {{width: number, height: number}} boardImageSize - 現在表示中の盤画像の実表示サイズ（px）
 * @param {Object} boardLayout - board-layout.json をパースしたオブジェクト
 * @returns {{width: number, height: number}} 盤マス1つの実ピクセルサイズ
 */
export function getSquareSizePx(boardImageSize, boardLayout) {
  const innerWidthRatio = 1 - boardLayout.margin_ratio.left - boardLayout.margin_ratio.right;
  const innerHeightRatio = 1 - boardLayout.margin_ratio.top - boardLayout.margin_ratio.bottom;
  return {
    width: (boardImageSize.width * innerWidthRatio) / boardLayout.grid.cols,
    height: (boardImageSize.height * innerHeightRatio) / boardLayout.grid.rows
  };
}

/**
 * 盤の外枠（1マス目の左上）が画像の左上端から何pxオフセットしているかを算出する。
 * board-layout.json の margin_ratio は「外枠の線の中心までの距離」の比率であり、
 * これを使わずに (file-1)*squareWidth だけでマスを敷き詰めると、マスの罫線と
 * 駒の位置が右・下に行くほどズレていく。
 * @param {{width: number, height: number}} boardImageSize - 現在表示中の盤画像の実表示サイズ（px）
 * @param {Object} boardLayout - board-layout.json をパースしたオブジェクト
 * @returns {{x: number, y: number}} 盤の描画開始位置オフセット（px）
 */
export function getBoardOriginPx(boardImageSize, boardLayout) {
  return {
    x: boardImageSize.width * boardLayout.margin_ratio.left,
    y: boardImageSize.height * boardLayout.margin_ratio.top
  };
}

/**
 * テクスチャ盤（画像に線が焼き込まれていない盤）に重ねる格子線の座標を算出する。
 *
 * board-layout.json の margin_ratio / cell_ratio は「線の中心位置」を実測した値のため、
 * ここで算出する線もgetSquareSizePx()/getBoardOriginPx()と全く同じ式を使い、駒・座標ラベルと
 * 座標系を一致させる（線だけ別ロジックで求めると、駒はマス中央なのに線だけズレる、という
 * 事態になりかねないため、必ずこの2関数の結果を再利用する）。
 * @param {{width: number, height: number}} boardImageSize - 現在表示中の盤画像の実表示サイズ（px）
 * @param {Object} boardLayout - board-layout.json をパースしたオブジェクト
 * @returns {{vertical: number[], horizontal: number[], originX: number, originY: number, innerWidth: number, innerHeight: number}}
 *   vertical/horizontalは各線のオフセット（原点からのpx距離、0〜cols/rows分）。
 *   originX/originYは盤内枠の左上、innerWidth/innerHeightは内枠全体のサイズ。
 */
export function getGridLinesPx(boardImageSize, boardLayout) {
  const squareSize = getSquareSizePx(boardImageSize, boardLayout);
  const origin = getBoardOriginPx(boardImageSize, boardLayout);
  const { cols, rows } = boardLayout.grid;

  const vertical = [];
  for (let i = 0; i <= cols; i++) {
    vertical.push(i * squareSize.width);
  }
  const horizontal = [];
  for (let i = 0; i <= rows; i++) {
    horizontal.push(i * squareSize.height);
  }

  return {
    vertical,
    horizontal,
    originX: origin.x,
    originY: origin.y,
    innerWidth: squareSize.width * cols,
    innerHeight: squareSize.height * rows
  };
}

/**
 * 星（星目）4点の座標を算出する。
 * wood.avif（既存の線入り盤）を実測した結果、星は「線index 3と6の交点」4箇所
 * （0始まりで線0〜9の10本のうち、左/上から4本目・7本目の交点）に打たれている。
 * これは9路盤の慣習上の位置（マス3とマス4の境界、マス6とマス7の境界の交点）と一致する。
 * @param {{width: number, height: number}} boardImageSize
 * @param {Object} boardLayout
 * @returns {{x: number, y: number}[]} 盤内枠左上を原点(0,0)とした4点のpx座標
 */
export function getStarPointsPx(boardImageSize, boardLayout) {
  const squareSize = getSquareSizePx(boardImageSize, boardLayout);
  const starLineIndexes = [3, 6]; // 実測（wood.avif）に基づく線index（0始まり、線0〜9の10本中）
  const points = [];
  for (const yi of starLineIndexes) {
    for (const xi of starLineIndexes) {
      points.push({
        x: xi * squareSize.width,
        y: yi * squareSize.height
      });
    }
  }
  return points;
}

/**
 * object-fit:cover で表示された盤画像サムネイル上に、格子線・星をどのpx座標に
 * 重ねればよいかを算出する（ハンバーガーメニュー「盤」タブのサムネイル用）。
 *
 * サムネイルは box（例:60x60の正方形）に対し、盤画像の原寸比率
 * （board-layout.jsonのimage.reference_width/height）を保ったまま
 * object-fit:cover で表示される。coverは「箱を隙間なく覆うように拡大し、
 * はみ出た分は上下または左右が切れる」動作のため、getGridLinesPx()が前提とする
 * 「boardImageSize=画像の実表示サイズ」とは基準が異なる（サムネイルでは画像の
 * 表示サイズがboxより大きく、中心を揃えてクロップされている）。
 * そのため、まず画像の原寸比率で「もし全体を表示したら何pxになるか」
 * （coverでスケールされた仮想サイズ）を求め、getGridLinesPx()/getStarPointsPx()を
 * その仮想サイズで呼んだ上で、box中心に対するクロップ分のオフセット
 * （はみ出た分の半分）を引く。これにより、盤面本体（board-view.js）の駒配置と
 * 完全に同じ比率ロジック（margin_ratio/cell_ratio）を再利用しつつ、
 * object-fit:coverによるクロップ位置のズレも正しく補正できる。
 * @param {{width: number, height: number}} box - サムネイル枠の実表示サイズ（px）
 * @param {Object} boardLayout - board-layout.json をパースしたオブジェクト
 * @returns {{grid: ReturnType<typeof getGridLinesPx>, stars: ReturnType<typeof getStarPointsPx>}}
 */
export function getGridOverlayForCoverBox(box, boardLayout) {
  const imgW = boardLayout.image.reference_width;
  const imgH = boardLayout.image.reference_height;
  const imgRatio = imgW / imgH;
  const boxRatio = box.width / box.height;

  // cover: 箱の縦横比より画像が「横長寄り」なら高さを箱に合わせて幅がはみ出し、
  // 「縦長寄り」なら幅を箱に合わせて高さがはみ出す。
  const scale = imgRatio > boxRatio ? (box.height / imgH) : (box.width / imgW);
  const virtualSize = { width: imgW * scale, height: imgH * scale };

  const cropOffsetX = (virtualSize.width - box.width) / 2;
  const cropOffsetY = (virtualSize.height - box.height) / 2;

  const grid = getGridLinesPx(virtualSize, boardLayout);
  const stars = getStarPointsPx(virtualSize, boardLayout);

  return {
    grid: {
      ...grid,
      originX: grid.originX - cropOffsetX,
      originY: grid.originY - cropOffsetY
    },
    stars: stars.map(pt => ({ x: pt.x, y: pt.y })),
    starsOrigin: { x: grid.originX - cropOffsetX, y: grid.originY - cropOffsetY }
  };
}

/**
 * 駒コマの描画矩形を算出する。
 * @param {{width: number, height: number}} squareSizePx - getSquareSizePx() の返り値
 * @param {{width: number, height: number}} pieceImageNaturalSize - 選択中の駒画像の実サイズ
 * @param {Object} pieceLayout - piece-layout.json をパースしたオブジェクト
 * @param {Object} pieceFit - piece-fit.json をパースしたオブジェクト
 * @returns {{width: number, height: number, offsetX: number, offsetY: number}}
 */
export function getPieceRenderRect(squareSizePx, pieceImageNaturalSize, pieceLayout, pieceFit) {
  // 駒コマ1つぶんの縦横比
  const cellWidth = pieceImageNaturalSize.width / pieceLayout.grid.cols;
  const cellHeight = pieceImageNaturalSize.height / pieceLayout.grid.rows;
  const cellAspect = cellWidth / cellHeight;

  // 駒の目標表示枠
  const targetWidth = squareSizePx.width * pieceFit.scale_ratio;
  const targetHeight = squareSizePx.height * pieceFit.scale_ratio;

  let renderWidth;
  let renderHeight;

  if (pieceFit.fit_mode === 'contain') {
    // 縦横比を保ったまま目標表示枠に収まる最大サイズ
    const targetAspect = targetWidth / targetHeight;
    if (cellAspect > targetAspect) {
      // 駒が横長 → 幅に合わせる
      renderWidth = targetWidth;
      renderHeight = targetWidth / cellAspect;
    } else {
      // 駒が縦長 → 高さに合わせる
      renderHeight = targetHeight;
      renderWidth = targetHeight * cellAspect;
    }
  } else {
    throw new Error(`未対応の fit_mode: ${pieceFit.fit_mode}`);
  }

  // オフセット計算
  let offsetX = 0;
  let offsetY = 0;

  if (pieceFit.horizontal_align === 'center') {
    offsetX = (squareSizePx.width - renderWidth) / 2;
  } else if (pieceFit.horizontal_align === 'left') {
    offsetX = 0;
  } else if (pieceFit.horizontal_align === 'right') {
    offsetX = squareSizePx.width - renderWidth;
  } else {
    throw new Error(`未対応の horizontal_align: ${pieceFit.horizontal_align}`);
  }

  if (pieceFit.vertical_align === 'bottom') {
    // 下辺接地（squareSizePx.height - renderHeight）と上下中央（(squareSizePx.height - renderHeight) / 2）の
    // ちょうど中間（下寄り具合を50%緩和）。実物の将棋盤では駒がマスに対してやや下寄りに見えるが、
    // 完全な下辺接地だと全体的に下寄りに見えるため、中央寄せに50%だけ寄せる。
    offsetY = (squareSizePx.height - renderHeight) * 0.75;
  } else if (pieceFit.vertical_align === 'top') {
    offsetY = 0;
  } else if (pieceFit.vertical_align === 'center') {
    offsetY = (squareSizePx.height - renderHeight) / 2;
  } else {
    throw new Error(`未対応の vertical_align: ${pieceFit.vertical_align}`);
  }

  return { width: renderWidth, height: renderHeight, offsetX, offsetY };
}

/**
 * スプライトシートから駒コマ1つ分を切り出すdiv要素を生成する。
 *
 * <img>のobject-fit:none + object-positionは「画像原寸をボックス内に置く」指定であり、
 * background-positionのような「切り出し位置の指定」としては機能しない。そのため、
 * divのbackground-image + background-size + background-positionでスプライトシートを
 * 1コマ分だけ切り出す方式を取る。この生成処理自体は board-view.js（盤上の駒）・
 * player-info.js（持ち駒欄）・nari-popup.js（成りポップアップ）・asset-drawer.js
 * （駒選択ドロワーのサムネイル）の4箇所で完全に同一のロジックが重複していたため、
 * ここに集約した。呼び出し側は返された要素を、目的の親要素（相対配置の基準となる
 * position:relative or overflow:hiddenの箱）へ appendChild するだけでよい。
 * @param {{width: number, height: number, offsetX: number, offsetY: number}} renderRect -
 *   getPieceRenderRect() の返り値（1コマの表示サイズ・親要素内でのオフセット）
 * @param {{row: number, col: number}} cell - resolvePieceCell() の返り値（切り出し対象のマス目位置）
 * @param {Object} pieceLayout - piece-layout.json をパースしたオブジェクト（grid.cols/rowsを参照する）
 * @param {string} pieceImageUrl - スプライトシート画像のURL（pieceAsset.image）
 * @returns {HTMLDivElement} まだどこにもappendされていないdiv要素
 */
export function createPieceSpriteElement(renderRect, cell, pieceLayout, pieceImageUrl) {
  const cols = pieceLayout.grid.cols;
  const rows = pieceLayout.grid.rows;

  // renderRect（1コマの表示サイズ）を基準に、スプライト画像全体の表示サイズを逆算する
  const bgWidth = renderRect.width * cols;
  const bgHeight = renderRect.height * rows;

  // スプライトの切り出し位置（表示サイズ基準）
  const bgX = -(cell.col * renderRect.width);
  const bgY = -(cell.row * renderRect.height);

  const spriteEl = document.createElement('div');
  spriteEl.style.position = 'absolute';
  spriteEl.style.left = `${renderRect.offsetX}px`;
  spriteEl.style.top = `${renderRect.offsetY}px`;
  spriteEl.style.width = `${renderRect.width}px`;
  spriteEl.style.height = `${renderRect.height}px`;
  spriteEl.style.overflow = 'hidden';
  spriteEl.style.pointerEvents = 'none';
  spriteEl.style.backgroundImage = `url(${pieceImageUrl})`;
  spriteEl.style.backgroundRepeat = 'no-repeat';
  spriteEl.style.backgroundSize = `${bgWidth}px ${bgHeight}px`;
  spriteEl.style.backgroundPosition = `${bgX}px ${bgY}px`;
  return spriteEl;
}

/**
 * 駒種から piece-layout.json 上の座標を求める。
 *
 * facingの決定について：
 * ここで言う「side」は「盤面反転(isFlipped)を加味した後の、画面上どちら向きに
 * 見せるべきか」を表す値である。盤上の駒描画（board-view.js）では、駒本来の
 * 所属（boardState上のSENTE/GOTE）をそのまま渡すのではなく、isFlippedと
 * 組み合わせて「画面上で正立させるべきか」を呼び出し側で判定してから渡すこと。
 * 反転時は先手・後手それぞれの見た目の向きが入れ替わる（盤ごと180度回転して
 * 見ている状態のため）。
 * 持ち駒欄（player-info.js）や成りポップアップ（nari-popup.js）のように、
 * 盤の反転と無関係に「そのプレイヤーから見て正しく読める向き」を出したい
 * 呼び出し元は、isFlippedを考慮せずそのままside（'SENTE'固定 等）を渡してよい。
 *
 * @param {PieceType} pieceType - 駒種（成る前の駒種を渡す。OUの場合はkingLabelと組み合わせる）
 * @param {Side} side - 表示上の向きを決めるための先手／後手（呼び出し元の意図により、盤の実所属そのままの場合と、isFlipped加味後の場合がある。上記説明を参照）
 * @param {boolean} promoted - 成り状態かどうか
 * @param {'OU'|'GYOKU'|null} kingLabel - pieceType==='OU'の場合のみ使用。それ以外はnull。
 * @param {Object} pieceLayout - piece-layout.json をパースしたオブジェクト
 * @returns {{row: number, col: number}}
 */
export function resolvePieceCell(pieceType, side, promoted, kingLabel, pieceLayout) {
  const facing = side === 'SENTE' ? 'upright' : 'inverted';

  if (pieceType === 'OU') {
    // 玉/王：col0固定。kingLabelで行を選ぶ
    const useGyoku = kingLabel === 'GYOKU';
    const rowEntry = pieceLayout.rows_meaning.find(
      r => r.facing === facing && r.promoted === useGyoku
    );
    if (!rowEntry) throw new Error(`piece-layout.json に行が見つかりません: facing=${facing}, promoted=${useGyoku}`);
    return { row: rowEntry.row, col: 0 };
  }

  // 通常の駒
  const rowEntry = pieceLayout.rows_meaning.find(
    r => r.facing === facing && r.promoted === promoted
  );
  if (!rowEntry) throw new Error(`piece-layout.json に行が見つかりません: facing=${facing}, promoted=${promoted}`);

  const colEntry = pieceLayout.columns.find(
    c => (promoted ? c.promotedId === pieceType : c.base === pieceType)
  );
  if (!colEntry) throw new Error(`piece-layout.json に列が見つかりません: pieceType=${pieceType}, promoted=${promoted}`);

  // 空セルチェック
  const isEmpty = pieceLayout.empty_cells.some(
    e => e.row === rowEntry.row && e.col === colEntry.col
  );
  if (isEmpty) {
    throw new Error(`空セルを参照しようとしました: row=${rowEntry.row}, col=${colEntry.col}`);
  }

  return { row: rowEntry.row, col: colEntry.col };
}
