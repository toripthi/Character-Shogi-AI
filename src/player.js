/**
 * Phase 4-0-1: 指し手を決める流れを1つにまとめる最小の player。
 * 以降のすべての機能（定跡・詰み探索・見落とし）はここに差し込む。
 * src/ は純JS（P3）。乱数は createRng だけ（P4）。
 */
import { createRng } from "./core/rng.js";
import { evaluate as defaultEvaluate, resolveStyle } from "./eval/index.js";
import { resolvePersona, drawOpenings } from "./characters/index.js";
import { searchBestMove, think, HARD_TIME_LIMIT_MS } from "./search/index.js";
import { scoreRootMoves, selectMove } from "./selection/index.js";
import { createBook } from "./book/index.js";
import { REJOIN_MAX_ABS_DEFAULT } from "./book/constants.js";
import { classifyMatchup, INITIAL_MATCHUP } from "./behavior/matchup.js";
import { createPlanner, PLANS } from "./plan/index.js";
import { DEFAULT_MAX_NODES, PRUNE_SLACK_DEFAULT } from "./search/constants.js";
// 4-2：これらの重みのどれかが 0 でないとき、戦法の文脈（{ me, matchup }）を探索に渡す。
const CONTEXT_TERM_IDS = ["castleFuri", "castleIbisha", "rookSwung", "rookHome"];

let nextPlayerId = 1;

/**
 * @param {{persona?:string|object, traits?:string[], style?:object, seed?:number,
 *   search?:{depth?:number, quiescence?:boolean, useCheckPolicy?:boolean,
 *     maxNodes?:number, maxDepth?:number},
 *   selection?:{margin?:number, slipRate?:number, slipMargin?:number, temperature?:number},
 *   book?:{enabled?:boolean}, mate?:{enabled?:boolean}}} [options]
 *
 * search.maxNodes / search.maxDepth（docs/NODE-BUDGET-DESIGN.md §5、opt-in）:
 *   反復深化で 1手あたりのノード数の上限をかけられる。指定しなければ現在と同じ
 *   （指定なしでも、既定の上限（DEFAULT_MAX_NODES）つきの反復深化になる。search.budget:false で固定の深さ（既定3）で1回探索する）。maxNodes と maxDepth は必ずペアで指定する
 *   （片方だけはエラー）。既定の深さ・既定の挙動はこのオプションでは変えない。
 */
export function createPlayer(options = {}) {
  const id = `player-${nextPlayerId++}`;
  // persona | traits | style のどれか1つ。resolvePersona と同じ解決。
  let resolved;
  if (options.style) {
    resolved = {
      id: "custom",
      name: "カスタム",
      description: "",
      traits: [...(options.traits ?? [])],
      style: resolveStyle(options.style),
    };
  } else if (options.traits) {
    resolved = resolvePersona({ id: "custom", traits: options.traits, weights: options.weights });
  } else {
    resolved = resolvePersona(options.persona ?? "balance");
  }
  const searchOpts = {
    depth: options.search?.depth ?? 3,
    quiescence: options.search?.quiescence ?? true,
    useCheckPolicy: options.search?.useCheckPolicy ?? true,
  };
  // 予算つき反復深化（opt-in）。maxNodes と maxDepth はペア必須（docs/NODE-BUDGET-DESIGN.md §5）。
  const hasMaxNodes = options.search?.maxNodes !== undefined && options.search?.maxNodes !== null;
  const hasMaxDepth = options.search?.maxDepth !== undefined && options.search?.maxDepth !== null;
  if (hasMaxNodes !== hasMaxDepth) {
    throw new Error(
      "search.maxNodes と search.maxDepth は必ずペアで指定してください（いずれか一方だけでは打ち切りの条件が定義できない）",
    );
  }
  if (hasMaxNodes) {
    const n = Number(options.search.maxNodes);
    const d = Number(options.search.maxDepth);
    if (!Number.isInteger(n) || n < 0) {
      throw new Error(`search.maxNodes は 0 以上の整数で指定してください: ${options.search.maxNodes}`);
    }
    if (!Number.isInteger(d) || d < 1) {
      throw new Error(`search.maxDepth は 1 以上の整数で指定してください: ${options.search.maxDepth}`);
    }
    searchOpts.maxNodes = n;
    searchOpts.maxDepth = d;
  }
  // 既定の予算（2026-10-18）：指定がなければ、反復深化で1手あたりのノード数を DEFAULT_MAX_NODES に抑える
  // （最悪の1手が数十秒になるのを防ぐ）。search.budget:false で従来の固定深さの探索に戻せる。
  if (!hasMaxNodes && options.search?.budget !== false) {
    searchOpts.maxNodes = DEFAULT_MAX_NODES;
    searchOpts.maxDepth = searchOpts.depth;
  }
  // ルート採点の打ち切りの余裕点（docs/PLAN.md ⑦）。最善手との差が margin＋余裕点を超えると確定した手は
  // 読むのをやめる。0 で最大の削減（食い違い増）、null/Infinity で打ち切りなし（従来と同一）。
  const pruneSlack = options.search?.pruneSlack === undefined ? PRUNE_SLACK_DEFAULT : options.search.pruneSlack;
  const selectionOpts = {
    margin: options.selection?.margin ?? 0,
    slipRate: options.selection?.slipRate ?? 0,
    slipMargin: options.selection?.slipMargin ?? 500,
    temperature: options.selection?.temperature ?? 100,
  };
  const bookOpts = {
    enabled: options.book?.enabled ?? false,
    skipRate: options.book?.skipRate ?? 0,
    stickyOut: options.book?.stickyOut ?? false,       // D-022 既定 false
    maxOwnMoves: options.book?.maxOwnMoves ?? 20,
    rejoinMaxAbs: options.book?.rejoinMaxAbs ?? REJOIN_MAX_ABS_DEFAULT,
  };
  // 定跡の本体（data が必要）。タグの既定は resolvePersona の bookTags（4-2 まで空）。
  // 定跡の本体は enabled のとき作る（データの検査も行う）。使うかどうかは bookActive で決める（D-029）。
  const book = bookOpts.enabled
    ? createBook(options.book?.data ?? (() => { throw new Error("book.enabled のとき book.data が必要"); })())
    : null;
  // ペルソナが usesBook: false（balance）なら、book.enabled でも引かない（D-029）。
  const bookActive = bookOpts.enabled && resolved.usesBook !== false;
  // 戦法ごとの一式（評価 style・定跡タグ・文脈を使うか）。オールラウンダー（D-029 (e)）は戦法ごとに1つ、
  // それ以外は1つだけ（キー null）。どれを使うかは手番の色ごとの抽選結果（state.opening）で決まる。
  const hasContext = (style) => CONTEXT_TERM_IDS.some((id) => (style.weights[id] ?? 0) !== 0);
  const variants = new Map();
  if (resolved.openings) {
    for (const [oid, v] of Object.entries(resolved.openings.variants)) {
      variants.set(oid, { opening: oid, style: v.style, bookTags: options.book?.tags ?? v.bookTags, usesContext: hasContext(v.style) });
    }
  } else {
    variants.set(null, { opening: null, style: resolved.style, bookTags: options.book?.tags ?? resolved.bookTags ?? [], usesContext: hasContext(resolved.style) });
  }
  // 手順テンプレート層（定跡と探索の間）。options.plan（plan オブジェクト／id／false）、なければペルソナの plan。
  const planRef = options.plan === undefined ? resolved.plan : options.plan;
  const planData = planRef ? (typeof planRef === "string" ? PLANS[planRef] : planRef) : null;
  if (planRef && !planData) throw new Error(`未知の plan "${planRef}"（${Object.keys(PLANS).join(", ")}）`);
  const planner = planData ? createPlanner(planData) : null;
  const BALANCE_STYLE = resolvePersona("balance").style;
  const mateOpts = { enabled: options.mate?.enabled ?? false };
  const baseSeed = options.seed ?? 1;

  const state = {
    rng: createRng(baseSeed),
    // 手番の色ごとの戦法（オールラウンダーのみ。それ以外は null）。手選びの乱数 rng とは別系統で抽選する。
    opening: drawOpenings(resolved.openings, baseSeed),
    // 置換表は newGame() ごとに作り直し、局の中では使い回す。
    transposition: new Map(),
    // 手番の色ごとの定跡の状態（自己対局は単一 player で両手番を指すため）。
    sides: { black: { own: 0, left: false }, white: { own: 0, left: false } },
    // 戦法の判定（4-2）の状態を手番の色ごとに持つ。ttKey は置換表を作った文脈（手番・判定結果）。
    matchup: { black: INITIAL_MATCHUP, white: INITIAL_MATCHUP },
    ttKey: null,
  };
  const variantOf = (side) => variants.get(state.opening[side]);

  function newGame(seed = baseSeed) {
    state.rng = createRng(seed);
    state.opening = drawOpenings(resolved.openings, seed);
    state.transposition = new Map();
    state.sides = { black: { own: 0, left: false }, white: { own: 0, left: false } };
    state.matchup = { black: INITIAL_MATCHUP, white: INITIAL_MATCHUP };
    state.ttKey = null;
  }

  /**
   * 手番の戦法の文脈を、ルートで1回だけ決めて固定する（D-019）。探索の内側では判定しない。
   * 文脈（手番・判定結果）が変わったら置換表を作り直す（評価が文脈で変わるため）。
   */
  function contextFor(board, side) {
    if (!variantOf(side).usesContext) return undefined;
    const next = classifyMatchup(board, side, state.matchup[side]);
    state.matchup[side] = next;
    const key = `${side}|${next.opponent}|${next.kakugawari}|${state.opening[side]}`;
    if (state.ttKey !== key) {
      state.transposition = new Map();
      state.ttKey = key;
    }
    return { me: side, matchup: next };
  }

  /**
   * 定跡を使えるか。外れたあとの戻り（D-022）：stickyOut=false は、盤面の評価（balance、手番側）が
   * rejoinMaxAbs 以下のときだけ戻る。stickyOut=true は一度外れたら戻らない。
   * 手数（自分の手の通算）が maxOwnMoves を超えたら使わない。
   */
  function tryBook(board, side) {
    const s = state.sides[side];
    if (s.own >= bookOpts.maxOwnMoves) return null;
    if (s.left) {
      if (bookOpts.stickyOut) return null;
      const abs = Math.abs(defaultEvaluate(board, BALANCE_STYLE).score);
      if (abs > bookOpts.rejoinMaxAbs) return null;
    }
    const r = book.lookup(board, { tags: variantOf(side).bookTags, personaId: resolved.id, rng: state.rng, skipRate: bookOpts.skipRate });
    if (!r) {
      s.left = true; // 定跡から外れた（局面が表に無い、または skipRate で使わなかった）
      return null;
    }
    return { move: r.move, entry: r.entry, candidates: r.candidates };
  }

  /**
   * 手順テンプレート。盤面から「次の1手」を決め、浅い探索で大損でないことを確かめる。
   * 大損なら null（探索に任せる）。docs/PLAN.md。
   */
  function tryPlan(board, side, context) {
    const matchup = context?.matchup ?? (state.matchup[side] = classifyMatchup(board, side, state.matchup[side]));
    const step = planner.next(board, side, matchup, state.rng);
    if (!step) return null;
    const { depth, marginCp } = planner.safety;
    const scored = scoreRootMoves(board, {
      depth,
      style: variantOf(side).style,
      quiescence: searchOpts.quiescence,
      useCheckPolicy: searchOpts.useCheckPolicy,
      context,
    });
    if (scored.length === 0) return null;
    const mine = scored.find((c) => c.move.usi === step.usi);
    if (!mine || scored[0].score - mine.score > marginCp) return null;
    return { move: mine.move, step, bestScore: scored[0].score, score: mine.score };
  }

  /** scoreRootMoves に渡す打ち切り幅。無効なら undefined。 */
  function pruneMarginOf() {
    if (pruneSlack === null || !Number.isFinite(pruneSlack)) return undefined;
    const wide = selectionOpts.slipRate > 0 ? selectionOpts.slipMargin : 0;
    return Math.max(selectionOpts.margin, wide) + pruneSlack;
  }

  function chooseMove(board) {
    const t0 = Date.now();
    const legal = board.legalMoves();
    if (legal.length === 0) {
      return { move: null, source: "none", info: { score: 0, depth: searchOpts.depth, nodes: 0, qnodes: 0, ms: Date.now() - t0, breakdown: null } };
    }
    const side = board.turn();
    const context = contextFor(board, side);
    if (bookActive) {
      const hit = tryBook(board, side);
      if (hit) {
        state.sides[side].own++;
        return {
          move: hit.move,
          source: "book",
          info: { score: 0, depth: 0, nodes: 0, qnodes: 0, ms: Date.now() - t0, breakdown: null, candidates: hit.candidates, entryLines: hit.entry.lines },
        };
      }
    }
    if (planner) {
      const hit = tryPlan(board, side, context);
      if (hit) {
        return {
          move: hit.move,
          source: "plan",
          info: { score: hit.score, depth: planner.safety.depth, nodes: 0, qnodes: 0, ms: Date.now() - t0, breakdown: null, planStep: hit.step.stepId, planKind: hit.step.kind, bestScore: hit.bestScore },
        };
      }
    }
    const result = chooseSearchMove(board, t0, context, variantOf(side).style);
    if (bookActive && result.move) state.sides[side].own++;
    return result;
  }

  function chooseSearchMove(board, t0, context, style) {
    if (mateOpts.enabled) {
      throw new Error("mate は Phase 4-4 で実装する（今は enabled:false のみ）");
    }
    // ルート採点が必要な条件：margin > 0 または slipRate > 0、または後退ペナルティ（4-0-5）が0でない。
    const retreatWeight = style.weights.retreat ?? 0;
    const needsScoring = selectionOpts.margin > 0 || selectionOpts.slipRate > 0 || retreatWeight !== 0;
    if (searchOpts.maxNodes !== undefined) {
      // 予算つき反復深化（opt-in。docs/NODE-BUDGET-DESIGN.md §5）。
      return chooseSearchMoveBudget(board, t0, context, needsScoring, retreatWeight, style);
    }
    if (!needsScoring) {
      // evaluate は指定しない：既定（文脈つき）を使わせる（4-2：文脈を探索の評価に届けるため）
      const result = searchBestMove(board, {
        depth: searchOpts.depth,
        style: style,
        quiescence: searchOpts.quiescence,
        useCheckPolicy: searchOpts.useCheckPolicy,
        transposition: state.transposition,
        context,
      });
      return {
        move: result.bestMove,
        source: "search",
        info: {
          score: result.score,
          depth: searchOpts.depth,
          nodes: result.nodes,
          qnodes: result.qnodes,
          ms: Date.now() - t0,
          breakdown: result.breakdown,
        },
      };
    }
    const scored = scoreRootMoves(board, {
      depth: searchOpts.depth,
      style: style,
      quiescence: searchOpts.quiescence,
      useCheckPolicy: searchOpts.useCheckPolicy,
      retreatWeight,
      context,
      pruneMargin: pruneMarginOf(),
    });
    const picked = selectMove(scored, { ...selectionOpts, rng: state.rng });
    // ノード数は表示・計測用（scored.stats）。手の選択には影響しない（docs/NODE-BUDGET-DESIGN.md §5）。
    return {
      move: picked.move,
      source: "search",
      info: {
        score: picked.score,
        depth: searchOpts.depth,
        nodes: scored.stats.nodes,
        qnodes: scored.stats.qnodes,
        ms: Date.now() - t0,
        breakdown: null,
      },
    };
  }

  /**
   * 予算つきの反復深化（docs/NODE-BUDGET-DESIGN.md §5）。
   * 深さ1は必ず完了させる。直接探索は think()、ルート採点は scoreRootMoves を深さ d-1 で
   * 反復し、予算を超えた反復は破棄して完了した最後の深さの結果を使う。
   */
  function chooseSearchMoveBudget(board, t0, context, needsScoring, retreatWeight, style) {
    const maxNodes = searchOpts.maxNodes;
    const maxDepth = searchOpts.maxDepth;
    const hardDeadlineMs = Date.now() + HARD_TIME_LIMIT_MS;
    if (!needsScoring) {
      // 直接探索: think() 相当（時間の打ち切りなし・安全弁のみ）。
      const result = think(board, {
        maxDepth,
        maxNodes,
        style: style,
        quiescence: searchOpts.quiescence,
        useCheckPolicy: searchOpts.useCheckPolicy,
        transposition: state.transposition,
        context,
      });
      return {
        move: result.move,
        source: "search",
        info: {
          score: result.score,
          depth: result.depth,
          nodes: result.nodes,
          qnodes: result.qnodes,
          ms: Date.now() - t0,
          breakdown: result.breakdown,
          aborted: result.aborted,
          hardLimitHit: result.hardLimitHit,
        },
      };
    }
    // ルート採点: 全ルート手の合計で予算を数える。予算を超えた反復は破棄する。
    let usedNodes = 0;
    let usedQnodes = 0;
    let bestScored = null;
    let reached = 0;
    let aborted = false;
    let hardLimitHit = false;
    for (let d = 1; d <= maxDepth; d++) {
      const used = usedNodes + usedQnodes;
      if (d >= 2) {
        if (used >= maxNodes) {
          // 残り予算が不足: この反復は始めない（深さ1の採点は必ず完了済み）。
          aborted = true;
          break;
        }
        if (Date.now() >= hardDeadlineMs) {
          hardLimitHit = true;
          aborted = true;
          break;
        }
      }
      const scored = scoreRootMoves(board, {
        depth: d,
        style: style,
        quiescence: searchOpts.quiescence,
        useCheckPolicy: searchOpts.useCheckPolicy,
        retreatWeight,
        context,
        pruneMargin: d >= 2 ? pruneMarginOf() : undefined,
        order: bestScored ?? undefined,
        maxNodes: d >= 2 ? maxNodes - used : undefined,
        hardDeadlineMs: d >= 2 ? hardDeadlineMs : undefined,
      });
      usedNodes += scored.stats.nodes;
      usedQnodes += scored.stats.qnodes;
      if (scored.stats.aborted) {
        // 予算（または安全弁）を超えた反復は破棄する。完了した最後の深さの採点を使う。
        aborted = true;
        if (scored.stats.abortedBy === "hard") {
          hardLimitHit = true;
        }
        break;
      }
      bestScored = scored;
      reached = d;
    }
    const picked = selectMove(bestScored, { ...selectionOpts, rng: state.rng });
    return {
      move: picked.move,
      source: "search",
      info: {
        score: picked.score,
        depth: reached,
        nodes: usedNodes,
        qnodes: usedQnodes,
        ms: Date.now() - t0,
        breakdown: null,
        aborted,
        hardLimitHit,
      },
    };
  }

  return {
    id,
    persona: resolved,
    search: searchOpts,
    selection: selectionOpts,
    book: bookOpts,
    newGame,
    /** 手番の色の戦法（"ibisha" / "furibisha"）。オールラウンダー以外は null。newGame(seed) で抽選される。 */
    opening: (side) => state.opening[side],
    chooseMove,
    bookStats: () => (book ? { ...book.stats } : null),
  };
}
