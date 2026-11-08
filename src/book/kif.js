/**
 * KIF（棋譜ソフトの形式）の読み取りと書き出し。純関数（fs を使わない。文字コードは呼び出し側）。
 * 仕様の取り決めは docs/BOOK-KIF-GUIDE.md（正）と指示書 4-1「KIFからの取り込み」。
 */
import { ShogiBoard } from "../core/board.js";

const KANJI_RANK = ["", "一", "二", "三", "四", "五", "六", "七", "八", "九"];
const RANK_LETTER = ["", "a", "b", "c", "d", "e", "f", "g", "h", "i"];
const FULL_DIGIT = { "０": 0, "１": 1, "２": 2, "３": 3, "４": 4, "５": 5, "６": 6, "７": 7, "８": 8, "９": 9 };
const DROP_LETTER = { 歩: "P", 香: "L", 桂: "N", 銀: "S", 金: "G", 角: "B", 飛: "R" };
// tsshogi の駒の種類 → KIF の表記
const KIF_PIECE = {
  pawn: "歩", lance: "香", knight: "桂", silver: "銀", gold: "金", bishop: "角", rook: "飛", king: "玉",
  promPawn: "と", promLance: "成香", promKnight: "成桂", promSilver: "成銀", horse: "馬", dragon: "龍",
};
const BASE_OF = { pawn: "歩", lance: "香", knight: "桂", silver: "銀", gold: "金", bishop: "角", rook: "飛" };
const DROP_TYPE = { P: "pawn", L: "lance", N: "knight", S: "silver", G: "gold", B: "bishop", R: "rook" };
const TERMINAL = /^(投了|中断|詰み|千日手|持将棋|反則|切れ負け|入玉宣言|時間切れ|不戦勝|不戦敗)/;

function toDigit(ch) {
  if (ch in FULL_DIGIT) return FULL_DIGIT[ch];
  const n = Number(ch);
  return Number.isInteger(n) && n >= 1 && n <= 9 ? n : null;
}

/**
 * KIF の本譜を読む（手合割「平手」のみ）。
 * @returns {{ meta: Record<string,string>, moves: {usi: string, lineNo: number}[], warnings: string[] }}
 */
export function parseKif(text) {
  const meta = {};
  const warnings = [];
  const moves = [];
  const lines = text.split(/\r?\n/);
  let inMoves = false;
  let prevTo = null;
  let seenHandicap = false;
  for (let i = 0; i < lines.length; i++) {
    const lineNo = i + 1;
    const raw = lines[i];
    const line = raw.trim();
    if (line === "") continue;
    if (line.startsWith("#")) {
      const m = /^#\s*([A-Za-z]+)\s*[:：]\s*(.*)$/.exec(line);
      if (m) meta[m[1]] = m[2].trim();
      continue;
    }
    if (line.startsWith("手合割")) {
      const v = line.replace(/^手合割\s*[:：]\s*/, "").trim();
      if (v !== "平手") throw new Error(`KIF ${lineNo}行目: 手合割が「平手」以外（${v}）`);
      seenHandicap = true;
      continue;
    }
    if (line.startsWith("変化")) {
      warnings.push(`変化が ${lineNo} 行目から始まる。変化は読まない`);
      break;
    }
    if (line.startsWith("*")) continue;
    if (line.startsWith("手数")) {
      inMoves = true;
      continue;
    }
    if (!inMoves) continue;
    const m = /^(\d+)\s+(.*)$/.exec(line);
    if (!m) continue;
    const body = m[2].replace(/\s+/g, "");
    if (TERMINAL.test(body)) break;
    const parsed = parseMoveText(body, prevTo, lineNo);
    prevTo = parsed.to;
    moves.push({ usi: parsed.usi, lineNo });
  }
  if (!seenHandicap) throw new Error("KIF: 手合割がない（平手のみ読む）");
  return { meta, moves, warnings };
}

/** 1手分の表記（空白なし）を USI にする。同 は前の手の着手先。 */
export function parseMoveText(body, prevTo, lineNo) {
  let rest;
  let to;
  if (body.startsWith("同")) {
    if (!prevTo) throw new Error(`KIF ${lineNo}行目: 「同」の前の手がない`);
    to = prevTo;
    rest = body.slice(1);
  } else {
    const f = toDigit(body[0]);
    const r = KANJI_RANK.indexOf(body[1]);
    if (f === null || r < 1) throw new Error(`KIF ${lineNo}行目: 着手先を読めない（${body}）`);
    to = `${f}${RANK_LETTER[r]}`;
    rest = body.slice(2);
  }
  const paren = rest.indexOf("(");
  const pre = paren >= 0 ? rest.slice(0, paren) : rest;
  if (pre.includes("打")) {
    const piece = pre[0];
    const letter = DROP_LETTER[piece];
    if (!letter) throw new Error(`KIF ${lineNo}行目: 打てない駒（${piece}）`);
    return { usi: `${letter}*${to}`, to };
  }
  if (paren < 0) throw new Error(`KIF ${lineNo}行目: 移動元の (xy) がない（${body}）`);
  const om = /^\((\d)(\d)\)/.exec(rest.slice(paren));
  if (!om) throw new Error(`KIF ${lineNo}行目: 移動元の形式（${body}）`);
  const fromFile = Number(om[1]);
  const fromRank = Number(om[2]);
  if (fromFile < 1 || fromRank < 1 || fromRank > 9) throw new Error(`KIF ${lineNo}行目: 移動元が盤外（${body}）`);
  const promote = pre.endsWith("成") && !pre.includes("不成");
  const from = `${fromFile}${RANK_LETTER[fromRank]}`;
  return { usi: `${from}${to}${promote ? "+" : ""}`, to };
}

/**
 * USI の手順を KIF の本文にする（盤を進めて駒名を得る）。非合法手があればエラー。
 * @param {string[]} usiMoves
 * @param {string} [startSfen]  既定は平手の初期局面
 */
export function usiToKifMoves(usiMoves, startSfen) {
  const board = startSfen ? new ShogiBoard(startSfen) : new ShogiBoard();
  const out = [];
  let prevTo = null;
  usiMoves.forEach((usi, idx) => {
    const isDrop = usi[1] === "*";
    const to = usi.slice(2, 4);
    const promote = usi.endsWith("+");
    let name;
    if (isDrop) {
      name = BASE_OF[DROP_TYPE[usi[0]]];
    } else {
      const from = usi.slice(0, 2);
      const piece = board.pieceAt(from);
      if (!piece) throw new Error(`手 ${idx + 1}（${usi}）: 移動元に駒がない`);
      name = KIF_PIECE[piece.type];
    }
    const dest = `${toKifFile(to[0])}${KANJI_RANK[RANK_LETTER.indexOf(to[1])]}`;
    const isSame = prevTo === to;
    const head = isSame ? "同　" : dest;
    let body = `${head}${name}`;
    if (promote) body += "成";
    if (isDrop) {
      body += "打";
    } else {
      body += `(${usi[0]}${RANK_LETTER.indexOf(usi[1])})`;
    }
    out.push(body);
    if (!board.makeMoveByUSI(usi)) throw new Error(`手 ${idx + 1}（${usi}）: 非合法手`);
    prevTo = to;
  });
  return out;
}

function toKifFile(ch) {
  const n = Number(ch);
  return String.fromCharCode("０".charCodeAt(0) + n);
}

/**
 * ライン（meta と USI）を KIF のテキストにする（UTF-8、手合割：平手、# のメタ行付き）。
 */
export function exportKif(meta, usiMoves) {
  const head = [];
  head.push(`# id: ${meta.id}`);
  head.push(`# tags: ${(meta.tags ?? []).join(", ")}`);
  head.push(`# side: ${meta.side}`);
  head.push(`# weight: ${meta.weight ?? 1}`);
  if (meta.personaWeights && Object.keys(meta.personaWeights).length > 0) {
    const pw = Object.keys(meta.personaWeights).sort().map((k) => `${k}=${meta.personaWeights[k]}`).join(", ");
    head.push(`# personaWeights: ${pw}`);
  }
  if (meta.trap) head.push(`# trap: ${meta.trap}`);
  if (meta.trigger !== undefined) head.push(`# trigger: ${meta.trigger}`);
  const body = [];
  body.push("手合割：平手");
  body.push("手数----指手---------消費時間--");
  usiToKifMoves(usiMoves).forEach((mv, i) => {
    body.push(`${String(i + 1).padStart(4)} ${mv}   ( 0:00/00:00:00)`);
  });
  return [...head, ...body].join("\n") + "\n";
}
