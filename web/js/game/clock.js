/**
 * 経過時間（加算表示）の時計。持ち時間による負けは無い。
 * 動いている間は「いま手番の側」の時間だけが増える。now は注入できる（テスト用）。
 */
export function createClock({ now = () => Date.now() } = {}) {
  const total = { SENTE: 0, GOTE: 0 };
  let running = null; // 動いている側
  let since = 0; // 最後に累計へ足した時刻
  let turnStart = 0; // 今の手番が始まった時刻（1手に使った時間の計測用）

  function settle() {
    if (!running) return;
    const t = now();
    total[running] += t - since;
    since = t;
  }

  return {
    /** side の時計を動かす（動いていた側は止まる） */
    start(side) {
      settle();
      running = side;
      since = turnStart = now();
    },
    /** 動いている側を止める。止めた側を返す（動いていなければ null） */
    stop() {
      settle();
      const s = running;
      running = null;
      return s;
    },
    /** 手番交代。動いていた側がこの手に使った ms を返し、next の時計を動かし始める */
    switchTo(next) {
      settle();
      const t = now();
      const used = running ? Math.max(0, t - turnStart) : 0;
      running = next;
      since = turnStart = t;
      return used;
    },
    /** side の累計 ms */
    elapsed(side) {
      settle();
      return total[side];
    },
    running: () => running,
    reset() {
      total.SENTE = 0;
      total.GOTE = 0;
      running = null;
    },
  };
}

/** ms → "mm:ss"（1時間以上は "h:mm:ss"） */
export function formatClock(ms) {
  const s = Math.floor(Math.max(0, ms) / 1000);
  const h = Math.floor(s / 3600);
  const mm = String(Math.floor((s % 3600) / 60)).padStart(h ? 2 : 2, "0");
  const ss = String(s % 60).padStart(2, "0");
  return h ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}
