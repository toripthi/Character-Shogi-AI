/**
 * 囲いの項（4-2）：castleFuri（振り飛車党用）・castleIbisha（居飛車党用）。
 * 文脈 context = { me: "black"|"white", matchup: {opponent, kakugawari} } が必要。なければ 0（既存の挙動）。
 * 手番側視点で反対称（K8）：board.turn() === me なら +点、そうでなければ −点。
 *
 * 点の求め方（指示書 4-2・castles.js の冒頭）：
 *  1. 自分の戦法（項の種類）・自分の飛車の筋（中飛車か）・相手の戦法から、CASTLE_ROUTES を上から順に見て最初に合う行。合う行がなければ 0。
 *  2. ゴール（と、from をたどった手前の形）が成立したら pt。ゴールの先（beyond）が成立したら pt(ゴール) + (pt(形) − pt(ゴール)) × 係数。最大値。
 *  3. 形の判定：形に書かれた駒が、そのマスに自分の駒としてある（部分点なし）。書かれていない駒の位置は問わない。後手は盤を180度回して照合。
 * 数字（筋の範囲）は matchup.js の STANCE_FILES を参照する。
 */
import { CASTLES, CASTLE_ROUTES } from "../../castles.js";
import { rookFileOf, STANCE_FILES } from "../matchup-ref.js";

const RANKS = "abcdefghi";
const LETTER_TO_TYPE = { P: "pawn", L: "lance", N: "knight", S: "silver", G: "gold", B: "bishop", R: "rook", K: "king" };

/** 形ごとに、先手視点の { file, rank, type } の一覧（一度だけ解析する）。 */
const FORM_CACHE = new Map();
function parseForm(id) {
  if (FORM_CACHE.has(id)) return FORM_CACHE.get(id);
  const rows = CASTLES[id].board.split("/");
  if (rows.length !== 9) throw new Error(`囲い ${id}: 段が9つない`);
  const pieces = [];
  rows.forEach((row, i) => {
    let file = 9;
    for (const ch of row) {
      if (/\d/.test(ch)) {
        file -= Number(ch);
        continue;
      }
      if (ch !== ch.toUpperCase()) throw new Error(`囲い ${id}: 形は先手視点（大文字）で書く`);
      const type = LETTER_TO_TYPE[ch];
      if (!type) throw new Error(`囲い ${id}: 未知の駒 ${ch}`);
      pieces.push({ file, rank: i + 1, type });
      file -= 1;
    }
    if (file !== 0) throw new Error(`囲い ${id}: 段 ${i + 1} の升数が9でない`);
  });
  const parsed = { pieces, king: pieces.find((p) => p.type === "king") };
  FORM_CACHE.set(id, parsed);
  return parsed;
}

const sq = (file, rank) => `${file}${RANKS[rank - 1]}`;
/** 自分の視点で、形の座標をボード上の座標に写す。 */
function toBoard(me, file, rank) {
  return me === "black" ? { file, rank } : { file: 10 - file, rank: 10 - rank };
}

/**
 * 形が成立するか。形に書かれた駒（玉・金・銀・桂・香・歩）が、すべて自分の駒として
 * そのマスにあれば成立。形に書かれていない駒（歩を含む）は、どこにあっても問わない。部分点はない。
 * （2026-10-18 修正：以前は「自分の歩の集合が形の歩の集合と一致」まで要求していたため、
 *   歩が形の枚数だけにならない限り、実戦では一度も成立しなかった。）
 */
export function matchForm(board, me, id) {
  const form = parseForm(id);
  // 玉を先に調べ、合わなければ打ち切る
  const k = toBoard(me, form.king.file, form.king.rank);
  const kp = board.pieceAt(sq(k.file, k.rank));
  if (!kp || kp.color !== me || kp.type !== "king") return false;
  for (const p of form.pieces) {
    if (p.type === "king") continue;
    const b = toBoard(me, p.file, p.rank);
    const got = board.pieceAt(sq(b.file, b.rank));
    if (!got || got.color !== me || got.type !== p.type) return false;
  }
  return true;
}

/** ゴールと、そこから from をたどった手前の形の集合。 */
function chainOf(goalIds) {
  const out = new Set();
  const visit = (id) => {
    if (out.has(id)) return;
    out.add(id);
    for (const f of CASTLES[id].from ?? []) visit(f);
  };
  goalIds.forEach(visit);
  return out;
}

/** 文脈に合う目標の行。上から順、先に合ったものを使う。 */
export function routeFor(stance, naka, matchup) {
  for (const row of CASTLE_ROUTES) {
    if (row.stance !== stance) continue;
    if (row.opponent !== matchup.opponent) continue;
    if (row.rook === "naka" && !naka) continue;
    if (row.kakugawari === true && !matchup.kakugawari) continue;
    return row;
  }
  return null;
}

/** 囲い点（自分視点・正の値）。0 は「どの形も成立しない」。 */
export function castlePoints(board, me, stance, context) {
  const naka = rookFileOf(board, me) === STANCE_FILES.naka;
  const row = routeFor(stance, naka, context.matchup);
  if (!row) return 0;
  const goalPt = Math.max(...row.goal.map((g) => CASTLES[g].pt));
  let best = 0;
  for (const id of chainOf(row.goal)) {
    if (matchForm(board, me, id)) best = Math.max(best, CASTLES[id].pt);
  }
  for (const [id, coef] of Object.entries(row.beyond ?? {})) {
    if (matchForm(board, me, id)) best = Math.max(best, goalPt + (CASTLES[id].pt - goalPt) * coef);
  }
  return best;
}

function castleTerm(stance) {
  return (board, _style, context) => {
    if (!context || !context.me || !context.matchup) return 0;
    const v = castlePoints(board, context.me, stance, context);
    return board.turn() === context.me ? v : -v;
  };
}

export const castleFuriTerm = castleTerm("furi");
export const castleIbishaTerm = castleTerm("ibisha");
