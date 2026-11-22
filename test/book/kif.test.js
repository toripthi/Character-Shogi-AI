import { describe, it } from "node:test";
import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { ShogiBoard } from "../../src/core/board.js";
import { parseKif, exportKif } from "../../src/book/kif.js";

const FIX = (f) => new URL(`../fixtures/kif/${f}`, import.meta.url);
const decode = (buf) => {
  try { return new TextDecoder("utf-8", { fatal: true }).decode(buf); } catch { return new TextDecoder("shift_jis").decode(buf); }
};
const readKif = (f) => decode(readFileSync(FIX(f)));

describe("KIF の読み取り", () => {
  it("ユーザーの3本は全手が合法で、手数が一致する（26・44・44）", () => {
    for (const [f, n] of [["user-ibisha-1.kif", 26], ["user-ibisha-shiken-black.kif", 44], ["user-ibisha-shiken-white.kif", 44]]) {
      const { moves } = parseKif(readKif(f));
      assert.equal(moves.length, n, f);
      const b = new ShogiBoard();
      for (const m of moves) assert.ok(b.makeMoveByUSI(m.usi), `${f} ${m.lineNo}行目 ${m.usi}`);
    }
  });

  it("同・成・打・移動元を USI にする（user-ibisha-1 の先頭と打ち）", () => {
    const { moves, meta } = parseKif(readKif("user-ibisha-1.kif"));
    assert.deepEqual(moves.slice(0, 9).map((m) => m.usi), ["7g7f", "3c3d", "2g2f", "8c8d", "2f2e", "8d8e", "2e2d", "2c2d", "2h2d"]);
    assert.equal(moves[16].usi, "P*8g"); // 17 ８七歩打
    assert.equal(meta.id, "user-ibisha-1");
    assert.equal(meta.side, "black");
  });

  it("Shift_JIS（CP932）の KIF を読める。変化は読まず警告を出す", () => {
    const raw = readFileSync(FIX("sjis-sample.kif"));
    assert.throws(() => new TextDecoder("utf-8", { fatal: true }).decode(raw));
    const { moves, warnings } = parseKif(decode(raw));
    assert.equal(moves.length, 8);
    assert.equal(moves[5].usi, "2c2d"); // 6 ２四歩(23)
    assert.equal(moves[6].usi, "2e2d"); // 7 同　歩(25)
    assert.equal(moves[7].usi, "6a6b"); // 8 ６二金(61)（後手番）
    assert.ok(warnings.some((w) => w.includes("変化")));
  });

  it("手合割が平手以外、移動元がない、同の前の手がない、はエラー", () => {
    assert.throws(() => parseKif("手合割：香落ち\n手数----指手---------消費時間--\n   1 ７六歩(77)   ( 0:00/00:00:00)\n"), /平手/);
    assert.throws(() => parseKif("手合割：平手\n手数----指手---------消費時間--\n   1 ７六歩   ( 0:00/00:00:00)\n"), /移動元/);
    assert.throws(() => parseKif("手合割：平手\n手数----指手---------消費時間--\n   1 同　歩(77)   ( 0:00/00:00:00)\n"), /同/);
  });

  it("非合法手は読み取りでは通るが、ShogiBoard で止まる（取り込みの検証で失敗する）", () => {
    const { moves } = parseKif(readKif("illegal-sample.kif"));
    const b = new ShogiBoard();
    let bad = -1;
    for (let i = 0; i < moves.length; i++) {
      if (!b.makeMoveByUSI(moves[i].usi)) { bad = i; break; }
    }
    assert.equal(bad, 7); // 8手目（５七玉：後手玉は5a→5gに動けない）
  });

  it("書き出し → 読み直しで手順が一致する（往復）", () => {
    for (const f of ["user-ibisha-1.kif", "user-ibisha-shiken-black.kif", "sjis-sample.kif"]) {
      const usi = parseKif(readKif(f)).moves.map((m) => m.usi);
      const text = exportKif({ id: "x", tags: [], side: "black", weight: 1 }, usi);
      assert.deepEqual(parseKif(text).moves.map((m) => m.usi), usi, f);
    }
  });

  it("対戦者名（blackName / whiteName）があれば先手：／後手：の行を書き、読み直しも壊れない", () => {
    const usi = parseKif(readKif("user-ibisha-1.kif")).moves.map((m) => m.usi);
    const named = exportKif(
      { id: "x", tags: [], side: "both", weight: 1, blackName: "居飛車（バランス）", whiteName: "居飛車（攻め将棋）" },
      usi,
    );
    assert.ok(named.includes("先手：居飛車（バランス）"));
    assert.ok(named.includes("後手：居飛車（攻め将棋）"));
    assert.deepEqual(parseKif(named).moves.map((m) => m.usi), usi);
    const plain = exportKif({ id: "x", tags: [], side: "black", weight: 1 }, usi);
    assert.ok(!plain.includes("先手："));
    assert.ok(!plain.includes("後手："));
  });
});
