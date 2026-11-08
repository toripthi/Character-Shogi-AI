/**
 * 終局の判定（詰み以外）と、結果の文面。ルール盤（rules.js）の外に置く純粋なロジック。DOM・エンジンに依存しない。
 *
 * エンジンが知っているのは「合法手が 0＝詰み」だけ。千日手・連続王手・手数上限・投了はここで扱う。
 * 入玉・持将棋の宣言は未対応（docs/DECISIONS.md D-036）。手数上限で引き分けにする。
 *
 * 局面の履歴は keys[0..n]（keys[0] は初形、keys[i] は i 手目を指した後）。
 * checks[i] は「i 手目を指した直後に、相手の玉に王手がかかっているか」（1 始まり。checks[0] は使わない）。
 * 平手のみ：i が奇数の手は先手、偶数の手は後手。
 */

export const REPETITION_COUNT = 4; // 同一局面が4回目で千日手
export const DEFAULT_MAX_MOVES = 300;

const moverOf = (ply) => (ply % 2 === 1 ? "SENTE" : "GOTE");
const other = (side) => (side === "SENTE" ? "GOTE" : "SENTE");

/**
 * 千日手・連続王手・手数上限を判定する。終局でなければ null。
 * @param {{keys:string[], checks:boolean[], maxMoves?:number}} h
 * @returns {null | {over:true, reason:'sennichite'|'perpetual-check'|'max-moves', winner:'SENTE'|'GOTE'|null, loser?:'SENTE'|'GOTE'}}
 */
export function judgeEnd({ keys, checks, maxMoves = DEFAULT_MAX_MOVES }) {
  const n = keys.length - 1; // 指した手数
  if (n >= REPETITION_COUNT - 1) {
    const last = keys[n];
    const at = [];
    for (let i = 0; i <= n; i++) if (keys[i] === last) at.push(i);
    if (at.length >= REPETITION_COUNT) {
      // 最初の出現から今までが「繰り返しの1サイクル群」。その間に各側が指した手がすべて王手なら、その側の反則負け。
      const from = at[at.length - REPETITION_COUNT];
      const allCheck = { SENTE: true, GOTE: true };
      const count = { SENTE: 0, GOTE: 0 };
      for (let p = from + 1; p <= n; p++) {
        const s = moverOf(p);
        count[s]++;
        if (!checks[p]) allCheck[s] = false;
      }
      const perpetual = ["SENTE", "GOTE"].filter((s) => count[s] > 0 && allCheck[s]);
      if (perpetual.length === 1) {
        const loser = perpetual[0];
        return { over: true, reason: "perpetual-check", winner: other(loser), loser };
      }
      return { over: true, reason: "sennichite", winner: null };
    }
  }
  if (n >= maxMoves) return { over: true, reason: "max-moves", winner: null };
  return null;
}

/** 結果（rules.result() / judgeEnd() / 投了）を、人間側から見た日本語の1行にする */
export function describeResult(result, humanSide) {
  if (!result?.over) return "";
  const who = result.winner === null ? null : result.winner === humanSide ? "あなたの勝ち" : "あなたの負け";
  switch (result.reason) {
    case "checkmate": return `詰みです。${who}`;
    case "resign": return result.winner === humanSide ? "AI が投了しました。あなたの勝ち" : "投了しました。あなたの負け";
    case "perpetual-check": return `連続王手の千日手です。${who}`;
    case "sennichite": return "千日手です。引き分け";
    case "max-moves": return `${DEFAULT_MAX_MOVES} 手に達したので引き分けとします`;
    case "engine-error": return "エンジンの不具合で対局を止めました";
    default: return who ?? "対局終了";
  }
}
