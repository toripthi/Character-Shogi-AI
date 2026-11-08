/**
 * 盤面・駒の型定義とヘルパー関数（設計書 第2部）
 */

/**
 * @typedef {'FU'|'KY'|'KE'|'GI'|'KI'|'KA'|'HI'|'OU'|
 *           'TO'|'NY'|'NK'|'NG'|'UM'|'RY'} PieceType
 * FU=歩 KY=香 KE=桂 GI=銀 KI=金 KA=角 HI=飛 OU=玉/王
 * TO=と NY=成香 NK=成桂 NG=成銀 UM=馬 RY=龍（成り駒）
 *
 * @typedef {'SENTE'|'GOTE'} Side
 * SENTE=先手（▲） GOTE=後手（△）
 *   ※ ▲/△の「記号」であり、指す順ではない。駒落ちでは上手（駒を落とした側）が先に指すが、
 *     上手は GOTE（△）、下手は SENTE（▲）として扱う。詳細: docs/requirements.md 8.11節
 *
 * @typedef {Object} Piece
 * @property {PieceType} type   - 駒種（成り状態を含む）
 * @property {Side} side        - 所属（先手／後手）
 * @property {string} id        - 駒個体を一意に識別するID（例: "p3"）
 */

/** 成る方向（元の駒種 → 成り駒種） */
export const PROMOTION_MAP = {
  FU: 'TO', KY: 'NY', KE: 'NK', GI: 'NG', KA: 'UM', HI: 'RY'
};

/** 成り解除方向（成り駒種 → 元の駒種） */
export const PROMOTION_REVERSE_MAP = {
  TO: 'FU', NY: 'KY', NK: 'KE', NG: 'GI', UM: 'KA', RY: 'HI'
};

/** 駒種→日本語表記の変換テーブル */
export const PIECE_TYPE_LABEL_JA = {
  FU: '歩', KY: '香', KE: '桂', GI: '銀', KI: '金', KA: '角', HI: '飛', OU: '玉',
  TO: 'と', NY: '成香', NK: '成桂', NG: '成銀', UM: '馬', RY: '龍'
};

/** 成り駒かどうか */
export function isPromotedPiece(pieceType) {
  return pieceType in PROMOTION_REVERSE_MAP;
}

/**
 * @typedef {Object} HandPieces
 * 駒種ごとの枚数を保持する。7種すべてのキーを常に持ち、存在しない（0枚の）
 * 駒種も値0として保持する。
 * @property {number} FU
 * @property {number} KY
 * @property {number} KE
 * @property {number} GI
 * @property {number} KI
 * @property {number} KA
 * @property {number} HI
 */

/** 空の持ち駒（全種0枚）を生成する */
export function createEmptyHandPieces() {
  return { FU: 0, KY: 0, KE: 0, GI: 0, KI: 0, KA: 0, HI: 0 };
}

/**
 * @typedef {Object} BoardState
 * @property {(Piece|null)[][]} squares
 *   9x9の盤面。squares[file][rank] でアクセスする。
 *   file: 1〜9（筋）、rank: 1〜9（段）を配列インデックス0〜8に対応させる（file-1, rank-1）。
 *   駒が存在しない升は null。
 * @property {HandPieces} handSente  - 先手の持ち駒
 * @property {HandPieces} handGote   - 後手の持ち駒
 * @property {boolean} isFlipped     - 盤面反転状態
 */

/**
 * @typedef {Object} InitialPosition
 * 駒落ち等、平手以外の初期局面を表現する。
 * @property {(Piece|null)[][]} squares
 * @property {HandPieces} handSente
 * @property {HandPieces} handGote
 * @property {boolean} isHandicap - 駒落ち等かどうか。玉/王の表記の判定には使わない（8.11節）。
 */

/** 平手初期配置を構築する */
function createHirateSquares() {
  const squares = Array.from({ length: 9 }, () => Array(9).fill(null));
  let idCounter = 0;
  const makePiece = (type, side) => ({ type, side, id: `p${idCounter++}` });

  // 先手（画面手前、rank 7-9。domain-model.md 7.4節：初手▲7六歩はrank=7であり、
  // これが先手の駒であることから、先手陣地はrank7〜9側と確定する）
  const senteBackRank = ['KY', 'KE', 'GI', 'KI', 'OU', 'KI', 'GI', 'KE', 'KY'];
  for (let file = 1; file <= 9; file++) {
    squares[file - 1][8] = makePiece(senteBackRank[file - 1], 'SENTE'); // 9段目
    squares[file - 1][6] = makePiece('FU', 'SENTE'); // 7段目（歩）
  }
  // 標準初形：2筋に飛車、8筋に角（file=2→squares[1]、file=8→squares[7]）
  squares[1][7] = makePiece('HI', 'SENTE'); // 2八飛
  squares[7][7] = makePiece('KA', 'SENTE'); // 8八角

  // 後手（画面奥、rank 1-3）
  const goteBackRank = ['KY', 'KE', 'GI', 'KI', 'OU', 'KI', 'GI', 'KE', 'KY'];
  for (let file = 1; file <= 9; file++) {
    squares[file - 1][0] = makePiece(goteBackRank[file - 1], 'GOTE'); // 1段目
    squares[file - 1][2] = makePiece('FU', 'GOTE'); // 3段目（歩）
  }
  // 標準初形：先手の2八飛・8八角と盤上で点対称になる配置（8二飛・2二角）
  squares[7][1] = makePiece('HI', 'GOTE'); // 8二飛
  squares[1][1] = makePiece('KA', 'GOTE'); // 2二角

  return squares;
}

/**
 * 盤面を初期化する。
 * @param {InitialPosition|null} initial
 *   棋譜データが持つ初期局面情報。平手の場合、または未読込（アプリ起動直後）の場合は null。
 * @returns {BoardState}
 */
export function createInitialBoardState(initial) {
  let squares;
  let handSente;
  let handGote;

  if (initial === null) {
    squares = createHirateSquares();
    handSente = createEmptyHandPieces();
    handGote = createEmptyHandPieces();
  } else {
    squares = initial.squares;
    handSente = initial.handSente;
    handGote = initial.handGote;
  }

  return {
    squares,
    handSente,
    handGote,
    isFlipped: false
  };
}