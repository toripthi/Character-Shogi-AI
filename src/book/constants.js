/**
 * 定跡の定数。出口検査（build）と、外れたあとに戻る条件（lookup）で同じ値を共有する（D-016・D-022）。
 */
export const EXIT_LIMITS = Object.freeze({
  ABS_EVAL_MAX: 150,    // 出口局面の評価（balance）の絶対値の上限。戻る条件（rejoinMaxAbs）と共有
  LEGAL_MIN: 15,        // 出口局面の合法手の下限
  SEARCH_DEPTH: 2,      // 出口の探索深さ
  SEARCH_SCORE_MIN: -200, // 手番側の探索評価がこれより大きいこと
});
export const REJOIN_MAX_ABS_DEFAULT = EXIT_LIMITS.ABS_EVAL_MAX;
