import { evaluate as defaultEvaluate, evaluateScore as defaultEvaluateScore, resolveStyle } from "../eval/index.js";
import { intToMove } from "../core/fastboard.js";
import { MATE_SCORE } from "./constants.js";
import { negamax, filterAllowedWithFallback } from "./negamax.js";
import { orderMovesInt } from "./ordering.js";
import { storeTt } from "./tt.js";

export { MATE_SCORE };
export { orderMoves } from "./ordering.js";

/**
 * Phase 2: negamax + αβ法 + 静止探索 + 手の並べ替え + 簡易置換表 + 無駄王手排除。
 * 反復深化・時間制御は think() が担当する。
 *
 * オプション maxNodes（docs/NODE-BUDGET-DESIGN.md §1-2）:
 *   nodes + qnodes が maxNodes を超えたら探索を打ち切り、
 *   { aborted: true, abortedBy: "nodes", bestMove: null, score: null, ... } を返す。
 *   途中の値は最善手にも置換表にも使わない。未指定なら現在と同じ挙動。
 * オプション hardDeadlineMs（時刻の安全弁。詳細は設計メモ docs/NODE-BUDGET-DESIGN.md §3）:
 *   maxNodes と一緒に使う。決定性は予算が先に効く範囲で保証する。
 *
 * @param {import("../core/board.js").ShogiBoard} board
 * @returns {{bestMove: import("tsshogi").Move|null, score:number|null, nodes:number, qnodes:number, breakdown:object|null, ttHits:number, aborted?:boolean, abortedBy?:"nodes"|"hard"}}
 */
export function searchBestMove(board, options = {}) {
  const depth = options.depth ?? 2;
  // 文脈（4-2：{ me, matchup }）は、戦法の項だけが使う。文脈がなければ従来どおり。
  const context = options.context;
  const evaluate = options.evaluate ?? ((b, st) => defaultEvaluate(b, st, context));
  // 葉ノード・静止探索の評価は score だけでよい（内訳 breakdown は根の最善手のときだけ要る）ので、内訳を
  // 作らない版を使う（2026-11-05）。評価を差し替えたとき（options.evaluate）は、その score を使う。
  const evalScore = options.evaluate ? (b, st) => options.evaluate(b, st).score : (b, st) => defaultEvaluateScore(b, st, context);
  const style = resolveStyle(options.style ?? {});
  const quiescence = options.quiescence ?? true;
  const useCheckPolicy = options.useCheckPolicy ?? true;
  const tt = options.transposition ?? null;
  const rootBeta = tt === null && options.beta !== undefined ? options.beta : Infinity;
  let failHigh = false;

  // 予算（opt-in）。maxNodes も時刻の安全弁も無ければ、ctx.b を作らない（既定経路は変わらない）。
  const maxNodes = options.maxNodes === undefined || options.maxNodes === null
    ? undefined
    : Math.max(0, Math.floor(options.maxNodes));
  const hardDeadlineMs = options.hardDeadlineMs ?? null;
  const b = maxNodes !== undefined || hardDeadlineMs != null
    ? { maxNodes, hardDeadlineMs, hit: null }
    : null;

  const stats = { nodes: 0, qnodes: 0, ttHits: 0 };
  let bestMove = null;
  let bestScore = -Infinity;
  let bestBreakdown = null;

  // ルートも内部 int 手で動く（最終結果だけ Move オブジェクト化する）。
  const fb = board.fb;
  const rootMoves = orderMovesInt(board, fb.legalMoves(), style, tt);
  if (rootMoves.length === 0) {
    return { bestMove: null, score: -MATE_SCORE, nodes: 0, qnodes: 0, breakdown: null, ttHits: 0 };
  }
  if (depth <= 0) {
    const leaf = evaluate(board, style);
    return {
      bestMove: intToMove(fb, rootMoves[0]),
      score: leaf.score,
      nodes: 1,
      qnodes: 0,
      breakdown: leaf.breakdown,
      ttHits: 0,
    };
  }

  const candidates =
    useCheckPolicy && depth >= 2 ? filterAllowedWithFallback(board, rootMoves) : rootMoves;

  let alpha = -Infinity;
  for (const move of candidates) {
    fb.makeMove(move);
    const score = -negamax(board, depth - 1, -rootBeta, -alpha, evaluate, style, {
      quiescence,
      useCheckPolicy,
      tt,
      stats,
      b,
      evalScore,
    });
    fb.unmakeMove(move);
    // 途中まで読んだ値は使わない（中断された候補手の結果は捨てる）
    if (b && b.hit) {
      break;
    }
    if (score > bestScore) {
      bestScore = score;
      bestMove = move;
      // 最善手直後の局面を相手番視点で評価すると符号が反転する。
      // 表示用 breakdown は指し手側（自分視点）に直すため符号を反転させる。
      fb.makeMove(move);
      const after = evaluate(board, style).breakdown;
      fb.unmakeMove(move);
      bestBreakdown = {};
      for (const [k, v] of Object.entries(after)) {
        bestBreakdown[k] = -v;
      }
    }
    if (score > alpha) {
      alpha = score;
    }
    if (score >= rootBeta) {
      failHigh = true;
      break;
    }
  }

  if (b && b.hit) {
    // 途中結果は最善手・score として使わない（docs/NODE-BUDGET-DESIGN.md §2）
    const out = {
      bestMove: null,
      score: null,
      nodes: stats.nodes,
      qnodes: stats.qnodes,
      breakdown: null,
      ttHits: stats.ttHits,
      aborted: true,
      abortedBy: b.hit,
    };
    return out;
  }
  // 根の置換表エントリは、全候補を読み終えたこのときに1回だけ書く（2026-11-05）。
  //   - bestMove は本当の最善手（反復深化で、次の深さの根の最優先手になる）。以前は「最後に調べた手」が
  //     残っており、次の反復で最悪手を先頭に並べていた。
  //   - 中断した反復は書かない（途中の暫定値が、探索中に根と同じ局面へ戻ったとき exact として使われるのを防ぐ。
  //     以前はそのための巻き戻しがあったが、途中で書かなくなったので不要）。
  if (tt && bestMove !== null) {
    storeTt(tt, fb.zkey(), depth, bestScore, intToMove(fb, bestMove));
  }
  let out = {
    bestMove: bestMove === null ? null : intToMove(fb, bestMove),
    score: bestScore,
    nodes: stats.nodes,
    qnodes: stats.qnodes,
    breakdown: bestBreakdown,
    ttHits: stats.ttHits,
    ...(failHigh ? { failHigh: true } : {}),
  };
  if (b) {
    out.aborted = false;
  }
  return out;
}

/**
 * 安全弁の既定（ミリ秒）。maxNodes を指定したとき（timeLimitMs を無効にしたとき）に使う。
 */
export const HARD_TIME_LIMIT_MS = 10000;

/**
 * 反復深化 + 時間制御の器（REQUIREMENTS §11）。
 * think(board) -> { move, thinkMs } の形で「何ミリ秒考えたことにするか」を返す。
 * 待機はUI側が担当。テスト・自己対局では待機を無効にする。
 *
 * maxNodes（docs/NODE-BUDGET-DESIGN.md §6、opt-in）:
 *   - 指定時は timeLimitMs による打ち切りを無効にする（決定的にするため）。
 *     代わりに hardTimeLimitMs（既定 10000）を安全弁として持ち、働いたら hardLimitHit: true。
 *   - 深さ1は必ず完了させる（予算の判定は深さ2から）。
 *   - 予算は呼び出し全体の合計（nodes+qnodes。深さ1の分と中断した反復の実消費も含む）。
 *   - 返り値: depth（完了した最後の深さ）、aborted（途中で中断したか）、nodes／qnodes（合計）。
 */
export function think(board, options = {}) {
  const maxDepth = options.maxDepth ?? 3;
  const hasBudget = options.maxNodes !== undefined && options.maxNodes !== null;
  const budgetTotal = hasBudget ? Math.max(0, Math.floor(options.maxNodes)) : Infinity;
  const timeLimitMs = hasBudget ? Infinity : options.timeLimitMs ?? 1000;
  const hardTimeLimitMs = hasBudget ? options.hardTimeLimitMs ?? HARD_TIME_LIMIT_MS : null;
  const t0 = Date.now();
  let best = null;
  let depthReached = 0;
  let nodesTotal = 0;
  let qnodesTotal = 0;
  let aborted = false;
  let hardLimitHit = false;
  const tt = options.transposition ?? new Map();

  for (let depth = 1; depth <= maxDepth; depth++) {
    if (depth >= 2) {
      if (hasBudget && nodesTotal + qnodesTotal >= budgetTotal) {
        // 残り予算が不足: この反復は始めない（深さ1の結果を返す。1手は必ず返る）。
        aborted = true;
        break;
      }
      if (hardTimeLimitMs != null && Date.now() - t0 >= hardTimeLimitMs) {
        hardLimitHit = true;
        aborted = true;
        break;
      }
    }
    const result = searchBestMove(board, {
      ...options,
      depth,
      transposition: tt,
      maxNodes: depth >= 2 && budgetTotal !== Infinity ? budgetTotal - nodesTotal - qnodesTotal : undefined,
      hardDeadlineMs: depth >= 2 && hardTimeLimitMs != null ? t0 + hardTimeLimitMs : undefined,
    });
    nodesTotal += result.nodes;
    qnodesTotal += result.qnodes;
    if (result.aborted) {
      // 中断した反復の結果（bestMove/score）は捨てる。完了した最後の深さの結果を返す。
      aborted = true;
      if (result.abortedBy === "hard") {
        hardLimitHit = true;
      }
      break;
    }
    best = result;
    depthReached = depth;
    if (Date.now() - t0 >= timeLimitMs) {
      break;
    }
  }
  return {
    move: best?.bestMove ?? null,
    score: best?.score ?? 0,
    depth: depthReached,
    thinkMs: Date.now() - t0,
    nodes: nodesTotal,
    qnodes: qnodesTotal,
    breakdown: best?.breakdown ?? null,
    aborted,
    hardLimitHit,
  };
}
