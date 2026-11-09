/**
 * 玉との距離で変わる評価の部品（2026-11-09 改修指示書 docs/specs/eval-2piece-spec-2026-11-09.md）。
 * 純データ・純関数。本体（src/eval/terms/）と参照実装（src/eval/reference/terms/）が同じ表を使う。
 *
 * 係数はすべて整数の「百分率」で持つ（100 = 1.0）。評価の項は 百分率 × 点 を整数のまま足し込み、
 * 最後に 100 で割る。小数（0.75・0.4 など）を駒ごとに足すと、足す順序で末尾の桁がずれて
 * 本体と参照実装が一致しなくなるため（駒の走査順が違う）。
 */

/** 距離（チェビシェフ距離：縦・横・斜めを1歩と数える）。 */
export function chebyshev(file1, rank1, file2, rank2) {
  return Math.max(Math.abs(file1 - file2), Math.abs(rank1 - rank2));
}

/** 攻めの距離係数（敵玉との距離 → 百分率）。添字は距離 0〜8（0 は玉と同じマスで、実際には起きない）。 */
export const ATTACK_PCT = Object.freeze([100, 100, 100, 75, 25, 0, 0, 0, 0]);

/** 守りの距離係数（自玉との距離 → 百分率）。距離4以上は守備には遠すぎるので 0。 */
export const DEFENSE_PCT = Object.freeze([100, 100, 100, 40, 0, 0, 0, 0, 0]);

/** 香車の段係数（初期位置の段から進んだ段数 0,1,2,3以上 → 百分率）。成っていない盤上の香車だけに掛ける。 */
export const LANCE_PCT = Object.freeze([100, 90, 80, 75]);

/** 持ち駒の価値の倍率（元駒の価値に対する百分率）。全気質共通。 */
export const HAND_PCT = 125;

/** 敵陣の1段目にある金の価値の倍率（百分率）。どの駒価値セットでも銀を下回る。 */
export const GOLD_FIRST_RANK_PCT = 60;

/** 「1段目のルール」が効く、敵玉との最小距離。距離1〜2（詰めの主役になりうる）では効かせない。 */
export const FIRST_RANK_MIN_DIST = 3;

/** 敵玉との距離 → 攻めの係数。玉がいない（null）ときは割り引かない（100）。 */
export function attackPct(distToEnemyKing) {
  return distToEnemyKing === null ? 100 : ATTACK_PCT[distToEnemyKing];
}

/** 自玉との距離 → 守りの係数。玉がいない（null）ときは 0。 */
export function defensePct(distToOwnKing) {
  return distToOwnKing === null ? 0 : DEFENSE_PCT[distToOwnKing];
}

/** 敵陣の1段目にあり、かつ敵玉との距離が3以上か（1段目のルールが効く条件）。 */
export function firstRankFar(atFirstRank, distToEnemyKing) {
  return atFirstRank && distToEnemyKing !== null && distToEnemyKing >= FIRST_RANK_MIN_DIST;
}

/**
 * 成り駒（金の動きをするもの。馬・龍は対象外）の「成りによる上乗せ分」に掛ける係数。
 * 敵玉との攻めの係数と、自玉との守りの係数の大きい方（合計はしない）。
 * 1段目のルールが効くときは 0。
 */
export function promotedExtraPct(distToEnemyKing, distToOwnKing, atFirstRank) {
  if (firstRankFar(atFirstRank, distToEnemyKing)) {
    return 0;
  }
  return Math.max(attackPct(distToEnemyKing), defensePct(distToOwnKing));
}

/** 香車の段係数。advanced = 初期位置の段から進んだ段数（0以上）。 */
export function lancePct(advanced) {
  return LANCE_PCT[advanced >= 3 ? 3 : advanced];
}
