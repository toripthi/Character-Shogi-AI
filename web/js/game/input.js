/**
 * タップ入力の解釈。合法手の集合（rules.legalUsis()）だけを根拠にする純粋なロジック。UI は将棋のルールを持たない。
 *
 * 選択状態: null | { origin:'BOARD', square:{file,rank}, pieceType, side } | { origin:'HAND', pieceType, side }
 * 成りの扱いも合法手から決める：移動先に「成る手」と「成らない手」の両方が合法なら選択ポップアップ、
 * 片方だけなら（歩が最奥段に進む等の強制成り・成れないマス）ポップアップなしでその手を指す。
 */
import { squareToUsi, usiToSquare } from "../engine/usi.js";

const DROP_LETTER = { FU: "P", KY: "L", KE: "N", GI: "S", KI: "G", KA: "B", HI: "R" };

/** 選択中の駒が動ける先。{ file, rank, usis:[...] }（usis は成り/不成りの合法手。1〜2個）の配列 */
export function targetsOf(selection, legalUsis) {
  if (!selection) return [];
  const byTo = new Map();
  const add = (toText, usi) => {
    if (!byTo.has(toText)) byTo.set(toText, []);
    byTo.get(toText).push(usi);
  };
  if (selection.origin === "HAND") {
    const prefix = `${DROP_LETTER[selection.pieceType]}*`;
    for (const u of legalUsis) if (u.startsWith(prefix)) add(u.slice(2, 4), u);
  } else {
    const prefix = squareToUsi(selection.square);
    for (const u of legalUsis) if (u.startsWith(prefix) && !u.includes("*")) add(u.slice(2, 4), u);
  }
  return [...byTo].map(([t, usis]) => ({ ...usiToSquare(t), usis }));
}

/**
 * 盤のタップを解釈する。
 * @returns {{ selection: object|null, play?: string, choose?: string[], message?: string }}
 *   play: そのまま指す USI／choose: [成らない手, 成る手] のどちらかを選ばせる／selection: タップ後の選択状態
 */
export function tapBoard({ square, selection, boardState, humanSide, legalUsis }) {
  const piece = boardState.squares[square.file - 1][square.rank - 1];
  const sameSquare = (s) => s && s.origin === "BOARD" && s.square.file === square.file && s.square.rank === square.rank;

  if (selection) {
    if (sameSquare(selection)) return { selection: null };
    const hit = targetsOf(selection, legalUsis).find((t) => t.file === square.file && t.rank === square.rank);
    if (hit) {
      if (hit.usis.length === 1) return { selection: null, play: hit.usis[0] };
      const plain = hit.usis.find((u) => !u.endsWith("+"));
      const promote = hit.usis.find((u) => u.endsWith("+"));
      return { selection, choose: [plain, promote] };
    }
  }
  if (piece && piece.side === humanSide) {
    return { selection: { origin: "BOARD", square: { file: square.file, rank: square.rank }, pieceType: piece.type, side: piece.side } };
  }
  return { selection: null };
}

/** 持ち駒のタップを解釈する（自分の持ち駒だけ選べる。同じ駒をもう一度で解除） */
export function tapHand({ side, pieceType, selection, humanSide, legalUsis }) {
  if (side !== humanSide) return { selection };
  if (selection && selection.origin === "HAND" && selection.pieceType === pieceType) return { selection: null };
  const next = { origin: "HAND", pieceType, side };
  if (targetsOf(next, legalUsis).length === 0) return { selection: null, message: "その駒を打てる場所がありません" };
  return { selection: next };
}
