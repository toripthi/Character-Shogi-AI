/**
 * 指し手（Move）の型定義とヘルパー関数（設計書 第2部）
 */

/**
 * @typedef {Object} Square
 * @property {number} file - 筋（1〜9）
 * @property {number} rank - 段（1〜9）
 */

/**
 * @typedef {Object} Move
 * @property {'BOARD'|'DROP'} kind
 *   BOARD=盤上の駒を動かす、DROP=持ち駒を打つ
 * @property {Square|null} from
 *   移動元の座標。kind==='DROP' の場合は null。
 * @property {Square} to
 *   移動先の座標。
 * @property {PieceType} pieceType
 *   移動する駒の種類（移動前の駒種。成る場合も成る前の種類を入れる）。
 * @property {Side} side
 *   指した側（先手／後手）。
 * @property {boolean} promoted
 *   成りを選択したかどうか。kind==='DROP' の場合は常に false。
 * @property {PieceType|null} capturedPieceType
 *   移動先に相手の駒があった場合、その駒の種類（成り駒であれば成り状態を含む種類）。
 *   取らなかった場合は null。
 * @property {boolean} isCapture
 *   移動先に相手の駒があり、取る手だったかどうか。常に capturedPieceType !== null から導出される。
 */

/**
 * 2つのSquareが等しいかどうか
 * @param {Square|null} a
 * @param {Square|null} b
 * @returns {boolean}
 */
export function squaresEqual(a, b) {
  if (a === null || b === null) return a === b;
  return a.file === b.file && a.rank === b.rank;
}

/**
 * 2つのMoveが等しいかどうか（棋譜モード判定用）
 * kind, from, to, pieceType, side, promoted のフィールドで比較する。
 * capturedPieceType は比較対象に含めない（設計書 第3部3.3節）。
 * @param {Move} a
 * @param {Move} b
 * @returns {boolean}
 */
export function movesEqual(a, b) {
  if (a.kind !== b.kind) return false;
  if (!squaresEqual(a.from, b.from)) return false;
  if (!squaresEqual(a.to, b.to)) return false;
  if (a.pieceType !== b.pieceType) return false;
  if (a.side !== b.side) return false;
  if (a.promoted !== b.promoted) return false;
  return true;
}