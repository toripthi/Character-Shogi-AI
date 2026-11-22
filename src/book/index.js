/**
 * 定跡の実行時（純関数。fs を使わない）。REQUIREMENTS §8.4：定跡の参照は lookup の1関数に閉じ込める。
 *   createBook(data) → { lookup(board, {tags, personaId, rng, skipRate}), stats }
 * lookup は、局面キー（盤・手番・持ち駒）が一致し、かつ合法な候補から、重みに比例して1手を選ぶ（D-015・D-018）。
 * 候補の条件：候補のタグ（sample を除く）に、tags（プレイヤーの戦型タグ）のいずれかが含まれること（D-018）。
 * タグなしの候補は誰も引けず、戦型タグを持たないプレイヤーは定跡を引けない。
 * 重み：personaWeights[personaId] があればそれ、なければ weight。
 */
import { positionKey } from "./build.js";

export function createBook(data) {
  const entries = data?.entries ?? {};
  const stats = { hits: 0, misses: 0, skipped: 0, illegalIgnored: 0 };

  function lookup(board, opts = {}) {
    const { tags = [], personaId = null, rng, skipRate = 0 } = opts;
    const list = entries[positionKey(board)];
    if (!list || list.length === 0) {
      stats.misses++;
      return null;
    }
    const mine = new Set(tags);
    const legal = board.legalMoves();
    const byUsi = new Map(legal.map((m) => [m.usi, m]));
    const usable = [];
    for (const c of list) {
      const ctags = c.tags.filter((t) => t !== "sample");
      if (!ctags.some((t) => mine.has(t))) continue;
      const move = byUsi.get(c.usi);
      if (!move) {
        stats.illegalIgnored++;
        continue;
      }
      const w = personaId && c.personaWeights && c.personaWeights[personaId] !== undefined ? c.personaWeights[personaId] : c.weight;
      if (w > 0) usable.push({ c, move, w });
    }
    if (usable.length === 0) {
      stats.misses++;
      return null;
    }
    if (skipRate > 0) {
      if (!rng) throw new Error("lookup: skipRate には rng が必要");
      if (rng() < skipRate) {
        stats.skipped++;
        return null;
      }
    }
    let chosen = usable[usable.length - 1];
    if (usable.length > 1 || rng) {
      if (!rng) throw new Error("lookup: 候補が複数あるときは rng が必要");
      const total = usable.reduce((s, u) => s + u.w, 0);
      let r = rng() * total;
      for (const u of usable) {
        if (r < u.w) {
          chosen = u;
          break;
        }
        r -= u.w;
      }
    }
    stats.hits++;
    return { move: chosen.move, entry: chosen.c, candidates: usable.length };
  }

  return { lookup, stats };
}
