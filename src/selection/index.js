/**
 * REQUIREMENTS §7.2: 指し手の選択ルール（人間らしい発散）。
 * 1. 最善手との評価差が margin 以内の手だけを候補にする
 * 2. 候補を順位別の重み、または評価差に応じた重み（softmax）で抽選する
 * 3. 一定確率（slip率）で、広い margin から選び、稀な悪手を出す
 *
 * 注意: αβは最善手以外の評価値を正確に返さないため、
 * ルートの各手を個別に探索する（MultiPV方式）。
 * 王手は§4.1の許可制を通した上で候補にする。
 */
import { searchBestMove } from "../search/index.js";
import { filterAllowedMoves } from "../behavior/checkPolicy.js";
import { createRng } from "../core/rng.js";
import { retreatTerm } from "../eval/terms/retreat.js";
import { captureTerm } from "../eval/terms/capture.js";
import { MATE_SCORE, toMatePlies, isMateScore } from "../search/constants.js";

/**
 * ルートの各手を個別探索し、スコアつき候補列を作る。
 * retreatWeight が 0 でないとき、後退する手（retreatTerm = 1）のスコアから
 * retreatWeight を引く（4-0-5）。margin 判定より前に行う。retreatTerm は指す前の盤面で呼ぶ。
 * @param {object} [options]  pruneMargin?: number（打ち切り幅。最善手との差がこれを超えると確定した手は読むのをやめて候補から外す。
 *     margin（slip の広い margin を含む）＋余裕点を渡す。省略なら打ち切りなし＝従来どおり）
 *   order?: {move,score}[]（前の反復の採点。この順で読むと打ち切りが効きやすい）
 *   retreatWeight?: number（既定 0 = 後退を見ない。挙動は接続前と同じ）
 *   captureWeight?: number（既定 0 = 取る手を見ない。取った駒の価値 × 重みを手のスコアに足す。負なら減点。
 *     retreat と同じく、実際に指すルートの手の採点にだけ・margin 判定より前に加える。詰みの点には足さない）
 *   maxNodes?: number（全ルート手の合計のノード予算・docs/NODE-BUDGET-DESIGN.md §5。
 *     残り予算を超えた候補手の探索が中断したら、その反復（この呼び出し1回分）は破棄する。
 *     stats.aborted が true になる。深さ1の採点は必ず完了させること（呼び出し側の責務））
 *   hardDeadlineMs?: number（安全弁・時刻。maxNodes 有効時のみ渡す）
 * @returns {{move,score}[] & {stats:{nodes,qnodes,aborted,abortedBy,abortedUsi}}}
 *   返り値は配列（変更なし）だが、stats にノード合計と中断の有無を付ける。
 *   中断された候補手（stats.abortedUsi）と、それに続く候補手の結果は含まない（反復の破棄は呼び出し側で行う）。
 */
export function scoreRootMoves(board, options = {}) {
  const depth = options.depth ?? 2;
  const retreatWeight = options.retreatWeight ?? 0;
  const captureWeight = options.captureWeight ?? 0;
  const evaluate = options.evaluate;
  const context = options.context;
  const style = options.style ?? {};
  const quiescence = options.quiescence ?? true;
  const useCheckPolicy = options.useCheckPolicy ?? true;
  const hasBudget = options.maxNodes !== undefined && options.maxNodes !== null;
  const budgetTotal = hasBudget ? Math.max(0, Math.floor(options.maxNodes)) : null;
  const hardDeadlineMs = hasBudget ? options.hardDeadlineMs ?? null : null;

  // 歩・角・飛は成れるとき成る手だけ読む（探索用の合法手。オラクル盤には無いので全合法手にフォールバック）
  let moves = board.legalMovesForSearch ? board.legalMovesForSearch() : board.legalMoves();
  if (useCheckPolicy && depth >= 2) {
    const filtered = filterAllowedMoves(board, moves);
    moves = filtered.length > 0 ? filtered : moves;
  }
  if (options.order) {
    const rank = new Map(options.order.map((c, i) => [c.move.usi, i]));
    moves = [...moves].sort((a, b) => (rank.get(a.usi) ?? 1e9) - (rank.get(b.usi) ?? 1e9));
  }
  const pruneMargin = options.pruneMargin ?? null;
  let bestFinal = -Infinity;
  const scored = [];
  let usedNodes = 0;
  let usedQnodes = 0;
  let aborted = null; // null | { by: "nodes"|"hard", usi: string|null }
  for (const move of moves) {
    const penalty = retreatWeight !== 0 ? retreatWeight * retreatTerm(board, move) : 0;
    const bonus = captureWeight !== 0 ? captureWeight * captureTerm(board, move, style) : 0;
    board.makeMove(move);
    // 打ち切り窓: 最終点 -reply - penalty + bonus が bestFinal - margin 以上の手だけが候補になりうる。
    // reply > B なら候補外が確定（B = -(bestFinal - margin) - penalty + bonus）。
    const childBeta = pruneMargin !== null && bestFinal > -Infinity && depth - 1 >= 1
      ? -(bestFinal - pruneMargin) - penalty + bonus + 1e-7
      : undefined;
    const reply = searchBestMove(board, {
      beta: childBeta,
      depth: depth - 1,
      evaluate,
      style,
      quiescence,
      useCheckPolicy,
      transposition: null,
      rawScores: true, // 内部値（残り深さ基準）のまま受け取り、下で根の深さを使って「100000 − 手数」にする
      context,
      maxNodes: hasBudget && depth >= 2 ? budgetTotal - usedNodes - usedQnodes : undefined,
      hardDeadlineMs: hasBudget && depth >= 2 ? hardDeadlineMs : undefined,
    });
    board.unmakeMove(move);
    usedNodes += reply.nodes ?? 0;
    usedQnodes += reply.qnodes ?? 0;
    if (reply.aborted) {
      // 中断した探索・その後の候補手の値は使わない（反復ごと破棄は呼び出し側で行う）
      aborted = { by: reply.abortedBy ?? "nodes", usi: move.usi ?? null };
      break;
    }
    if (reply.failHigh) {
      continue; // 候補外が確定（値は境界値なので載せない）
    }
    // searchBestMove の score は相手番視点なので反転させる
    // 詰みの点数は「100000 − 手数」にそろえる（1手詰め 99999・3手詰め 99997）。詰みには後退ペナルティを掛けない
    // （ペナルティで、早い詰みが遅い詰みや詰まない手より低くならないように）。
    const normalized = toMatePlies(-reply.score, depth);
    scored.push({ move, score: isMateScore(normalized) ? normalized : normalized - penalty + bonus });
    if (-reply.score - penalty + bonus > bestFinal) bestFinal = -reply.score - penalty + bonus;
  }
  scored.sort((a, b) => b.score - a.score);
  scored.stats = {
    nodes: usedNodes,
    qnodes: usedQnodes,
    aborted: aborted !== null,
    ...(aborted ? { abortedBy: aborted.by, abortedUsi: aborted.usi } : {}),
  };
  return scored;
}

/**
 * margin/slip で1手を選ぶ。
 * @param {{move, score}[]} scored score降順
 * @param {{margin?:number, slipRate?:number, slipMargin?:number, temperature?:number, seed?:number, rng?:Function}} [options]
 */
export function selectMove(scored, options = {}) {
  if (scored.length === 0) {
    return null;
  }
  const margin = options.margin ?? 100;
  const slipRate = options.slipRate ?? 0;
  const slipMargin = options.slipMargin ?? 500;
  const temperature = options.temperature ?? 100;
  const rng = options.rng ?? createRng(options.seed ?? 1);

  const best = scored[0].score;
  // 詰ませられる局面では、いちばん早い詰みの手だけを指す（margin・slip・softmax で詰み手順をぼかさない。
  // 詰みの点は「残り深さ」ぶんしか違わないので、margin の内側に遅い詰みや詰まない手が混ざるのを防ぐ）。
  // 乱数は使わない（同じ局面で乱数列の進み方が変わらないよう、ここでは rng を消費しない）。
  if (isMateScore(best) && best > 0) {
    return scored[0];
  }
  const useWide = rng() < slipRate;
  const activeMargin = useWide ? slipMargin : margin;
  const candidates = scored.filter((s) => best - s.score <= activeMargin);
  const pool = candidates.length > 0 ? candidates : [scored[0]];

  // softmax重み（評価差/temperature）
  const weights = pool.map((s) => Math.exp((s.score - best) / temperature));
  let total = 0;
  for (const w of weights) {
    total += w;
  }
  let r = rng() * total;
  for (let i = 0; i < pool.length; i++) {
    r -= weights[i];
    if (r <= 0) {
      return pool[i];
    }
  }
  return pool[pool.length - 1];
}
