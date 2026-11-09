/**
 * メインスレッド側のルール判定（エンジンの ShogiBoard を使う）。UI はルールを持たない。
 * 思考（重い）は Worker、合法手の判定（軽い）はここ。ShogiBoard だけを読み込み、エンジン全体は持ち込まない。
 *
 * 局面は「平手からの手順」で持つ（moves）。この手順をそのまま Worker の think に渡す。
 * 千日手・持将棋・手数上限などの終局処理は、ここにはまだ無い（C 段階）。
 */
import { ShogiBoard } from "../../../src/core/board.js";

const SIDE_OF = { black: "SENTE", white: "GOTE" };

/** @param {{sfen?:string}} [opts] sfen は検証用（省くと平手）。指定した場合、moves はその局面からの手順になる。 */
export function createRules({ sfen } = {}) {
  let board = new ShogiBoard(sfen);
  let moves = [];
  let legalCache = null;

  const legal = () => (legalCache ??= new Set(board.legalMoves().map((m) => m.usi)));

  return {
    reset() { board = new ShogiBoard(sfen); moves = []; legalCache = null; },
    /** 手番。UI の side 表記（'SENTE' / 'GOTE'） */
    turn: () => SIDE_OF[board.turn()],
    moves: () => [...moves],
    sfen: () => board.sfen(),
    legalUsis: () => [...legal()],
    isLegal: (usi) => legal().has(usi),
    inCheck: () => board.inCheck(),
    /** 合法なら指して true。違法なら何も変えずに false */
    play(usi) {
      if (!legal().has(usi)) return false;
      if (!board.makeMoveByUSI(usi)) return false;
      moves.push(usi);
      legalCache = null;
      return true;
    },
    /** 「待った」：手順を n 手に戻す（初形から n 手を指し直す。違法手が混ざっていればエラー） */
    rewind(n) {
      const keep = moves.slice(0, n);
      board = new ShogiBoard(sfen);
      moves = [];
      legalCache = null;
      for (const u of keep) {
        if (!board.makeMoveByUSI(u)) throw new Error(`手順を戻せません: ${u}`);
        moves.push(u);
      }
    },
    /** 合法手が無ければ詰み（打ち歩詰めは違法手なので、合法手0＝詰み）。手番側の負け。 */
    result() {
      if (legal().size > 0) return { over: false };
      return { over: true, reason: "checkmate", winner: SIDE_OF[board.turn()] === "SENTE" ? "GOTE" : "SENTE" };
    },
  };
}
