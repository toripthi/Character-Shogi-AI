/**
 * 玉の位置の評価（2026-11-10 指示書 §4）で使う定数と純関数。本体（src/eval/terms/king.js）と参照実装
 * （src/eval/reference/terms/king.js）が同じものを使う。
 *
 * 段の数え方は自陣側から（自陣の後段＝1段目）。盤の座標は tsshogi 流（段1が先手から見て敵陣側、段9が先手の後段）。
 * 手数は「局面の手数」＝次に指す手が何手目か（初形は1。SFEN の末尾と同じ数え方。board.moveNumber()）。
 *
 *   (a) kingHome    … 11手目〜30手目、自玉が初期位置（自陣1段目の5筋）にいたら減点。
 *   (b) kingAdvance … 30手目まで、自玉が自陣から数えて 3段目以上にいたら減点（「玉は基本2段目」の裏側）。
 *   (c) kingGuard   … 自玉に最も近い金2枚と銀1枚に、自玉との距離の守りの係数（DEFENSE_PCT）を掛けて足す。
 *
 * 重み（点数）はここでは決めない（registry.js の既定値／キャラの weights）。項の値は「自分 − 相手」（手番視点）。
 */

/** (a) の手数の範囲（両端を含む） */
export const KING_HOME_FROM = 11;
export const KING_HOME_TO = 30;
/** (b) の手数の上限（含む） */
export const KING_ADVANCE_TO = 30;
/**
 * (b) の「前に出すぎ」の境目：自陣から数えてこの段以上。
 * 指示書は「3段目以上（自陣から数えて3段目より敵陣寄り）」で、括弧内は4段目以上とも読める。
 * ここでは本文どおり 3段目以上（3 を含む）にしてある。4段目以上にするなら 4 に変える（確認依頼 B）。
 */
export const KING_ADVANCE_MIN_OWN_RANK = 3;
/** 守りの対象：金の枚数・銀の枚数（自玉に近い順） */
export const GUARD_GOLDS = 2;
export const GUARD_SILVERS = 1;

/** 盤の段（1〜9、段1が先手から見て敵陣側）を、color から見た自陣側からの段（1〜9）に直す。color は "black"/"white"。 */
export function ownRankOf(color, rank) {
  return color === "black" ? 10 - rank : rank;
}

/** (a) の手数の範囲内か（moveNo = 局面の手数） */
export function inKingHomeWindow(moveNo) {
  return moveNo >= KING_HOME_FROM && moveNo <= KING_HOME_TO;
}

/** (b) の手数の範囲内か */
export function inKingAdvanceWindow(moveNo) {
  return moveNo <= KING_ADVANCE_TO;
}
