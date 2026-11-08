/**
 * レイアウト定義JSON（board-layout / piece-layout / piece-fit）の読み込み。
 *
 * この3ファイルはアプリ実行中に変化しないため、asset-manifest.js の
 * loadAssetManifest() と同様にモジュール内でキャッシュし、取得は1回だけにする。
 * main.js（初期化）と nari-popup.js（成りポップアップ）の両方から使うので、
 * fetch を各所に書かず、必ずこの関数を経由すること。
 */

/**
 * @typedef {Object} Layouts
 * @property {Object} boardLayout - board-layout.json
 * @property {Object} pieceLayout - piece-layout.json
 * @property {Object} pieceFit - piece-fit.json
 */

let layoutsPromise = null;

async function fetchJson(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`${url} の読み込みに失敗しました (${response.status})`);
  }
  return response.json();
}

/**
 * @returns {Promise<Layouts>}
 */
export function loadLayouts() {
  // Promise自体を保持するので、同時に複数回呼ばれても取得は1回で済む。
  // 失敗した場合は次回呼び出しで再試行できるようキャッシュを破棄する。
  if (!layoutsPromise) {
    layoutsPromise = Promise.all([
      fetchJson('./assets/layout/board-layout.json'),
      fetchJson('./assets/layout/piece-layout.json'),
      fetchJson('./assets/layout/piece-fit.json')
    ])
      .then(([boardLayout, pieceLayout, pieceFit]) => ({ boardLayout, pieceLayout, pieceFit }))
      .catch((e) => {
        layoutsPromise = null;
        throw e;
      });
  }
  return layoutsPromise;
}
