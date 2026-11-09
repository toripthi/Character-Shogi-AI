/**
 * 評価項: 駒得（material）。手番側視点。
 * 重みは掛けない（掛けるのは eval/index.js）。
 *
 * 2026-11-09 改修（docs/specs/eval-2piece-spec-2026-11-09.md §4・§5・§6・§10）：
 *   - 持ち駒は元駒の価値の 1.25 倍（D-010 の「元駒の価値」に割り増し。全気質共通）
 *   - 成り駒（と金・成香・成桂・成銀。馬・龍は対象外）：元駒 ＋ 上乗せ分 × 距離係数
 *       距離係数 ＝ max(敵玉との攻めの係数, 自玉との守りの係数)。合計はしない
 *   - 敵陣の1段目で敵玉との距離が3以上のとき、金は 0.6 倍、金の動きの成り駒は上乗せ分 0
 *   - 盤上の（成っていない）香車は、初期位置の段から進むほど安い（1・0.9・0.8・0.75）
 * 駒割の本体は、玉との距離では割り引かない（距離で変わるのは成りの上乗せ分だけ）。
 *
 * 計算は「点 × 百分率」を整数のまま足し、最後に100で割る（proximity.js の冒頭を参照）。
 */
import { handValueOf } from "../../pieceSets.js";
import { chebyshev, firstRankFar, promotedExtraPct, lancePct, HAND_PCT, GOLD_FIRST_RANK_PCT } from "../../proximity.js";
import { enemyOf, forEachPiece, findKings } from "./util.js";

// 金の動きをする成り駒 → 元駒
const GOLD_MOVER_BASE = { promPawn: "pawn", promLance: "lance", promKnight: "knight", promSilver: "silver" };

/** 盤上の1枚の価値 × 100。 */
function boardValue100(piece, file, rank, kings, values) {
  const owner = piece.color;
  const ownKing = kings[owner];
  const enemyKing = kings[enemyOf(owner)];
  const distEnemy = enemyKing ? chebyshev(file, rank, enemyKing.file, enemyKing.rank) : null;
  const distOwn = ownKing ? chebyshev(file, rank, ownKing.file, ownKing.rank) : null;
  const atFirstRank = owner === "black" ? rank === 1 : rank === 9; // 敵陣の1段目

  const v = values[piece.type] ?? 0;
  if (piece.type === "lance") {
    const advanced = owner === "black" ? 9 - rank : rank - 1;
    return v * lancePct(advanced);
  }
  if (piece.type === "gold") {
    return v * (firstRankFar(atFirstRank, distEnemy) ? GOLD_FIRST_RANK_PCT : 100);
  }
  const baseType = GOLD_MOVER_BASE[piece.type];
  if (baseType) {
    const base = values[baseType] ?? 0;
    return base * 100 + (v - base) * promotedExtraPct(distEnemy, distOwn, atFirstRank);
  }
  return v * 100;
}

export function materialTerm(board, style) {
  const values = style.pieceValues;
  const turn = board.turn();
  const enemy = enemyOf(turn);
  const kings = findKings(board);

  let mine = 0;
  let theirs = 0;

  forEachPiece(board, ({ piece, file, rank }) => {
    const v = boardValue100(piece, file, rank, kings, values);
    if (piece.color === turn) {
      mine += v;
    } else if (piece.color === enemy) {
      theirs += v;
    }
  });

  const myHand = board.hand(turn);
  const enemyHand = board.hand(enemy);
  for (const type of Object.keys(myHand)) {
    const v = handValueOf(type, values) * HAND_PCT;
    mine += (myHand[type] ?? 0) * v;
    theirs += (enemyHand[type] ?? 0) * v;
  }

  return (mine - theirs) / 100;
}
