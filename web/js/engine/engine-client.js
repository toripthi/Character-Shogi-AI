/**
 * メインスレッド側から Worker のエンジンを呼ぶ薄いラッパー。
 *   const engine = createEngineClient();
 *   await engine.newGame({ config: { persona: "ibisha-seme", book: { enabled: true } }, seed: 1 });
 *   const { usi, source, info } = await engine.think(["7g7f"]);   // 平手からの手順
 *   engine.restart();   // 思考中でも打ち切って Worker を作り直す（対局の中断・やり直し用）
 * think は Worker 内で順番に処理される。長い思考を途中で止める手段は restart（Worker の作り直し）だけ。
 */
export function createEngineClient({ workerUrl = new URL("./engine-worker.js", import.meta.url) } = {}) {
  let worker = null;
  let seq = 0;
  const pending = new Map();

  function rejectAll(message) {
    for (const p of pending.values()) p.reject(new Error(message));
    pending.clear();
  }

  function start() {
    worker = new Worker(workerUrl, { type: "module" });
    worker.onmessage = (e) => {
      const { id, ok, result, error } = e.data;
      const p = pending.get(id);
      if (!p) return;
      pending.delete(id);
      if (ok) p.resolve(result);
      else p.reject(new Error(error));
    };
    // Worker 自体の読み込み失敗・未捕捉の例外。待っている呼び出しをすべて失敗させる。
    worker.onerror = (e) => rejectAll(`エンジン Worker でエラー: ${e.message || "読み込みに失敗"}`);
  }

  function call(type, payload) {
    if (!worker) start();
    return new Promise((resolve, reject) => {
      const id = ++seq;
      pending.set(id, { resolve, reject });
      worker.postMessage({ id, type, ...payload });
    });
  }

  function terminate(reason = "エンジンを停止しました") {
    if (worker) worker.terminate();
    worker = null;
    rejectAll(reason);
  }

  return {
    newGame: (opts) => call("newGame", opts ?? {}),
    think: (moves) => call("think", { moves }),
    /** 「待った」：AI の内部状態を、平手から plies 手の局面を考える前に戻す（思考中なら、その思考が終わってから順に処理される） */
    rollback: (plies) => call("rollback", { plies }),
    restart() { terminate("エンジンを作り直しました"); start(); },
    terminate,
  };
}
