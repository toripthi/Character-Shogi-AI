/**
 * 手順テンプレート層（定跡と探索の間）。純関数（fs・乱数は引数）。docs/PLAN.md。
 *   createPlanner(plan) → { next(board, side, { opponent }, rng) → { usi, stepId, kind } | null, safety }
 * 状態を持たない。盤面から、各手が「済み／指せる／飛ばす」のどれかを決める。
 * 後手は盤を180度回して照合し、手も回して返す。
 */
import furiShikenMino from "./plans/furi-shiken-mino.js";

export const PLANS = { [furiShikenMino.id]: furiShikenMino };

const RANKS = "abcdefghi";
/** マスを180度回す（"7g" → "3c"） */
export function mirrorSquare(sq) {
  return `${10 - Number(sq[0])}${RANKS[8 - RANKS.indexOf(sq[1])]}`;
}
function mirrorUsi(usi) {
  return mirrorSquare(usi.slice(0, 2)) + mirrorSquare(usi.slice(2, 4)) + usi.slice(4);
}

/**
 * 自軍の歩と相手の歩の距離（チェビシェフ距離）が1になっているか。2026-11-10 §2。
 * 「駒を取れるか」ではなく歩同士の接触を、手順テンプレート（組み立て）の終わりの合図にする。
 * 盤上の歩だけを見る（持ち駒は見ない）。side 視点でなくても対称（自軍・相手の歩の組を探すだけ）。
 */
export function pawnsInContact(board, side) {
  const enemy = side === "black" ? "white" : "black";
  const mine = [];
  const theirs = [];
  for (let f = 1; f <= 9; f++) {
    for (let r = 0; r < 9; r++) {
      const p = board.pieceAt(`${f}${RANKS[r]}`);
      if (!p || p.type !== "pawn") continue;
      if (p.color === side) mine.push([f, r]);
      else if (p.color === enemy) theirs.push([f, r]);
    }
  }
  return mine.some(([f, r]) => theirs.some(([g, s]) => Math.max(Math.abs(f - g), Math.abs(r - s)) === 1));
}

export function createPlanner(plan) {
  if (!plan) throw new Error("createPlanner: plan が必要");

  function next(board, side, { opponent } = {}, rng) {
    const flip = side === "white";
    const sq = (s) => (flip ? mirrorSquare(s) : s);
    const mv = (u) => (flip ? mirrorUsi(u) : u);
    const legal = new Set(board.legalMoves().map((m) => m.usi));
    const enemy = side === "black" ? "white" : "black";

    const mineAt = (s, piece) => {
      const p = board.pieceAt(sq(s));
      return !!p && p.color === side && p.type === piece;
    };
    const oppPawnAt = (s) => {
      const p = board.pieceAt(sq(s));
      return !!p && p.color === enemy && p.type === "pawn";
    };
    const whenOk = (w) => {
      if (!w) return true;
      if (w.opponent && w.opponent !== opponent) return false;
      if (w.oppPawnAt && !oppPawnAt(w.oppPawnAt)) return false;
      return true;
    };
    const optionsOf = (st) => (st.choose ?? [{ move: st.move, weight: 1 }]).map((o) => ({ ...o, piece: st.piece }));
    const isDone = (st) => optionsOf(st).some((o) => mineAt(o.move.slice(2, 4), o.piece));
    const playable = (st) =>
      optionsOf(st).filter((o) => mineAt(o.move.slice(0, 2), o.piece) && legal.has(mv(o.move)));
    const pick = (cands) => {
      if (cands.length === 1) return cands[0];
      const total = cands.reduce((s, c) => s + c.weight, 0);
      let r = rng() * total;
      for (const c of cands) {
        if (r < c.weight) return c;
        r -= c.weight;
      }
      return cands[cands.length - 1];
    };
    const out = (st, o, kind) => ({ usi: mv(o.move), stepId: st.id, kind });

    for (const st of plan.interrupts ?? []) {
      if (!whenOk(st.when)) continue;
      const c = playable(st);
      if (c.length) return out(st, pick(c), "interrupt");
    }
    for (const st of plan.steps ?? []) {
      if (!whenOk(st.when)) continue;
      if (isDone(st)) {
        if (st.stop) return null;
        continue;
      }
      const c = playable(st);
      if (c.length) return out(st, pick(c), "step");
      if (st.stop) return null;
    }
    for (const st of plan.tail ?? []) {
      if (!whenOk(st.when)) continue;
      if (isDone(st)) continue;
      const c = playable(st);
      if (c.length) return out(st, pick(c), "tail");
    }
    return null;
  }

  return { next, safety: plan.safety ?? { depth: 2, marginCp: 150 } };
}
