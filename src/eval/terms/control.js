/**
 * 評価項: 敵陣制圧度（REQUIREMENTS §5.3）。
 * 両者の敵陣で「自駒の利き数 − 敵駒の利き数」を数え、自分側から相手側を引く。
 * （K8反対称化：手番を入れ替えても符号だけが反転する）
 * 初期局面で大きな負値にならないよう、自駒の利きが0のマスは
 * 「敵の利きの厚み」ではなく「未制圧」として0点にする。
 *
 * 2026-11-05：最適化前は、評価のたびに利き数の配列を2つ作り、敵陣54マスぶん tsshogi の
 * Square.newByUSI（文字列の解析）で添字を引いていた。いまは配列を使い回し、添字は表で引く。
 * 値は最適化前の実装（src/eval/reference/terms/control.js）と同じ。
 */
import { IX_TO_TSSHOGI, SQ_TO_IX } from "../../core/fastboard.js";
import { referenceControlTerm } from "../reference-link.js";

/**
 * color の敵陣（先手は1〜3段、後手は7〜9段）の全マスの、利き数の配列（tsshogi Square.index）上の添字。
 * 並びは最適化前と同じ（筋1→9、段の昇順）。
 */
function campIndexes(color) {
  const ranks = color === 0 ? [1, 2, 3] : [7, 8, 9];
  const out = [];
  for (let file = 1; file <= 9; file++) {
    for (const rank of ranks) {
      out.push(IX_TO_TSSHOGI[SQ_TO_IX[file * 10 + rank]]);
    }
  }
  return Int32Array.from(out);
}
const CAMP = [campIndexes(0), campIndexes(1)];

// 利き数の配列（評価のたびに作らず使い回す。controlTerm の中で使い切るので、入れ子にはならない）
const COUNTS_BLACK = new Int32Array(81);
const COUNTS_WHITE = new Int32Array(81);

function sideControl(mine, theirs, camp) {
  let score = 0;
  for (let k = 0; k < camp.length; k++) {
    const index = camp[k];
    const m = mine[index];
    if (m === 0) {
      continue; // 未制圧マスは減点しない（初期局面で負に発散しないため）
    }
    score += m - theirs[index];
  }
  return score;
}

export function controlTerm(board) {
  const fb = board.fb;
  if (!fb) {
    return referenceControlTerm(board);
  }
  COUNTS_BLACK.fill(0);
  COUNTS_WHITE.fill(0);
  fb.computeAttackCountsInto(COUNTS_BLACK, COUNTS_WHITE);
  const turn = fb.turnN;
  const mine = turn === 0 ? COUNTS_BLACK : COUNTS_WHITE;
  const theirs = turn === 0 ? COUNTS_WHITE : COUNTS_BLACK;
  return sideControl(mine, theirs, CAMP[turn]) - sideControl(theirs, mine, CAMP[turn ^ 1]);
}
