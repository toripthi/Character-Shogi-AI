/**
 * 詰み探索（詰将棋のルーチン）。評価関数・αβ探索とは別物で、「本物の詰みだけ」を調べる。
 * docs/PHASE4-INSTRUCTIONS.md 4-4 の仕様に沿う。
 *
 *   findMate(board, { maxPlies = 9, nodeLimit = 20000, timeLimitMs }) →
 *     { found, move, usi, plies, nodes, reason: "found" | "none" | "node-limit" | "time-limit" }
 *
 * 攻め側（手番側）は「王手になる手だけ」を、受け側は「全合法手（王手の回避）」を試す。
 * 受け側に合法手がなければ詰み。打ち歩詰めは合法手の生成で除かれているので詰みに数えない。
 * maxPlies は奇数（1, 3, 5, …。偶数を渡すと1つ下の奇数に丸める）。1手詰め → 3手詰め → … と反復深化する。
 *
 * 王手の許可制（D-001 の無駄王手フィルタ）や「成る手だけ読む」探索の制限は通さない
 * （本物の詰みを漏れなく探すため。成る手と成らない手が両方詰みなら、成る手を先に見つけて返す）。
 *
 * 置換表（Map）：「この局面は p 手以内に詰まない」「p 手で詰む（手つき）」を覚える。反復深化の間で使い回す。
 * 局面のキーは Zobrist（手番込み）なので、攻め方の局面と受け方の局面が混ざることはない。
 *
 * 手は FastBoard の内部 int 符号で扱い、返すときだけ Move オブジェクトにする（board.fb を使う）。
 */
import { intToMove, PROMOTE_BIT } from "../core/fastboard.js";

const KING = 8;

/** 攻め側の手の並べ替え用の点：成る手 > 取る手 > その他（詰みが複数あるとき、成る手のほうを返すため） */
function attackerRank(m) {
  return (m & PROMOTE_BIT ? 2 : 0) + ((m >>> 21) & 0xf ? 1 : 0);
}

/** 受け側の手の並べ替え用の点：取る手 > 玉の移動 > その他。反証（詰まない）が早く見つかるほど速い。 */
function defenderRank(m) {
  return ((m >>> 21) & 0xf ? 2 : 0) + (((m >>> 17) & 0xf) === KING ? 1 : 0);
}

/** 安定ソートで降順に並べる（同点は生成順のまま。結果が環境に依らず決まる） */
function sortedBy(moves, rank) {
  return moves
    .map((m, i) => ({ m, i, r: rank(m) }))
    .sort((a, b) => b.r - a.r || a.i - b.i)
    .map((x) => x.m);
}

/**
 * @param {import("../core/board.js").ShogiBoard} board 手番側が攻め側。呼び出し後も盤は元の状態に戻る。
 * @param {{maxPlies?:number, nodeLimit?:number, timeLimitMs?:number}} [options]
 */
export function findMate(board, options = {}) {
  const fb = board.fb;
  const requested = options.maxPlies ?? 9;
  if (!Number.isInteger(requested) || requested < 1) {
    throw new Error(`maxPlies は 1 以上の整数で指定してください: ${options.maxPlies}`);
  }
  const maxPlies = requested % 2 === 1 ? requested : requested - 1;
  const nodeLimit = options.nodeLimit ?? 20000;
  const deadline = options.timeLimitMs != null ? Date.now() + options.timeLimitMs : null;

  const ctx = {
    nodes: 0,
    abort: null, // null | "node-limit" | "time-limit"
    // key → { fail: p 手以内には詰まないと分かった最大の p, win: 詰みの手数（なければ 0）, move: 詰みの最初の手 }
    memo: new Map(),
  };

  const none = (reason) => ({ found: false, move: null, usi: null, plies: 0, nodes: ctx.nodes, reason });

  if (maxPlies < 1 || !fb.hasLegalMove()) {
    return none("none");
  }

  /** 1ノードの入口：ノード数・時間の上限を見る。超えたら ctx.abort を立てて true */
  function overBudget() {
    ctx.nodes += 1;
    if (ctx.nodes > nodeLimit) {
      ctx.abort = "node-limit";
      return true;
    }
    if (deadline !== null && (ctx.nodes & 255) === 0 && Date.now() > deadline) {
      ctx.abort = "time-limit";
      return true;
    }
    return false;
  }

  /**
   * 攻め側の番。p 手以内（p は奇数）に詰ませられるなら、その最初の手（int）を返す。なければ 0。
   */
  function orNode(p) {
    const key = fb.zkey();
    let e = ctx.memo.get(key);
    if (e) {
      if (e.win > 0 && e.win <= p) return e.move;
      if (e.fail >= p) return 0;
    }
    if (overBudget()) return 0;

    const moves = sortedBy(fb.legalMoves(), attackerRank);
    for (const m of moves) {
      fb.makeMove(m);
      let mate = false;
      if (fb.isChecked()) {
        if (p === 1) {
          mate = !fb.hasLegalMove();
        } else {
          mate = andNode(p - 1);
        }
      }
      fb.unmakeMove(m);
      if (ctx.abort) return 0;
      if (mate) {
        e = ctx.memo.get(key) ?? { fail: 0, win: 0, move: 0 };
        e.win = p;
        e.move = m;
        ctx.memo.set(key, e);
        return m;
      }
    }
    e = ctx.memo.get(key) ?? { fail: 0, win: 0, move: 0 };
    if (p > e.fail) e.fail = p;
    ctx.memo.set(key, e);
    return 0;
  }

  /**
   * 受け側の番（王手がかかっている）。p 手以内（p は偶数）に詰む（どう応じても詰む）なら true。
   * 受け側に合法手がなければ、残り手数に関わらず詰み。
   */
  function andNode(p) {
    const key = fb.zkey();
    let e = ctx.memo.get(key);
    if (e) {
      if (e.win > 0 && e.win <= p) return true;
      if (e.fail >= p) return false;
    }
    if (overBudget()) return false;

    const replies = fb.legalMoves();
    if (replies.length === 0) {
      return true; // 詰み
    }
    let ok = true;
    for (const r of sortedBy(replies, defenderRank)) {
      fb.makeMove(r);
      const next = orNode(p - 1);
      fb.unmakeMove(r);
      if (ctx.abort) return false;
      if (!next) {
        ok = false;
        break;
      }
    }
    e = ctx.memo.get(key) ?? { fail: 0, win: 0, move: 0 };
    if (ok) {
      e.win = p;
      e.move = 0;
    } else if (p > e.fail) {
      e.fail = p;
    }
    ctx.memo.set(key, e);
    return ok;
  }

  for (let p = 1; p <= maxPlies; p += 2) {
    const m = orNode(p);
    if (ctx.abort) return none(ctx.abort);
    if (m) {
      const move = intToMove(fb, m);
      return { found: true, move, usi: move.usi, plies: p, nodes: ctx.nodes, reason: "found" };
    }
  }
  return none("none");
}
