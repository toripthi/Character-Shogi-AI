/**
 * ③⑤対戦相手情報・自分の情報＋持ち駒（共通化）（設計書 第4部4節）
 */
import { getPieceRenderRect, resolvePieceCell, createPieceSpriteElement } from '../assets/asset-fit.js';
import { findPieceAsset } from '../assets/asset-manifest.js';

/**
 * 持ち駒を描画する単一関数。
 * @param {HandPieces} pieces - 描画対象の持ち駒
 * @param {'LEFT'|'RIGHT'} alignment - 詰める方向。自分側='LEFT'、相手側='RIGHT'
 * @param {PieceType[]} order - 並び順（左→右）
 * @param {HTMLElement} containerEl - 描画先のDOM要素
 * @param {PieceType|null} selectedPieceType - 選択中の駒種（なければnull）
 * @param {{width: number, height: number}} squareSizePx - 盤マス1つの実ピクセルサイズ
 * @param {string} selectedPieceId - 描画対象の持ち駒欄に使う駒セットID。修正①（新規要望）で
 *   先手用・後手用の駒セットが分かれたため、呼び出し元（main.js）が「この持ち駒欄が
 *   今どちらの陣営の持ち駒か」に応じてselectedPieceIdSente/selectedPieceIdGoteのいずれかを
 *   解決してから渡す（このため引数の意味自体は従来と同じ「使う駒セットID」のまま変わらない）。
 * @param {Object} pieceLayout - piece-layout.json
 * @param {Object} pieceFit - piece-fit.json
 * @param {AssetManifest} manifest - アセットマニフェスト
 * @param {'SENTE'|'GOTE'} facingSide - 駒の正立/倒立を決める向き（将棋ウォーズ準拠の仕様変更）。
 *   持ち駒の実際の所属（先手/後手）とは無関係に、画面上の表示位置だけで決まる：
 *   画面奥（③対戦相手側）は常に 'GOTE'（倒立）、画面手前（⑤自分側）は常に 'SENTE'（正立）を渡す。
 *   盤面反転（isFlipped）時も③④の表示位置自体が入れ替わるだけで、
 *   「画面奥は倒立・画面手前は正立」というこのルール自体は変化しない。
 */
export function renderHandPieces(pieces, alignment, order, containerEl, selectedPieceType, squareSizePx, selectedPieceId, pieceLayout, pieceFit, manifest, facingSide) {
  // フル再描画
  // 注意: containerEl（#opponent-hand/#self-hand）はHTML側で既に
  // "hand-pieces-container" クラス（flex:1で親の幅を占有する役割）を持っている。
  // ここを className = '...' で上書きすると hand-pieces-container が消え、
  // 幅が潰れて持ち駒が実質見えなくなるため、classList で追加のみ行う。
  containerEl.innerHTML = '';
  containerEl.classList.add('hand-pieces', `hand-pieces--${alignment.toLowerCase()}`);

  const pieceAsset = findPieceAsset(manifest, selectedPieceId);
  const pieceImageSize = { width: pieceAsset.width, height: pieceAsset.height };

  for (const pieceType of order) {
    const count = pieces[pieceType];
    if (!count) continue; // 0枚は非表示

    const item = document.createElement('div');
    item.className = 'hand-piece';
    item.dataset.pieceType = pieceType;
    item.style.width = `${squareSizePx.width}px`;
    item.style.height = `${squareSizePx.height}px`;

    if (selectedPieceType === pieceType) {
      item.classList.add('hand-piece--selected');
    }

    // 駒画像（board-view.js と同じ理由で、<img>のobject-fit:none + object-positionではなく
    // background-image + background-size + background-positionでスプライトを切り出す）
    let cell;
    try {
      cell = resolvePieceCell(pieceType, facingSide, false, null, pieceLayout);
    } catch (e) {
      console.error(`持ち駒の描画に失敗しました (pieceType=${pieceType}):`, e);
      containerEl.appendChild(item);
      continue;
    }
    const renderRect = getPieceRenderRect(squareSizePx, pieceImageSize, pieceLayout, pieceFit);
    const spriteEl = createPieceSpriteElement(renderRect, cell, pieceLayout, pieceAsset.image);
    item.appendChild(spriteEl);

    // 複数枚の場合は右下に数字
    if (count > 1) {
      const countEl = document.createElement('span');
      countEl.className = 'hand-piece-count';
      countEl.textContent = String(count);
      item.appendChild(countEl);
    }

    containerEl.appendChild(item);
  }
}

// 修正③: 名前が固定幅ボックスに収まらない場合に段階的に縮小するフォントサイズ候補。
// rem基準(.player-name 0.875rem=14px相当)に合わせたem値で指定する。
// ルート可変時も比率で追従し、等倍containのため実測(scrollWidth/clientWidth)と一致する。
//
// 【不具合修正】サンプル棋譜「大橋宗桂（初代）」（全角8文字）がクリップされる
// 問題を受け、基準文字数を全角7文字→8文字に変更した。既存の縮小段階の
// 進み方（分母7の等差：6/7, 5/7, 4.5/7）と同じ考え方を保ったまま、
// 単純に全体を7/8倍して基準を8文字に引き伸ばす（要件定義書の合意通り）。
const PLAYER_NAME_FONT_SIZES = [1, 6 / 7, 5 / 7, 4.5 / 7].map((v) => `${(v * 7 / 8).toFixed(4)}em`);

// 段級位（ラベル行の「先手/後手」に続く部分）専用の縮小フォントサイズ候補。
// 【設計判断】段級位は自由入力ではなく rank-extractor.js の正規表現に
// マッチした語彙のみが入るため、最長ケース（例:「二十一世竜王」全角6文字）を
// 洗い出し済み。この範囲であれば最終段階のフォントサイズで必ず収まる想定のため、
// 名前欄と異なり clip は行わない（要件定義書合意：段級位はclip対象外）。
//
// 【注意】.player-labelの基本フォントサイズ(1em=0.625rem)は元々「先手」
// 「後手」の2文字専用に設計された値であり、.player-name（全角7文字基準）
// のような文字数基準は存在しない。そのためPLAYER_NAME_FONT_SIZESのような
// 「7/8倍」の再スケールは適用しない（1emの土台が違うため単純比較できない）。
// ここでは.player-nameと同じ「分母7の等差で4段階縮小する」という
// “縮小の進み方”だけを踏襲し、基準文字数はゼロから6文字用に設定する。
const PLAYER_RANK_FONT_SIZES = [1, 6 / 7, 5 / 7, 4.5 / 7].map((v) => `${v.toFixed(4)}em`);

/**
 * 指定した要素のフォントサイズを、候補配列の順に段階的に縮小しながら
 * 「ボックス幅に収まる」状態を探す共通ヘルパー。
 * 候補を全て試しても収まらない場合は、最後の（最小の）候補のまま返す
 * （呼び出し元が、その後にclipするかどうかを決める）。
 * @param {HTMLElement} el - フォントサイズを操作し、scrollWidth/clientWidthを測る要素
 * @param {string[]} fontSizes - 大きい順に並んだフォントサイズ候補（em文字列等）
 */
function shrinkToFit(el, fontSizes) {
  el.style.fontSize = '';
  for (const size of fontSizes) {
    if (el.scrollWidth <= el.clientWidth) break;
    el.style.fontSize = size;
  }
}

/**
 * ③⑤対局者名ボックス（先手/後手ラベル＋段級位＋名前）を描画する単一関数。
 * @param {HTMLElement} labelEl - ラベル（「先手 六段」等）を表示する要素。
 *   内部に `.player-label-side`（先手/後手、常に等倍・不変）と
 *   `.player-label-rank`（段級位、縮小対象）の2つのspanを組み立てる。
 * @param {HTMLElement} nameEl - 名前を表示する要素
 * @param {'SENTE'|'GOTE'} side - このボックスに表示する対局者の陣営
 *   （画面上の位置＝奥/手前ではなく、実際にどちらの駒か。反転時の入れ替えは
 *   呼び出し元（main.js）が既存のisFlippedルールに従って解決済みの値を渡す）
 * @param {string} name - 表示する名前（デフォルト値「先手」「後手」は呼び出し元で解決済み）
 * @param {string|null} rank - 段級位。KIFヘッダーに存在しない場合はnull。
 */
export function renderPlayerInfoBox(labelEl, nameEl, side, name, rank) {
  const sideLabel = side === 'SENTE' ? '先手' : '後手';

  // 【不具合修正】従来は labelEl.textContent = "先手 六段" のように
  // 1つのテキストノードへまとめて描画していたため、「先手/後手」自体まで
  // 縮小対象になってしまっていた。「先手/後手」は常に等倍で確保し、
  // 段級位部分のみを独立して縮小できるよう、2つのspanに分けて描画する。
  labelEl.innerHTML = '';
  const sideSpan = document.createElement('span');
  sideSpan.className = 'player-label-side';
  sideSpan.textContent = sideLabel;
  labelEl.appendChild(sideSpan);

  let rankSpan = null;
  if (rank) {
    labelEl.appendChild(document.createTextNode('\u00A0')); // 半角スペース相当（noBreakSpaceで折返し防止）
    rankSpan = document.createElement('span');
    rankSpan.className = 'player-label-rank';
    rankSpan.textContent = rank;
    labelEl.appendChild(rankSpan);
  }

  nameEl.textContent = name;

  // 修正③: 固定幅ボックスに収まるかを実測し、収まらなければフォントサイズを
  // 段階的に縮小する。まず基本サイズにリセットしてから測定する
  // （前回描画時に縮小された状態が残っていると正しく測定できないため）。
  shrinkToFit(nameEl, PLAYER_NAME_FONT_SIZES);

  // 段級位side（rankSpan）のみを縮小対象にする。「先手/後手」（sideSpan）は
  // 一切フォントサイズを操作しない＝常に確保される。
  // 判定に使う幅は rankSpan 自身ではなく labelEl 全体（親）で行う：
  // rankSpan単体のclientWidthは常に「必要なぶんぴったり」を返してしまい
  // （インライン要素が中身の幅で自然に確保されるため）、labelEl側の
  // 実際の残り幅と比較する意味のある測定にならないため。
  if (rankSpan) {
    rankSpan.style.fontSize = '';
    for (const size of PLAYER_RANK_FONT_SIZES) {
      if (labelEl.scrollWidth <= labelEl.clientWidth) break;
      rankSpan.style.fontSize = size;
    }
  }
}