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
