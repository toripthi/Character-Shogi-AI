import { describe, it } from "node:test";
import { strict as assert } from "node:assert";
import { parseLine } from "../../src/book/line.js";
import { buildBook, positionKey } from "../../src/book/build.js";
import { createBook } from "../../src/book/index.js";
import { ShogiBoard } from "../../src/core/board.js";
import { createRng } from "../../src/core/rng.js";

const L = (text) => parseLine(text);
const AFTER4 = ["7g7f", "3c3d", "2g2f", "8c8d"];
function boardAfter(moves) {
  const b = new ShogiBoard();
  for (const u of moves) b.makeMoveByUSI(u);
  return b;
}

describe("実行時の lookup", () => {
  it("タグ：タグ付きは、そのタグを持つ戦法だけ。タグなしのラインは誰も使えない（D-018）", () => {
    const furi = L("# id: F\n# tags: furibisha\n# side: black\n# weight: 1\n7g7f");
    const plain = L("# id: P\n# side: black\n# weight: 1\n2g2f");
    const { data } = buildBook([furi, plain], { exitCheck: false });
    const book = createBook(data);
    const start = new ShogiBoard();
    assert.equal(book.lookup(start, { tags: [], rng: createRng(1) }), null);
    assert.equal(book.lookup(start, { tags: ["ibisha"], rng: createRng(1) }), null);
    assert.equal(book.lookup(start, { tags: ["furibisha"], rng: createRng(1) }).move.usi, "7g7f");
  });

  it("sample タグは照合で無視する（sample のみのラインはタグなし扱いで誰も引けない。sample＋戦法タグは引ける）", () => {
    const s = L("# id: S\n# tags: sample\n# side: black\n# weight: 1\n7g7f");
    const { data } = buildBook([s], { exitCheck: false });
    const book = createBook(data);
    assert.equal(book.lookup(new ShogiBoard(), { tags: [], rng: createRng(1) }), null);
    assert.equal(book.lookup(new ShogiBoard(), { tags: ["ibisha"], rng: createRng(1) }), null);
    const si = L("# id: SI\n# tags: ibisha, sample\n# side: black\n# weight: 1\n2g2f");
    const { data: data2 } = buildBook([si], { exitCheck: false });
    assert.equal(createBook(data2).lookup(new ShogiBoard(), { tags: ["ibisha"], rng: createRng(1) }).move.usi, "2g2f");
  });

  it("重み：personaWeights[personaId] があればそれ、なければ weight（比の検査）", () => {
    // 同じ候補を2本のラインで：seme は 8、その他は 3（weight 13 のうち）
    const A = L("# id: A\n# tags: ibisha\n# side: black\n# weight: 10\n# personaWeights: seme=5\n7g7f 3c3d 2g2f 8c8d 2f2e");
    const B = L("# id: B\n# tags: ibisha\n# side: black\n# weight: 3\n2g2f 8c8d 7g7f 3c3d 2f2e");
    const C = L("# id: C\n# tags: ibisha\n# side: black\n# weight: 5\n7g7f 3c3d 2g2f 8c8d 6i7h");
    const { data } = buildBook([A, B, C], { exitCheck: false });
    const book = createBook(data);
    const b = boardAfter(AFTER4);
    const rng = createRng(7);
    const N = 4000;
    let seme2f2e = 0;
    for (let i = 0; i < N; i++) {
      const r = book.lookup(b, { tags: ["ibisha"], personaId: "seme", rng });
      if (r.move.usi === "2f2e") seme2f2e++;
    }
    // seme：2f2e=8（weight 13 の personaWeights）、6i7h=5 → 8/13 ≈ 0.615
    const ratio = seme2f2e / N;
    assert.ok(Math.abs(ratio - 8 / 13) < 0.03, `seme 2f2e 比 ${ratio}`);
  });

  it("skipRate：1 なら必ず使わず null（stats.skipped）。0 なら使う", () => {
    const A = L("# id: A\n# tags: ibisha\n# side: black\n# weight: 1\n7g7f");
    const { data } = buildBook([A], { exitCheck: false });
    const book = createBook(data);
    assert.equal(book.lookup(new ShogiBoard(), { tags: ["ibisha"], rng: createRng(1), skipRate: 1 }), null);
    assert.equal(book.stats.skipped, 1);
    assert.ok(book.lookup(new ShogiBoard(), { tags: ["ibisha"], rng: createRng(1), skipRate: 0 }));
  });

  it("合法手に無い候補は無視し、数える（illegalIgnored）", () => {
    const data = { meta: {}, entries: { [positionKey(new ShogiBoard())]: [{ usi: "7g7e", weight: 1, tags: ["ibisha"], lines: ["x"], trap: null, personaWeights: {} }] } };
    const book = createBook(data);
    assert.equal(book.lookup(new ShogiBoard(), { tags: ["ibisha"], rng: createRng(1) }), null);
    assert.equal(book.stats.illegalIgnored, 1);
  });

  it("局面キーは持ち駒を含む（持ち駒が違えば別の局面）", () => {
    const b1 = new ShogiBoard();
    const b2 = new ShogiBoard("lnsgkgsnl/1r5b1/ppppppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL b P 1");
    assert.notEqual(positionKey(b1), positionKey(b2));
  });
});
