/**
 * モジュール Worker の入口。メッセージの受け渡しだけを行い、中身は session.js。
 *   → { id, type:"newGame", config, seed, bookUrl? }   ← { id, ok:true, result: 実際の設定 } | { id, ok:false, error }
 *   → { id, type:"think", moves:[usi,...] }            ← { id, ok:true, result:{usi, source, info, opening} } | { id, ok:false, error }
 *   → { id, type:"rollback", plies }                   ← { id, ok:true, result:{restored} }（「待った」。AI の内部状態を plies 手目の前に戻す）
 * 思考は同期処理で最悪10秒（HARD_TIME_LIMIT_MS）かかるため、メインスレッドでは回さない。
 */
import { createEngineSession } from "./session.js";

const session = createEngineSession();
const DEFAULT_BOOK_URL = new URL("../../../data/book/book.json", import.meta.url);
let bookCache = null; // { url, data }

async function loadBook(url) {
  const href = String(url ?? DEFAULT_BOOK_URL);
  if (bookCache && bookCache.url === href) return bookCache.data;
  const res = await fetch(href);
  if (!res.ok) throw new Error(`定跡データを読めません: ${href}（HTTP ${res.status}）`);
  const data = await res.json();
  bookCache = { url: href, data };
  return data;
}

self.onmessage = async (e) => {
  const { id, type, ...p } = e.data ?? {};
  try {
    let result;
    if (type === "newGame") {
      const bookData = p.config?.book?.enabled ? await loadBook(p.bookUrl) : undefined;
      result = session.newGame({ config: p.config, seed: p.seed, bookData });
    } else if (type === "think") {
      result = session.think(p.moves ?? []);
    } else if (type === "rollback") {
      result = session.rollback(p.plies ?? 0);
    } else {
      throw new Error(`不明なメッセージ: ${type}`);
    }
    self.postMessage({ id, ok: true, result });
  } catch (err) {
    self.postMessage({ id, ok: false, error: String(err?.message ?? err) });
  }
};
