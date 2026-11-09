/** 探索まわりの定数。 */

export const MATE_SCORE = 100000;

/** 静止探索の上限（2026-10-18）。取り合いの連鎖がこの手数を超えたら、そこで静的評価に戻す。 */
export const Q_MAX_DEPTH = 8;
/** 静止探索のデルタ剪定の余裕（点）。取る駒の価値＋これでも alpha に届かない取りは読まない。 */
export const Q_DELTA_MARGIN = 200;

/** 1手あたりのノード数（nodes+qnodes）の既定の上限（2026-10-18）。最も遅いキャラで約3秒。search.budget:false で外せる。 */
export const DEFAULT_MAX_NODES = 200_000;

/** ルート採点の打ち切りの余裕点の既定（2026-11-06、docs/PLAN.md ⑦）。静止探索のデルタ剪定の余裕と同じ値。 */
export const PRUNE_SLACK_DEFAULT = 200;

/**
 * 詰みの点数の表記：「詰ます側は 100000 − 手数」。1手詰め＝99999、3手詰め＝99997、…（詰まされる側は符号が逆）。
 * 手数は「その局面の手番側から数えた、詰みまでの手数（半手の数）」。
 *
 * 探索の内部（negamax・置換表）は「詰みの局面に着いた時点の残り深さ」で持つ（MATE_SCORE + 残り深さ。
 * 置換表に入れても局面ごとの相対値なので補正が要らない）。人に見せる点数・手の比較に出る点数にするときだけ、
 * 根の深さ rootDepth を使ってこの形に直す。詰みでない点数（|score| < MATE_SCORE）はそのまま返す。
 */
export function toMatePlies(score, rootDepth) {
  if (score >= MATE_SCORE) {
    return MATE_SCORE - (rootDepth - (score - MATE_SCORE));
  }
  if (score <= -MATE_SCORE) {
    return -(MATE_SCORE - (rootDepth - (-score - MATE_SCORE)));
  }
  return score;
}

/** 詰みの点数か（表記後でも内部値でも成り立つ：どちらも |score| >= MATE_SCORE - 最大の深さ）。 */
export const isMateScore = (score) => Math.abs(score) >= MATE_SCORE / 2;

/** 表記後の詰みの点数 → 詰みまでの手数（詰ます側が正、詰まされる側が負）。詰みでなければ null */
export function matePliesOf(score) {
  if (!isMateScore(score)) return null;
  return score > 0 ? MATE_SCORE - score : -(MATE_SCORE + score);
}
