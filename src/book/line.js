/**
 * 定跡のライン形式（data/book/lines/*.txt）の読み書き。純関数（fs を使わない）。
 * 形式（指示書 4-1「データ」）：
 *   # id: sample-furi-1
 *   # tags: furibisha      （カンマ区切り。空可）
 *   # side: black          （black / white / both。必須）
 *   # weight: 10           （既定 1）
 *   # personaWeights: seme=5, mamori=1   （任意）
 *   # trap: ...            （任意）
 *   # trigger: 7           （任意。PATCH §3）
 *   # source: user.kif     （KIF 取り込みで付く。任意）
 *   7g7f 8c8d ...          （USI。空白区切り、複数行可。# 行は注釈）
 */

const SIDES = ["black", "white", "both"];

/** @returns {{ meta: object, moves: string[] }} */
export function parseLine(text) {
  const meta = {};
  const moves = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (line === "") continue;
    if (line.startsWith("#")) {
      const m = /^#\s*([A-Za-z]+)\s*[:：]\s*(.*)$/.exec(line);
      if (m) meta[m[1]] = m[2].trim();
      continue;
    }
    for (const tok of line.split(/\s+/)) moves.push(tok);
  }
  return { meta: normalizeMeta(meta), moves };
}

/** 生のメタ（文字列）を型つきの値にする。不正な値はエラー。 */
export function normalizeMeta(raw) {
  const id = raw.id;
  if (!id) throw new Error("line: id が必要");
  if (!/^[A-Za-z0-9_.\-]+$/.test(id)) throw new Error(`line ${id}: id に使えない文字`);
  const side = raw.side;
  if (!SIDES.includes(side)) throw new Error(`line ${id}: side は black / white / both のどれか（今: ${side ?? "なし"}）`);
  const weight = raw.weight === undefined ? 1 : Number(raw.weight);
  if (!Number.isInteger(weight) || weight < 1) throw new Error(`line ${id}: weight は1以上の整数`);
  const tags = (raw.tags ?? "").split(",").map((t) => t.trim()).filter(Boolean);
  const personaWeights = raw.personaWeights ? parsePersonaWeights(raw.personaWeights, id) : null;
  const out = { id, tags, side, weight, personaWeights };
  if (raw.trap) out.trap = raw.trap;
  if (raw.trigger !== undefined) out.trigger = Number(raw.trigger);
  if (raw.source) out.source = raw.source;
  return out;
}

function parsePersonaWeights(s, id) {
  const out = {};
  for (const part of s.split(",")) {
    const p = part.trim();
    if (!p) continue;
    const m = /^([A-Za-z]+)\s*=\s*(\d+)$/.exec(p);
    if (!m) throw new Error(`line ${id}: personaWeights の書式（id=数値）: ${p}`);
    out[m[1]] = Number(m[2]);
  }
  return out;
}

/** ライン1本をテキストにする（メタの順は固定。入力が同じなら出力はバイト単位で同じ）。 */
export function formatLine(meta, moves) {
  const lines = [];
  lines.push(`# id: ${meta.id}`);
  if (meta.source) lines.push(`# source: ${meta.source}`);
  lines.push(`# tags: ${(meta.tags ?? []).join(", ")}`);
  lines.push(`# side: ${meta.side}`);
  lines.push(`# weight: ${meta.weight ?? 1}`);
  if (meta.personaWeights && Object.keys(meta.personaWeights).length > 0) {
    const pw = Object.keys(meta.personaWeights).sort().map((k) => `${k}=${meta.personaWeights[k]}`).join(", ");
    lines.push(`# personaWeights: ${pw}`);
  }
  if (meta.trap) lines.push(`# trap: ${meta.trap}`);
  if (meta.trigger !== undefined) lines.push(`# trigger: ${meta.trigger}`);
  // 手は1行に最大16手。
  for (let i = 0; i < moves.length; i += 16) lines.push(moves.slice(i, i + 16).join(" "));
  return lines.join("\n") + "\n";
}
