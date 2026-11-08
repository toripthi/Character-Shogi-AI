/**
 * 定跡のビルド本体（純関数。fs を使わない）。scripts/build-book.js がこれを呼ぶ。
 *  - 各ラインを ShogiBoard で指して検証する（非合法手はライン id と手数を示して失敗）
 *  - 局面キー = board.sfen() の先頭3フィールド（D-005）
 *  - 同じ局面・同じ手が複数のラインから来たら、lines/tags は和集合、重みは合算（D-023）
 *  - 出口検査（D-016）：各ラインの出口局面が条件を満たすか。満たさなければ警告（strict でエラー）
 */
import { ShogiBoard } from "../core/board.js";
import { evaluate } from "../eval/index.js";
import { searchBestMove } from "../search/index.js";
import { resolvePersona } from "../characters/index.js";
import { EXIT_LIMITS } from "./constants.js";

export function positionKey(board) {
  return board.sfen().split(" ").slice(0, 3).join(" ");
}

/**
 * @param {{meta: object, moves: string[]}[]} lines  parseLine の結果（meta は normalizeMeta 済み）
 * @param {{ strict?: boolean, exitCheck?: boolean }} [opts]
 * @returns {{ data: object, warnings: string[] }}
 */
export function buildBook(lines, opts = {}) {
  const warnings = [];
  const strict = opts.strict ?? false;
  const exitCheck = opts.exitCheck ?? true;
  const ids = new Set();
  const entries = new Map(); // key -> Map(usi -> candidate)
  const lineIds = [];

  for (const { meta, moves } of lines) {
    if (ids.has(meta.id)) throw new Error(`line ${meta.id}: id が重複`);
    ids.add(meta.id);
    lineIds.push(meta.id);
    const board = new ShogiBoard();
    for (let i = 0; i < moves.length; i++) {
      const usi = moves[i];
      const key = positionKey(board);
      const side = board.turn(); // "black" | "white"
      const registers = meta.side === "both" || meta.side === side;
      if (registers) addCandidate(entries, key, usi, meta); // 合法性は下の makeMoveByUSI で見る
      if (!board.makeMoveByUSI(usi)) {
        throw new Error(`line ${meta.id}: ${i + 1}手目（${usi}）が非合法`);
      }
    }
    if (moves.length === 0) {
      throw new Error(`line ${meta.id}: 手がない`);
    }
    if (exitCheck) {
      const w = checkExit(board, meta.id);
      warnings.push(...w);
    }
  }
  // 外部 .db の取り込み（db-import/*.json）。personaWeights を持たないラインとして数える（D-023）。
  for (const ex of opts.extra ?? []) {
    for (const key of Object.keys(ex.entries)) {
      if (!entries.has(key)) entries.set(key, new Map());
      const m = entries.get(key);
      for (const c of ex.entries[key]) {
        if (!m.has(c.usi)) m.set(c.usi, { usi: c.usi, weight: 0, tags: new Set(), lines: new Set(), trap: new Set(), trigger: null, pendingPw: [] });
        const x = m.get(c.usi);
        x.weight += c.weight;
        for (const t of c.tags ?? []) x.tags.add(t);
        for (const l of c.lines ?? []) x.lines.add(l);
        x.pendingPw.push({ weight: c.weight, pw: {} });
      }
    }
  }
  if (strict && warnings.length > 0) {
    throw new Error(`出口検査の警告（--strict）:\n${warnings.join("\n")}`);
  }

  // 出力の形（キーと手をソート。生成日時は入れない）
  const outEntries = {};
  for (const key of [...entries.keys()].sort()) {
    const cands = [...entries.get(key).values()].sort((a, b) => a.usi.localeCompare(b.usi));
    outEntries[key] = cands.map((c) => finalize(c));
  }
  let entryCount = 0;
  for (const k of Object.keys(outEntries)) entryCount += outEntries[k].length;
  const data = {
    meta: { version: 1, lines: lineIds.length, entries: entryCount },
    entries: outEntries,
  };
  return { data, warnings };
}

/** 同じ（局面, 手）の候補に、このラインの支持を足す（D-023 の合算）。 */
function addCandidate(entries, key, usi, meta) {
  if (!entries.has(key)) entries.set(key, new Map());
  const m = entries.get(key);
  if (!m.has(usi)) {
    m.set(usi, { usi, weight: 0, tags: new Set(), lines: new Set(), trap: new Set(), trigger: null, pendingPw: [] });
  }
  const c = m.get(usi);
  c.weight += meta.weight;
  for (const t of meta.tags) c.tags.add(t);
  c.lines.add(meta.id);
  if (meta.trap) c.trap.add(meta.trap);
  if (meta.trigger !== undefined) c.trigger = c.trigger === null ? meta.trigger : Math.min(c.trigger, meta.trigger);
  // personaWeights は finalize で合算する（ペルソナ別の指定がないラインは weight を使う）
  c.pendingPw.push({ weight: meta.weight, pw: meta.personaWeights ?? {} });
}

/** 候補を出力の形にする。personaWeights は、そのペルソナを指定したラインがあるときだけ書く。 */
function finalize(c) {
  const personaWeights = {};
  const allPersonas = new Set();
  for (const ln of c.pendingPw) for (const k of Object.keys(ln.pw)) allPersonas.add(k);
  for (const p of allPersonas) {
    let sum = 0;
    for (const ln of c.pendingPw) sum += ln.pw[p] ?? ln.weight;
    personaWeights[p] = sum;
  }
  const traps = [...c.trap].sort();
  const out = {
    usi: c.usi,
    weight: c.weight,
    tags: [...c.tags].sort(),
    lines: [...c.lines].sort(),
    trap: traps.length === 0 ? null : traps.length === 1 ? traps[0] : traps,
    personaWeights,
  };
  if (c.trigger !== null) out.trigger = c.trigger;
  return out;
}

/** D-016 の出口検査。出口局面（最後の手の後）について、警告の文を返す。 */
export function checkExit(board, lineId) {
  const w = [];
  const { ABS_EVAL_MAX, LEGAL_MIN, SEARCH_DEPTH, SEARCH_SCORE_MIN } = EXIT_LIMITS;
  const style = resolvePersona("balance").style;
  const ev = evaluate(board, style).score;
  if (Math.abs(ev) > ABS_EVAL_MAX) w.push(`line ${lineId}: 出口の評価 ${ev}（|評価| ≤ ${ABS_EVAL_MAX}）`);
  if (board.inCheck()) w.push(`line ${lineId}: 出口が王手`);
  const n = board.legalMoves().length;
  if (n < LEGAL_MIN) w.push(`line ${lineId}: 出口の合法手 ${n}（≥ ${LEGAL_MIN}）`);
  const r = searchBestMove(new ShogiBoard(board.sfen()), { depth: SEARCH_DEPTH, style });
  if (r.score <= SEARCH_SCORE_MIN) w.push(`line ${lineId}: 出口の深さ${SEARCH_DEPTH}探索で手番側 ${r.score}（> ${SEARCH_SCORE_MIN}）`);
  return w;
}
