/**
 * 棋譜データ（KifuData）の型定義とヘルパー関数（設計書 第2部）
 */

/**
 * @typedef {Object} KifuHeader
 * @property {string} senteName - 先手の名前。KIFヘッダーに存在しない場合は "先手"。
 * @property {string} goteName  - 後手の名前。KIFヘッダーに存在しない場合は "後手"。
 */

/**
 * @typedef {Object} KifuEntry
 * @property {Move|null} move
 *   その手数の指し手。特殊表記の場合は null。
 * @property {string|null} specialNotation
 *   「投了」「中断」「千日手」等の特殊表記の場合にその文字列を入れる。通常の指し手の場合は null。
 *   不変条件：specialNotation !== null の要素は、存在する場合 entries 配列の末尾にのみ連続して出現する。
 */

/**
 * @typedef {Object} KifuData
 * @property {KifuHeader} header
 * @property {InitialPosition|null} initial
 *   棋譜の初期局面。平手開始の場合は null。
 * @property {KifuEntry[]} entries
 *   手順（1手目から順に格納）。特殊表記エントリは末尾に付与されうる。
 */

/**
 * 局面が平手（駒落ちでない）かどうかを判定する。
 * @param {InitialPosition|null} initial
 * @returns {boolean}
 */
export function isHirate(initial) {
  if (initial === null) return true; // 棋譜未読込・平手初期化
  return !initial.isHandicap;
}

/**
 * 先手（▲, SENTE）と後手（△, GOTE）が使う玉の表記（玉=GYOKU／王=OU）を返す。
 * 平手でも駒落ちでも常に 先手=玉・後手=王（引数 initial は現在使わない）。
 *
 * 駒落ちで変わらない理由: 慣例は「上手（駒を落とした側）が王、下手が玉」。駒落ちの上手は
 * KIFでは △（後手, GOTE）として記録される（1手目も△）ため、内部の先後に直すと平手と同じ
 * 対応になる。「先に指す側」ではなく「▲/△の記号」で決まる点に注意。
 * 詳細・出典: docs/requirements.md 8.11節
 * @param {InitialPosition|null} initial
 * @returns {{ senteKingLabel: 'OU'|'GYOKU', goteKingLabel: 'OU'|'GYOKU' }}
 */
export function determineKingLabels(initial) {
  return { senteKingLabel: 'GYOKU', goteKingLabel: 'OU' };
}