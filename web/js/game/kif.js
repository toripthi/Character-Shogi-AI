/**
 * 対局ログ → KIF 文字列（平手のみ）。DOM・エンジンに依存しない。
 * KIF は指し手に移動元（"７六歩(77)"）を書くので、右・左・上・引などの区別（KI2 の書き方）や「不成」は要らない。
 * 手ごとの消費時間は "( m:ss/hh:mm:ss)"（その手に使った時間／その側の累計）。
 * AI の手には、`*` から始まるコメントで探索の情報（source・評価値・深さ・ノード数）を付ける。
 */
import { createInitialBoardState } from "../models/board.js";
import { usiToMove, applyUsi } from "../engine/usi.js";

const FILE = ["", "１", "２", "３", "４", "５", "６", "７", "８", "９"];
const RANK = ["", "一", "二", "三", "四", "五", "六", "七", "八", "九"];
const NAME = { FU: "歩", KY: "香", KE: "桂", GI: "銀", KI: "金", KA: "角", HI: "飛", OU: "玉", TO: "と", NY: "成香", NK: "成桂", NG: "成銀", UM: "馬", RY: "龍" };

const pad2 = (n) => String(n).padStart(2, "0");
const clockText = (ms) => {
  const s = Math.floor(Math.max(0, ms) / 1000);
  return `${String(Math.floor(s / 60)).padStart(2, " ")}:${pad2(s % 60)}`;
};
const totalText = (ms) => {
  const s = Math.floor(Math.max(0, ms) / 1000);
  return `${pad2(Math.floor(s / 3600))}:${pad2(Math.floor((s % 3600) / 60))}:${pad2(s % 60)}`;
};
const dateText = (iso) => {
  const d = new Date(iso);
  const p = (n) => pad2(n);
  return `${d.getFullYear()}/${p(d.getMonth() + 1)}/${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
};

/** 終局の行（手数の次の行）。resign は投了した側が「次に指す側」。 */
function endLine(result, plies, usedMs, total) {
  const n = String(plies + 1).padStart(4, " ");
  const word = {
    checkmate: "詰み", resign: "投了", sennichite: "千日手", "perpetual-check": "反則勝ち", "max-moves": "持将棋",
    "engine-error": "中断", abandoned: "中断",
  }[result?.reason];
  if (!word) return null;
  return `${n} ${word}   (${clockText(usedMs)}/${totalText(total)})`;
}

/**
 * @param {object} log game.getLog() が返す対局ログ
 * @param {{ names?: {SENTE?:string, GOTE?:string} }} [opt]
 */
export function logToKif(log, { names = {} } = {}) {
  const human = log.humanSide;
  const ai = human === "SENTE" ? "GOTE" : "SENTE";
  const personaId = log.engine?.personaId ?? log.config?.persona ?? "AI";
  const nm = { [human]: names[human] ?? "あなた", [ai]: names[ai] ?? `AI（${personaId}）` };

  const out = ["# KIF version=2.0 encoding=UTF-8"];
  if (log.startedAt) out.push(`開始日時：${dateText(log.startedAt)}`);
  if (log.endedAt) out.push(`終了日時：${dateText(log.endedAt)}`);
  out.push("手合割：平手", `先手：${nm.SENTE}`, `後手：${nm.GOTE}`);
  if (log.playStyle) out.push(`備考：指し方＝${log.playStyle}`);
  out.push("手数----指手---------消費時間--");
  out.push(`*設定：${JSON.stringify({ config: log.config, seed: log.engine?.seed ?? null, humanSide: human })}`);

  let board = createInitialBoardState(null);
  const total = { SENTE: 0, GOTE: 0 };
  let prevTo = null;
  const moves = log.moves ?? [];
  for (const m of moves) {
    const side = m.side;
    const mv = usiToMove(m.usi, board, side);
    total[side] += m.ms ?? 0;
    const same = prevTo && prevTo.file === mv.to.file && prevTo.rank === mv.to.rank;
    const dest = same ? "同　" : `${FILE[mv.to.file]}${RANK[mv.to.rank]}`;
    let text = `${dest}${NAME[mv.pieceType]}`;
    if (mv.kind === "DROP") text += "打";
    else {
      if (mv.promoted) text += "成"; // 成らない手に「不成」は書かない（KIF 標準。移動元があるので区別できる）
      text += `(${mv.from.file}${mv.from.rank})`;
    }
    out.push(`${String(m.ply).padStart(4, " ")} ${text}   (${clockText(m.ms ?? 0)}/${totalText(total[side])})`);
    if (m.by === "ai") {
      const bits = [`source=${m.source ?? "-"}`];
      if (m.score != null) bits.push(`score=${m.score}`);
      if (m.depth != null) bits.push(`depth=${m.depth}`);
      if (m.nodes != null) bits.push(`nodes=${m.nodes}`);
      if (m.opening) bits.push(`opening=${m.opening.name ?? m.opening}`);
      out.push(`*AI ${bits.join(" ")}`);
    }
    board = applyUsi(board, m.usi, side).boardState;
    prevTo = mv.to;
  }

  // 終局の行。投了は「次に指す側」が投了した形。使った時間は終局の瞬間までの分は分からないので 0 とする
  const next = moves.length % 2 === 0 ? "SENTE" : "GOTE";
  const end = endLine(log.result, moves.length, 0, total[next]);
  if (end) out.push(end);
  if (log.result?.reason === "max-moves") out.push("*手数上限で引き分け");
  if (log.result?.reason === "perpetual-check") out.push("*連続王手の千日手（王手を続けた側の反則負け）");
  if (log.result?.error) out.push(`*エラー：${log.result.error}`);
  return out.join("\n") + "\n";
}
