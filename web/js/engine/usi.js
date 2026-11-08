/**
 * UI の指し手（Move）・盤面（BoardState）と、エンジンの USI・SFEN の変換。
 *
 * UI 側（shogi-kifu-narabe 由来）: Move = { kind:'BOARD'|'DROP', from:{file,rank}|null, to:{file,rank},
 *   pieceType（移動前の駒種）, side:'SENTE'|'GOTE', promoted:boolean }。rank は上から 1〜9。
 * USI: 盤上の手 "7g7f"・成り "8h2b+"・打ち "P*5e"。筋は数字 1〜9、段は a〜i（a=1 段目）。
 *   UI の rank 1〜9 と USI の a〜i は同じ向きなので、変換は数字⇔文字だけで済む。
 */
import { applyMoveToBoard } from "../core/apply-move.js";

/** 打てる駒（持ち駒の7種）の USI 表記 */
const DROP_TO_USI = { FU: "P", KY: "L", KE: "N", GI: "S", KI: "G", KA: "B", HI: "R" };
const USI_TO_DROP = Object.fromEntries(Object.entries(DROP_TO_USI).map(([k, v]) => [v, k]));

/** SFEN の駒表記（先手は大文字、後手は小文字。成りは + を前置） */
const TYPE_TO_SFEN = { FU: "P", KY: "L", KE: "N", GI: "S", KI: "G", KA: "B", HI: "R", OU: "K", TO: "+P", NY: "+L", NK: "+N", NG: "+S", UM: "+B", RY: "+R" };
/** SFEN の持ち駒の並び（先手分・後手分とも この順） */
const HAND_SFEN_ORDER = ["HI", "KA", "KI", "GI", "KE", "KY", "FU"];

export function squareToUsi(sq) {
  if (!sq || !Number.isInteger(sq.file) || !Number.isInteger(sq.rank) || sq.file < 1 || sq.file > 9 || sq.rank < 1 || sq.rank > 9) {
    throw new Error(`不正なマス: ${JSON.stringify(sq)}`);
  }
  return `${sq.file}${String.fromCharCode(96 + sq.rank)}`;
}

export function usiToSquare(text) {
  const m = /^([1-9])([a-i])$/.exec(text);
  if (!m) throw new Error(`不正な USI のマス: ${text}`);
  return { file: Number(m[1]), rank: m[2].charCodeAt(0) - 96 };
}

/** UI の Move → USI */
export function moveToUsi(move) {
  const to = squareToUsi(move.to);
  if (move.kind === "DROP") {
    const letter = DROP_TO_USI[move.pieceType];
    if (!letter) throw new Error(`打てない駒種です: ${move.pieceType}`);
    if (move.promoted) throw new Error("打つ手は成れません");
    return `${letter}*${to}`;
  }
  if (move.kind !== "BOARD") throw new Error(`不明な kind: ${move.kind}`);
  return `${squareToUsi(move.from)}${to}${move.promoted ? "+" : ""}`;
}

/**
 * USI → UI の Move（盤に適用する前の形。capturedPieceType・isCapture は applyMoveToBoard が埋める）。
 * 盤上の手は、移動元の駒から駒種と手番（side）を決める。打つ手は盤から手番が分からないので side が必須。
 * @param {string} usi
 * @param {object} boardState - UI の BoardState
 * @param {'SENTE'|'GOTE'} [side] - 打つ手のとき必須。盤上の手では省略可（指定すれば駒の持ち主と一致を確認）
 */
export function usiToMove(usi, boardState, side) {
  const drop = /^([PLNSGBR])\*([1-9][a-i])$/.exec(usi);
  if (drop) {
    if (side !== "SENTE" && side !== "GOTE") throw new Error("打つ手の変換には side が必要です");
    return { kind: "DROP", from: null, to: usiToSquare(drop[2]), pieceType: USI_TO_DROP[drop[1]], side, promoted: false, capturedPieceType: null, isCapture: false };
  }
  const mv = /^([1-9][a-i])([1-9][a-i])(\+?)$/.exec(usi);
  if (!mv) throw new Error(`不正な USI の手: ${usi}`);
  const from = usiToSquare(mv[1]);
  const piece = boardState.squares[from.file - 1][from.rank - 1];
  if (!piece) throw new Error(`移動元に駒がありません: ${usi}`);
  if (side && piece.side !== side) throw new Error(`移動元の駒が ${side} のものではありません: ${usi}`);
  return { kind: "BOARD", from, to: usiToSquare(mv[2]), pieceType: piece.type, side: piece.side, promoted: mv[3] === "+", capturedPieceType: null, isCapture: false };
}

/** 盤面に USI の手を適用する。戻り値は applyMoveToBoard と同じ { boardState, move }。 */
export function applyUsi(boardState, usi, side) {
  return applyMoveToBoard(boardState, usiToMove(usi, boardState, side));
}

/**
 * UI の BoardState → SFEN。
 * @param {object} boardState
 * @param {'SENTE'|'GOTE'} turn - 手番（UI の盤状態は手番を持たない）
 * @param {number} [moveNumber]
 */
export function boardStateToSfen(boardState, turn, moveNumber = 1) {
  const rows = [];
  for (let rank = 1; rank <= 9; rank++) {
    let row = "";
    let empty = 0;
    for (let file = 9; file >= 1; file--) {
      const p = boardState.squares[file - 1][rank - 1];
      if (!p) { empty++; continue; }
      if (empty) { row += empty; empty = 0; }
      const letter = TYPE_TO_SFEN[p.type];
      if (!letter) throw new Error(`不明な駒種: ${p.type}`);
      row += p.side === "SENTE" ? letter : letter.toLowerCase();
    }
    if (empty) row += empty;
    rows.push(row);
  }
  let hands = "";
  for (const [hand, upper] of [[boardState.handSente, true], [boardState.handGote, false]]) {
    for (const t of HAND_SFEN_ORDER) {
      const n = hand[t];
      if (!n) continue;
      const letter = TYPE_TO_SFEN[t];
      hands += (n > 1 ? n : "") + (upper ? letter : letter.toLowerCase());
    }
  }
  return `${rows.join("/")} ${turn === "SENTE" ? "b" : "w"} ${hands || "-"} ${moveNumber}`;
}
