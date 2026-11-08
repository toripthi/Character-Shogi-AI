/**
 * やねうら王形式の定跡 .db（交換用。PATCH §2・仕様：yaneuraou.yaneu.com の定跡DB形式）。純関数。
 *  - 1行目 "#YANEURAOU-DB2016 1.00"
 *  - 局面行 "sfen <盤> <手番> <持ち駒> <手数>"、候補行 "<usi> <応手> <評価値> <深さ> <出現回数>"（評価値以降は省略可、none）
 *  - 書き出し：局面は辞書順、候補は重みの降順（同点は USI 順）。手数は 1 固定（手数を無視する運用）
 *  - 読み取り：候補の探索深さは読み捨てる（特殊値が入ることがある）。評価値は --eval-window にだけ使う
 */
import { normalizeHand } from "./flip.js";

export const DB_HEADER = "#YANEURAOU-DB2016 1.00";

/** 局面キー（盤・手番・持ち駒）を .db の sfen 行にする。手数は 1。 */
function sfenLine(key) {
  const [board, turn, hand] = key.split(" ");
  return `sfen ${board} ${turn} ${normalizeHand(hand)} 1`;
}

/**
 * book.json の形（{ entries: { key: [{usi, weight, ...}] } }）から .db のテキストを作る。
 * @returns {{ text: string, dropped: {tags: number, trap: number, personaWeights: number, lines: number} }}
 */
export function formatDb(data) {
  const dropped = { tags: 0, trap: 0, personaWeights: 0, lines: 0 };
  const out = [DB_HEADER];
  for (const key of Object.keys(data.entries).sort()) {
    const cands = data.entries[key].map((c) => {
      if (c.tags?.length) dropped.tags++;
      if (c.trap) dropped.trap++;
      if (c.personaWeights && Object.keys(c.personaWeights).length) dropped.personaWeights++;
      if (c.lines?.length) dropped.lines++;
      return { usi: c.usi, weight: Math.max(1, Math.round(c.weight)) };
    });
    cands.sort((a, b) => b.weight - a.weight || (a.usi < b.usi ? -1 : a.usi > b.usi ? 1 : 0));
    out.push(sfenLine(key));
    for (const c of cands) out.push(`${c.usi} none none none ${c.weight}`);
  }
  return { text: out.join("\n") + "\n", dropped };
}

/**
 * .db を読む。候補は { usi, count, eval, lineNo }。局面キーは sfen の先頭3フィールド（手数は捨てる）。
 * 局面の前に候補が来た場合はエラー。ヘッダ無しもエラー。
 * @returns {{ positions: {key: string, ply: number, cands: object[]}[], warnings: string[] }}
 */
export function parseDb(text) {
  const lines = text.split(/\r?\n/);
  const warnings = [];
  if (!lines[0] || !lines[0].startsWith("#YANEURAOU-DB2016")) throw new Error(".db のヘッダ（#YANEURAOU-DB2016）がない");
  const positions = [];
  let cur = null;
  lines.forEach((raw, i) => {
    const lineNo = i + 1;
    const line = raw.replace(/\/\/.*$/, "").trim();
    if (line === "" || line.startsWith("#")) return;
    if (line.startsWith("sfen ")) {
      const parts = line.split(/\s+/);
      if (parts.length < 4) throw new Error(`.db ${lineNo}行目: sfen の形式`);
      const key = `${parts[1]} ${parts[2]} ${normalizeHand(parts[3])}`;
      const ply = parts.length >= 5 ? Number(parts[4]) : 1;
      cur = { key, ply, cands: [], lineNo };
      positions.push(cur);
      return;
    }
    if (!cur) throw new Error(`.db ${lineNo}行目: 局面の前に候補がある`);
    const tok = line.split(/\s+/);
    const usi = tok[0];
    if (!/^([1-9][a-i][1-9][a-i]\+?|[PLNSGBR]\*[1-9][a-i])$/.test(usi)) {
      warnings.push(`.db ${lineNo}行目: 指し手として読めない（${usi}）`);
      return;
    }
    const evalNum = tok.length >= 3 && tok[2] !== "none" && /^-?\d+$/.test(tok[2]) ? Number(tok[2]) : null;
    const countNum = tok.length >= 5 && /^\d+$/.test(tok[4]) ? Number(tok[4]) : null;
    cur.cands.push({ usi, eval: evalNum, count: countNum, lineNo });
  });
  return { positions, warnings };
}
