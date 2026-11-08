/**
 * 盤を180度回す（先手番の局面を後手番の局面にする。PATCH §2.4 --flip）。純関数。
 * 筋 f → 10 - f、段 r → 10 - r、駒の色を反転、持ち駒の色を入れ替え、手番を反転。
 * 打つ手は駒の種類そのまま、升だけ反転する。成りの「+」は保つ。
 */
const HAND_ORDER = ["R", "B", "G", "S", "N", "L", "P"];

export function flipSquare(sq) {
  const f = Number(sq[0]);
  const r = "abcdefghi".indexOf(sq[1]) + 1;
  return `${10 - f}${"abcdefghi"[10 - r - 1]}`;
}

export function flipUsi(usi) {
  if (usi[1] === "*") {
    return `${usi[0]}*${flipSquare(usi.slice(2, 4))}${usi.slice(4)}`;
  }
  return `${flipSquare(usi.slice(0, 2))}${flipSquare(usi.slice(2, 4))}${usi.slice(4)}`;
}

function flipPieceChar(ch) {
  return ch === ch.toUpperCase() ? ch.toLowerCase() : ch.toUpperCase();
}

/** 持ち駒を標準の順（先手の大文字 R B G S N L P、後手の小文字）に並べる。 */
export function normalizeHand(hand) {
  if (!hand || hand === "-") return "-";
  const counts = new Map();
  let num = "";
  for (const ch of hand) {
    if (/\d/.test(ch)) {
      num += ch;
      continue;
    }
    const n = num === "" ? 1 : Number(num);
    counts.set(ch, (counts.get(ch) ?? 0) + n);
    num = "";
  }
  const out = [];
  for (const color of [true, false]) {
    for (const p of HAND_ORDER) {
      const ch = color ? p : p.toLowerCase();
      const n = counts.get(ch);
      if (n) out.push(n > 1 ? `${n}${ch}` : ch);
    }
  }
  return out.length ? out.join("") : "-";
}

/** SFEN（盤面・手番・持ち駒[・手数]）を180度回す。 */
export function flipSfen(sfen) {
  const parts = sfen.trim().split(/\s+/);
  const [board, turn, hand, ...rest] = parts;
  // 段の順を反転し、各段の升の順（筋）も反転する。升は「駒1つ」か「空きの数」の単位で扱う。
  const rows = board.split("/").reverse().map((row) => {
    const cells = row.match(/\+[A-Za-z]|[A-Za-z]|\d/g) ?? [];
    return cells
      .reverse()
      .map((c) => (/\d/.test(c) ? c : c.startsWith("+") ? `+${flipPieceChar(c[1])}` : flipPieceChar(c)))
      .join("");
  });
  const flippedBoard = rows.join("/");
  const flippedTurn = turn === "b" ? "w" : "b";
  const flippedHand = normalizeHand(
    (hand ?? "-") === "-" ? "-" : [...(hand ?? "")].map((c) => (/\d/.test(c) ? c : flipPieceChar(c))).join(""),
  );
  return [flippedBoard, flippedTurn, flippedHand, ...rest].join(" ");
}
