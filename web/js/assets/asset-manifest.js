/**
 * 盤・駒アセット一覧の読み込み（設計書 第4部9章）
 */

/**
 * @typedef {Object} GridOverlayConfig
 * @property {boolean} enabled - trueの場合、board-view.jsが格子線・星をSVGで重ね描画する
 * @property {'white'|'black'} lineColor
 * @property {boolean} showStars
 *
 * @typedef {Object} BoardAssetEntry
 * @property {string} id
 * @property {string} label
 * @property {string} image
 * @property {number|null} width
 * @property {number|null} height
 * @property {GridOverlayConfig} [gridOverlay] - 画像に線が焼き込まれていないテクスチャ盤のみ持つ。
 *   未指定（wood/polyvinyl_chloride/darkなど既存の線入り盤）の場合はboard-view.js側で何も描画しない。
 *
 * @typedef {Object} PieceAssetEntry
 * @property {string} id
 * @property {string} label
 * @property {string} image
 * @property {number} width
 * @property {number} height
 *
 * @typedef {Object} AssetManifest
 * @property {BoardAssetEntry[]} boards
 * @property {PieceAssetEntry[]} pieces
 * @property {{board: string, pieces: string}} defaults
 */

let cachedManifest = null;

/**
 * assets-manifest.jsonをfetchしパースした結果を返す。
 * @returns {Promise<AssetManifest>}
 */
export async function loadAssetManifest() {
  if (cachedManifest) return cachedManifest;
  const response = await fetch('./assets/layout/assets-manifest.json');
  if (!response.ok) {
    throw new Error(`assets-manifest.json の読み込みに失敗しました (${response.status})`);
  }
  cachedManifest = await response.json();
  return cachedManifest;
}

/**
 * @param {AssetManifest} manifest
 * @param {string} boardId
 * @returns {BoardAssetEntry}
 */
export function findBoardAsset(manifest, boardId) {
  const entry = manifest.boards.find(b => b.id === boardId);
  if (!entry) throw new Error(`盤アセットが見つかりません: ${boardId}`);
  return entry;
}

/**
 * @param {AssetManifest} manifest
 * @param {string} pieceId
 * @returns {PieceAssetEntry}
 */
export function findPieceAsset(manifest, pieceId) {
  const entry = manifest.pieces.find(p => p.id === pieceId);
  if (!entry) throw new Error(`駒アセットが見つかりません: ${pieceId}`);
  return entry;
}