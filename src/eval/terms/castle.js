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
 *
 * 2026-11-05：形の照合は、盤の配列を直接読む高速版（形ごとのマスと駒を1回だけ表にする）。値は最適化前の
 * 実装（src/eval/reference/terms/castle.js）と同じ。駒リストを持たない盤面は参照の実装を使う。
 */
import { CASTLES, CASTLE_ROUTES } from "../castles.js";
import { rookFileOf, STANCE_FILES } from "../../behavior/matchup.js";
import { SQ_TO_IX, TYPE_STRING, WHITE_BIT, colorNum } from "./fast.js";
import { referenceMatchForm, referenceCastlePoints } from "../reference-link.js";

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
  const fb = board.fb;
  const meN = colorNum(me);
  if (!fb || meN < 0) return referenceMatchForm(board, me, id);
  return matchCompiled(fb.board, compiledForm(meN, id));
}

// 形 × 自分の色ごとの、照合用の表（形に書かれた駒の、盤の添字と駒の符号）。一度だけ作る。
const COMPILED = [new Map(), new Map()];
function compiledForm(me, id) {
  let c = COMPILED[me].get(id);
  if (c === undefined) {
    const form = parseForm(id);
    const meName = me === 0 ? "black" : "white";
    const colorBit = me === 1 ? WHITE_BIT : 0;
    const k = toBoard(meName, form.king.file, form.king.rank);
    const rest = form.pieces.filter((p) => p.type !== "king");
    c = {
      kingIx: SQ_TO_IX[k.file * 10 + k.rank],
      kingCode: TYPE_STRING.indexOf("king") | colorBit,
      ixs: Uint16Array.from(
        rest.map((p) => {
          const b = toBoard(meName, p.file, p.rank);
          return SQ_TO_IX[b.file * 10 + b.rank];
        }),
      ),
      codes: Uint8Array.from(rest.map((p) => TYPE_STRING.indexOf(p.type) | colorBit)),
    };
    COMPILED[me].set(id, c);
  }
  return c;
}

function matchCompiled(cells, c) {
  // 玉を先に調べ、合わなければ打ち切る
  if (cells[c.kingIx] !== c.kingCode) return false;
  for (let i = 0; i < c.ixs.length; i++) {
    if (cells[c.ixs[i]] !== c.codes[i]) return false;
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

// 行（CASTLE_ROUTES の1行）ごとの定数：ゴールの点、ゴールと手前の形の一覧、ゴールの先（beyond）
const ROW_INFO = new WeakMap();
function rowInfo(row) {
  let info = ROW_INFO.get(row);
  if (info === undefined) {
    info = {
      goalPt: Math.max(...row.goal.map((g) => CASTLES[g].pt)),
      chain: [...chainOf(row.goal)],
      beyond: Object.entries(row.beyond ?? {}),
    };
    ROW_INFO.set(row, info);
  }
  return info;
}

/** 囲い点（自分視点・正の値）。0 は「どの形も成立しない」。 */
export function castlePoints(board, me, stance, context) {
  const fb = board.fb;
  const meN = colorNum(me);
  if (!fb || meN < 0) return referenceCastlePoints(board, me, stance, context);
  const naka = rookFileOf(board, me) === STANCE_FILES.naka;
  const row = routeFor(stance, naka, context.matchup);
  if (!row) return 0;
  const { goalPt, chain, beyond } = rowInfo(row);
  const cells = fb.board;
  let best = 0;
  for (const id of chain) {
    if (matchCompiled(cells, compiledForm(meN, id))) best = Math.max(best, CASTLES[id].pt);
  }
  for (const [id, coef] of beyond) {
    if (matchCompiled(cells, compiledForm(meN, id))) best = Math.max(best, goalPt + (CASTLES[id].pt - goalPt) * coef);
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
