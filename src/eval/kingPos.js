/**
 * 玉の位置の評価（2026-11-10 指示書 §4）で使う定数と純関数。本体（src/eval/terms/king.js）と参照実装
 * （src/eval/reference/terms/king.js）が同じものを使う。
 *
 * 段の数え方は自陣側から（自陣の後段＝1段目）。盤の座標は tsshogi 流（段1が先手から見て敵陣側、段9が先手の後段）。
 * 手数は「局面の手数」＝次に指す手が何手目か（初形は1。SFEN の末尾と同じ数え方。board.moveNumber()）。
 *
 *   (a) kingHome    … 11手目〜30手目、自玉が初期位置（自陣1段目の5筋）にいたら減点。
 *   (b) kingAdvance … 自玉が自陣から数えて 3段目以上にいたら減点（「玉は基本2段目」の裏側）。
 *       罰点は手数による段階式（下記の段階表）で、対局の最後まで残る。項は罰点をそのまま返す。
 *   (c) kingGuard   … 自玉に最も近い金2枚と銀1枚に、自玉との距離の守りの係数（DEFENSE_PCT）を掛けて足す。
 *
 * (a)(c) の重み（点数）はここでは決めない（registry.js の既定値／キャラの weights）。(b) の罰点は段階表が決める。
 * 項の値は「自分 − 相手」（手番視点）。
 */

/** (a) の手数の範囲（両端を含む） */
export const KING_HOME_FROM = 11;
export const KING_HOME_TO = 30;
/**
 * (b) の段階表：[その段階の最後の手数（含む）, 罰点] の並び。手数が最後の段階の上限も超えたら、最後の段階の罰点。
 * 2026-11-20 本人決定：従来の「30手目まで一律80・31手目から 0」の崖をやめ、手数で下がっていく段階式にした。
 * どの表を使うかは気質で決まり、style.kingAdvanceStages で評価関数に渡る（characters の特性が持つ）。
 * 未指定はバランス。攻めは終盤に軽く（20まで下がる）、受けは後半でも罰を残す（60）のが位置づけ。
 */
export const KING_ADVANCE_STAGES_BALANCE = Object.freeze([[30, 80], [50, 60], [70, 50], [Infinity, 20]]);
export const KING_ADVANCE_STAGES_SEME = Object.freeze([[30, 80], [50, 60], [70, 40], [Infinity, 20]]);
export const KING_ADVANCE_STAGES_UKE = Object.freeze([[30, 100], [50, 80], [80, 70], [Infinity, 60]]);
export const KING_ADVANCE_STAGES_DEFAULT = KING_ADVANCE_STAGES_BALANCE;
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

/** 段階表の形を検査する（resolveStyle・composeStyle から使う）。 */
export function assertKingAdvanceStages(stages, where = "kingAdvanceStages") {
  const bad = (msg) => new Error(`${where}: ${msg}`);
  if (!Array.isArray(stages) || stages.length === 0) {
    throw bad("段階表は1つ以上の [手数, 罰点] の配列で指定してください");
  }
  let prev = 0;
  for (const row of stages) {
    if (!Array.isArray(row) || row.length !== 2) throw bad("段階は [手数, 罰点] の組で指定してください");
    const [to, penalty] = row;
    if (typeof to !== "number" || Number.isNaN(to) || to <= prev) throw bad("段階の手数は増える順に指定してください");
    if (typeof penalty !== "number" || !Number.isFinite(penalty)) throw bad("罰点は有限の数で指定してください");
    prev = to;
  }
}

/** style から (b) の段階表を取り出す。未指定・style 自体が無ければバランス。 */
export function kingAdvanceStagesOf(style) {
  return style?.kingAdvanceStages ?? KING_ADVANCE_STAGES_DEFAULT;
}

/** (b) の罰点：moveNo が入る段階の点数（正の数）。 */
export function kingAdvancePenalty(moveNo, stages) {
  for (const [to, penalty] of stages) {
    if (moveNo <= to) return penalty;
  }
  return stages[stages.length - 1][1];
}
