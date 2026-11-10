/**
 * 【参照実装】玉の位置の評価（2026-11-10 指示書 §4）。定義は src/eval/kingPos.js の冒頭。
 * 項の値は「自分 − 相手」（手番視点）。減点の項（kingHome・kingAdvance）は、該当すると -1（重みを掛けると減点）。
 */
import { chebyshev, defensePct } from "../../proximity.js";
import {
  inKingHomeWindow,
  inKingAdvanceWindow,
  ownRankOf,
  KING_ADVANCE_MIN_OWN_RANK,
  GUARD_GOLDS,
  GUARD_SILVERS,
} from "../../kingPos.js";
import { enemyOf, findKings, forEachPiece } from "./util.js";

/** (a) 11〜30手目に初期位置の玉：1 なら該当。 */
function homePenalty(king, color, moveNo) {
  if (!king || !inKingHomeWindow(moveNo)) return 0;
  return king.file === 5 && ownRankOf(color, king.rank) === 1 ? 1 : 0;
}

/** (b) 30手目までに3段目以上へ出た玉：1 なら該当。 */
function advancePenalty(king, color, moveNo) {
  if (!king || !inKingAdvanceWindow(moveNo)) return 0;
  return ownRankOf(color, king.rank) >= KING_ADVANCE_MIN_OWN_RANK ? 1 : 0;
}

export function kingHomeTerm(board) {
  const turn = board.turn();
  const kings = findKings(board);
  const n = board.moveNumber();
  return homePenalty(kings[enemyOf(turn)], enemyOf(turn), n) - homePenalty(kings[turn], turn, n);
}

export function kingAdvanceTerm(board) {
  const turn = board.turn();
  const kings = findKings(board);
  const n = board.moveNumber();
  return advancePenalty(kings[enemyOf(turn)], enemyOf(turn), n) - advancePenalty(kings[turn], turn, n);
}

/** color の玉の守り（百分率の合計）：自玉に近い金 GUARD_GOLDS 枚・銀 GUARD_SILVERS 枚。盤上の駒だけ（持ち駒は数えない）。 */
function guardPct100(board, color, king) {
  if (!king) return 0;
  const golds = [];
  const silvers = [];
  forEachPiece(board, ({ piece, file, rank }) => {
    if (piece.color !== color) return;
    if (piece.type === "gold") golds.push(defensePct(chebyshev(file, rank, king.file, king.rank)));
    else if (piece.type === "silver") silvers.push(defensePct(chebyshev(file, rank, king.file, king.rank)));
  });
  const top = (arr, k) => arr.sort((a, b) => b - a).slice(0, k).reduce((s, x) => s + x, 0);
  return top(golds, GUARD_GOLDS) + top(silvers, GUARD_SILVERS);
}

export function kingGuardTerm(board) {
  const turn = board.turn();
  const enemy = enemyOf(turn);
  const kings = findKings(board);
  return (guardPct100(board, turn, kings[turn]) - guardPct100(board, enemy, kings[enemy])) / 100;
}
