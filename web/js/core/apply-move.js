/**
 * applyMove() / applyMoveToBoard()：指し手確定の唯一の入口（設計書 第4部2節）
 */
import { PROMOTION_MAP, PROMOTION_REVERSE_MAP } from '../models/board.js';

/**
 * 取った駒を持ち駒に加える（盤上の駒で取る場合・持ち駒を打って取る場合で共通）。
 * 成り駒は元の駒種に戻して加える。玉（OU）は持ち駒に入らない（持ち駒は7種のみ保持する。
 * 加えようとすると hand.OU が NaN になるため、ここで除外する）。
 * @param {HandPieces} hand - 加える先の持ち駒（呼び出し側でコピー済みのもの）
 * @param {PieceType} capturedType - 取った駒の駒種（成り状態を含む）
 */
function addCapturedToHand(hand, capturedType) {
  const baseType = PROMOTION_REVERSE_MAP[capturedType] || capturedType;
  if (baseType === 'OU') return;
  hand[baseType] += 1;
}

/**
 * Moveを盤面に適用する共通処理。
 * @param {BoardState} boardState - 適用前の盤面状態
 * @param {Move} move - 適用する指し手。kind/from/to/pieceType/side/promoted が確定済みであること。
 * @returns {{ boardState: BoardState, move: Move }}
 */
export function applyMoveToBoard(boardState, move) {
  // 移動元と移動先が同一マスの手は、将棋のルール上存在しない不正な手であるため
  // ここで確実にブロックする（UI層の選択解除漏れ等による自己移動を、盤面に反映させない
  // 最終防波堤として。詳細はselection.jsのhandleBoardTap参照）。
  if (move.kind === 'BOARD' && move.from
      && move.from.file === move.to.file && move.from.rank === move.to.rank) {
    throw new Error(`不正な手: 移動元と移動先が同一マスです (${move.from.file}${move.from.rank})`);
  }

  // 移動先に自分側の駒がある手も存在しない。通常はUI層（selection.js）が自分の駒の
  // タップを「選び直し」として処理するため到達しないが、到達すると自分の駒が
  // 消える（または自分の駒を取る）ため、上の自己移動と同様に最終防波堤で止める。
  const occupant = boardState.squares[move.to.file - 1][move.to.rank - 1];
  if (occupant && occupant.side === move.side) {
    throw new Error(`不正な手: 移動先に自分の駒があります (${move.to.file}${move.to.rank})`);
  }

  // 盤面をコピー（不変更新）
  const squares = boardState.squares.map(row => row.slice());
  const handSente = { ...boardState.handSente };
  const handGote = { ...boardState.handGote };

  let capturedPieceType = null;

  if (move.kind === 'DROP') {
    // 持ち駒を打つ
    const hand = move.side === 'SENTE' ? handSente : handGote;

    // 打つ先に相手の駒があった場合は、打った瞬間にその駒を取る（盤上の駒で取る場合と同じ扱い）。
    // 将棋のルールでは起こり得ない手だが、本アプリは打てるマスの判定をしない（要件定義書5.3節・8.6節）。
    // 上書きすると相手の駒が消えて駒の総数（40枚）が崩れるため、取る手として処理して保存する。
    const targetPiece = squares[move.to.file - 1][move.to.rank - 1];
    if (targetPiece) {
      capturedPieceType = targetPiece.type;
      addCapturedToHand(hand, targetPiece.type);
    }

    hand[move.pieceType] -= 1;
    squares[move.to.file - 1][move.to.rank - 1] = {
      type: move.pieceType,
      side: move.side,
      id: `p${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
    };
  } else {
    // 盤上の駒を動かす
    const piece = squares[move.from.file - 1][move.from.rank - 1];
    squares[move.from.file - 1][move.from.rank - 1] = null;

    // 移動先に駒があれば退避
    const targetPiece = squares[move.to.file - 1][move.to.rank - 1];
    if (targetPiece) {
      capturedPieceType = targetPiece.type;
      // 取った駒を持ち駒に加える（成り駒は元の駒種に戻す。玉は加えない）
      addCapturedToHand(move.side === 'SENTE' ? handSente : handGote, targetPiece.type);
    }

    // 移動先に駒を配置（成る場合は成り駒種に変換）
    const placedType = move.promoted ? (PROMOTION_MAP[move.pieceType] || move.pieceType) : move.pieceType;
    squares[move.to.file - 1][move.to.rank - 1] = {
      type: placedType,
      side: move.side,
      id: piece ? piece.id : `p${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
    };
  }

  const isCapture = capturedPieceType !== null;
  const finalMove = { ...move, capturedPieceType, isCapture };

  return {
    boardState: {
      squares,
      handSente,
      handGote,
      isFlipped: boardState.isFlipped
    },
    move: finalMove
  };
}

/**
 * UIの選択状態からMoveを組み立て、盤面に適用する。
 * @param {SelectedSource} source - 選択されていた移動元
 * @param {Square} target - 移動先の座標
 * @param {boolean|null} promoted - 成りの選択結果。成り選択が発生しない手の場合は null。
 * @param {BoardState} currentBoardState - 現在の盤面状態
 * @returns {{ boardState: BoardState, move: Move }}
 */
export function applyMove(source, target, promoted, currentBoardState) {
  const kind = source.origin === 'HAND' ? 'DROP' : 'BOARD';
  const from = source.origin === 'BOARD' ? source.square : null;
  const pieceType = source.pieceType;
  const side = source.side;
  const promotedFlag = kind === 'DROP' ? false : (promoted === true);

  const move = {
    kind,
    from,
    to: target,
    pieceType,
    side,
    promoted: promotedFlag,
    capturedPieceType: null,
    isCapture: false
  };

  return applyMoveToBoard(currentBoardState, move);
}