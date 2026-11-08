/**
 * 成り選択ポップアップ（この repo 独自。流用元 nari-popup.js は app-state に依存するため、同じ見た目・同じ CSS クラスで作り直した）。
 * 成るか成らないかは、エンジンが「両方合法」と答えた手だけで出す（game/input.js）。強制成りではここに来ない。
 *   const popup = createPromotionPopup({ layouts, manifest, pieceId });
 *   const answer = await popup.ask("KA");   // true=成る / false=成らない / "CANCEL"
 *   popup.close();                          // 開いていれば "CANCEL" で閉じる
 */
import { PROMOTION_MAP } from "../models/board.js";
import { resolvePieceCell, getPieceRenderRect, createPieceSpriteElement } from "../assets/asset-fit.js";
import { findPieceAsset } from "../assets/asset-manifest.js";

export function createPromotionPopup({ layouts, manifest, pieceId }) {
  let overlay = null;
  let settle = null;

  function icon(btn, pieceType, promoted) {
    const asset = findPieceAsset(manifest, pieceId);
    // 向きは常に正立（先手）。流用元と同じ規約（将棋ウォーズ準拠）
    const cell = resolvePieceCell(pieceType, "SENTE", promoted, null, layouts.pieceLayout);
    const r = btn.getBoundingClientRect();
    const rect = getPieceRenderRect({ width: r.width, height: r.height }, { width: asset.width, height: asset.height }, layouts.pieceLayout, layouts.pieceFit);
    btn.appendChild(createPieceSpriteElement(rect, cell, layouts.pieceLayout, asset.image));
  }

  function close(answer = "CANCEL") {
    if (overlay) { overlay.remove(); overlay = null; }
    if (settle) { const s = settle; settle = null; s(answer); }
  }

  function ask(pieceType) {
    close();
    return new Promise((resolve) => {
      settle = resolve;
      overlay = document.createElement("div");
      overlay.className = "nari-popup-overlay";
      const box = document.createElement("div");
      box.className = "nari-popup";
      const mk = (cls, answer) => {
        const b = document.createElement("button");
        b.type = "button";
        b.className = `nari-popup-btn ${cls}`;
        b.addEventListener("click", () => close(answer));
        box.appendChild(b);
        return b;
      };
      const yes = mk("nari-popup-btn--promote", true); // 成る（左）
      const no = mk("nari-popup-btn--not-promote", false); // 成らない（右）
      overlay.appendChild(box);
      overlay.addEventListener("click", (e) => { if (e.target === overlay) close("CANCEL"); });
      document.body.appendChild(overlay);
      // 大きさが決まってから駒を描く
      icon(yes, PROMOTION_MAP[pieceType] ?? pieceType, true);
      icon(no, pieceType, false);
    });
  }

  return { ask, close };
}
