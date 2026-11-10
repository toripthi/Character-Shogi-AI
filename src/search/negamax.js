/**
 * negamax + αβ + 静止探索の本体（再帰部分）。
 * 公開API（searchBestMove / think）は ./index.js。
 *
 * 手は FastBoard の内部 int 符号（board.fb）で扱う（オブジェクト化は境界でのみ行う）。
 * board（公開ラッパー）と board.fb は常に同じ盤面状態を指すので、
 * evaluate(board, …) や board.sfen() を混ぜて使っても整合する。
 * 置換表のキーは fb.zkey()（Zobrist。盤・手番・持ち駒。2026-11-05 に SFEN 文字列から替えた）。
 */
import { filterAllowedMovesInt } from "../behavior/checkPolicy.js";
import { MATE_SCORE, Q_DELTA_MARGIN, Q_MAX_DEPTH } from "./constants.js";
import { historyUpdate, orderAndFilterInt, orderMovesInt } from "./ordering.js";
import { intToMove, TYPE_STRING } from "../core/fastboard.js";
import { resolveStyle } from "../eval/index.js";
import { probeTt, storeTt } from "./tt.js";

/**
 * ノード数の予算（docs/NODE-BUDGET-DESIGN.md §2）。
 * nodes + qnodes が ctx.b.maxNodes を超えたら ctx.b.hit を立てて打ち切りを返す。
 * 例外は使わない（呼び出し側で必ず unmakeMove 済みの状態で戻る。決定的）。
 * hardDeadlineMs（時刻の安全弁）はカウントが4096の倍数のときだけ Date.now() を見る。
 */
export function budgetHit(ctx) {
  const b = ctx.b;
  if (!b) return false;
  const used = ctx.stats.nodes + ctx.stats.qnodes;
  if (b.maxNodes !== undefined && b.maxNodes !== null && used > b.maxNodes) {
    b.hit = "nodes";
    return true;
  }
  if (b.hardDeadlineMs != null && used % 4096 === 0 && Date.now() > b.hardDeadlineMs) {
    b.hit = "hard";
    return true;
  }
  return false;
}

export function negamax(board, depth, alpha, beta, evaluate, style, ctx) {
  const { quiescence, useCheckPolicy, tt, stats } = ctx;
  const fb = board.fb;
  stats.nodes += 1;
  if (budgetHit(ctx)) {
    return 0;
  }

  if (tt) {
    const hit = probeTt(tt, fb.zkey(), depth, alpha, beta);
    if (hit !== null) {
      stats.ttHits += 1;
      return hit;
    }
  }

  if (depth <= 0) {
    // 葉ノード（全ノードの9割以上）：詰みかどうかだけが要るので、全合法手は作らず「1手でもあるか」で調べる
    // （2026-11-05。legalMoves().length === 0 と同じ結果。以前は全合法手を作ってから捨てていた）。
    if (!fb.hasLegalMove()) {
      return -(MATE_SCORE + depth);
    }
    if (!quiescence) {
      return ctx.evalScore ? ctx.evalScore(board, style) : evaluate(board, style).score;
    }
    return quiescenceSearch(board, alpha, beta, evaluate, style, stats, ctx, 0);
  }

  let moves = fb.legalMovesForSearch(); // 歩・角・飛は成れるとき成る手だけ読む
  if (moves.length === 0) {
    // 手番側が詰み: 深さ余裕が大きい（=早い詰み）ほど強く加点（DECISIONS D-002）
    return -(MATE_SCORE + depth);
  }

  if (useCheckPolicy) {
    // 並べ替え＋無駄王手フィルタの統合（makeMoved/inCheck の確認を1回にする）
    const ordered = orderAndFilterInt(board, moves, style, tt, true, ctx.history ?? null);
    if (ordered.length > 0) {
      moves = ordered;
    } else {
      // 全手が不許可なら元の候補に戻す（旧 filterAllowedWithFallback と同一のフォールバック）
      moves = orderMovesInt(board, moves, style, tt, ctx.history ?? null);
    }
  } else {
    moves = orderMovesInt(board, moves, style, tt, ctx.history ?? null);
  }
  const alphaOrig = alpha;
  let best = -Infinity;
  let bestMove = null;
  let first = true;
  for (const move of moves) {
    fb.makeMove(move);
    let score;
    if (first) {
      score = -negamax(board, depth - 1, -beta, -alpha, evaluate, style, ctx);
      first = false;
    } else {
      // PVS（2026-11-10）: 2手目以降はゼロウィンドウで「αを超えるか」だけを先に確かめ、
      // 超えた手だけ通常ウィンドウで読み直す。返る最善手・評価値は全ウィンドウ探索と同一。
      score = -negamax(board, depth - 1, -alpha - 1, -alpha, evaluate, style, ctx);
      if (!(ctx.b && ctx.b.hit) && score > alpha && score < beta) {
        score = -negamax(board, depth - 1, -beta, -alpha, evaluate, style, ctx);
      }
    }
    fb.unmakeMove(move);
    // 途中まで読んだ値は使わない（ctx.b.hit は子で立てた打ち切りフラグ）
    if (ctx.b && ctx.b.hit) {
      return 0;
    }
    if (score > best) {
      best = score;
      bestMove = move;
    }
    if (best > alpha) {
      alpha = best;
    }
    if (alpha >= beta) {
      // βカットを起こした静かな手は履歴へ記録する（取る手は MVV-LVA が担当するので対象外）
      if (((move >>> 21) & 0xf) === 0) {
        historyUpdate(ctx.history ?? null, fb.turnN, move, depth);
      }
      break;
    }
  }
  if (tt) {
    // 4-0-7（K4）：α以下で終わった値は上限、βでカットした値は下限、それ以外は正確な値。
    const flag = best <= alphaOrig ? "upper" : best >= beta ? "lower" : "exact";
    storeTt(tt, fb.zkey(), depth, best, bestMove === null ? null : intToMove(fb, bestMove), flag);
  }
  return best;
}

/**
 * 無駄王手の不許可手を除く。ただし全手が不許可なら元の候補に戻す
 * （合法手0誤認による投了扱いを防ぐ）。
 * 引数・戻り値とも内部 int 手の配列（探索内部専用）。
 */
export function filterAllowedWithFallback(board, moves) {
  const filtered = filterAllowedMovesInt(board, moves);
  return filtered.length > 0 ? filtered : moves;
}

/**
 * 静止探索: 駒の取り合いが落ち着くまで読む（capture-only）。
 * 王手への応答は含めない（§4.1簡易版の応手全試しと役割分担）。
 */
function quiescenceSearch(board, alpha, beta, evaluate, style, stats, ctx, qd) {
  const fb = board.fb;
  stats.qnodes += 1;
  if (budgetHit(ctx)) {
    return 0;
  }
  const standPat = ctx.evalScore ? ctx.evalScore(board, style) : evaluate(board, style).score;
  if (standPat >= beta) {
    return beta;
  }
  if (standPat > alpha) {
    alpha = standPat;
  }
  // 取り合いの連鎖の上限（2026-10-18）：超えたら静的評価（alpha）に戻す。
  if (qd >= Q_MAX_DEPTH) {
    return alpha;
  }
  const values = (ctx.qValues ??= resolveStyle(style).pieceValues);
  const captures = orderMovesInt(board, fb.legalCapturesForSearch(), style, null);
  for (const move of captures) {
    // デルタ剪定（2026-10-18）：取る駒の価値に余裕を足しても alpha に届かない取りは読まない。
    const capType = (move >>> 21) & 0xf;
    if (capType && standPat + (values[TYPE_STRING[capType]] ?? 0) + Q_DELTA_MARGIN <= alpha) {
      continue;
    }
    fb.makeMove(move);
    const score = -quiescenceSearch(board, -beta, -alpha, evaluate, style, stats, ctx, qd + 1);
    fb.unmakeMove(move);
    if (ctx.b && ctx.b.hit) {
      return alpha;
    }
    if (score >= beta) {
      return beta;
    }
    if (score > alpha) {
      alpha = score;
    }
  }
  return alpha;
}
