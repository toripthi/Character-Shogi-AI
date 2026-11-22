/**
 * 4-2：戦法の特性（ibisha・furibisha）とペルソナ（ibisha-seme・furi-uke）。
 * - 特性は group "opening" で排他。
 * - bookTags は resolvePersona の戻り値に和集合で付く（composeStyle の戻り値は変えない）。
 */
import { describe, it } from "node:test";
import { strict as assert } from "node:assert";
import { TRAITS, PERSONAS, resolvePersona, composeStyle } from "../../src/characters/index.js";
import { assertKnownTerms } from "../../src/eval/index.js";

describe("戦法の特性（4-2）", () => {
  it("ibisha：囲い（castleIbisha）と飛車（rookHome）に重み、bookTags は ibisha", () => {
    assert.equal(TRAITS.ibisha.group, "opening");
    assert.deepEqual(TRAITS.ibisha.weights, { castleIbisha: 30, rookHome: 100 });
    assert.deepEqual(TRAITS.ibisha.bookTags, ["ibisha"]);
  });

  it("furibisha：囲い（castleFuri）と飛車（rookSwung）に重み、bookTags は furibisha", () => {
    assert.equal(TRAITS.furibisha.group, "opening");
    assert.deepEqual(TRAITS.furibisha.weights, { castleFuri: 30, rookSwung: 100 });
    assert.deepEqual(TRAITS.furibisha.bookTags, ["furibisha"]);
  });

  it("特性の weights はすべて登録済みの評価項だけ", () => {
    for (const id of ["ibisha", "furibisha"]) assert.doesNotThrow(() => assertKnownTerms(TRAITS[id].weights, id));
  });

  it("ibisha と furibisha は同時に選べない（排他：group opening）", () => {
    assert.throws(() => resolvePersona({ traits: ["ibisha", "furibisha"] }), /同時に選べない/);
  });
});

describe("ペルソナと bookTags（4-2）", () => {
  it("ibisha-seme：攻め将棋気質＋居飛車党。bookTags は ibisha", () => {
    const p = resolvePersona("ibisha-seme");
    assert.deepEqual(p.traits, ["seme", "ibisha"]);
    assert.deepEqual(p.bookTags, ["ibisha"]);
    assert.equal(p.style.weights.castleIbisha, 30);
    assert.equal(p.style.weights.retreat, 20, "攻め将棋の重みを引き継ぐ");
  });

  it("furi-uke：受け将棋気質＋振り飛車党。bookTags は furibisha", () => {
    const p = resolvePersona("furi-uke");
    assert.deepEqual(p.traits, ["uke", "furibisha"]);
    assert.deepEqual(p.bookTags, ["furibisha"]);
    assert.equal(p.style.weights.rookSwung, 100);
    assert.equal(p.style.weights.rookDanger, 150, "受け将棋の重みを引き継ぐ");
  });

  it("既存のペルソナの bookTags は空（既存の挙動は変わらない）", () => {
    for (const id of ["balance", "seme", "uke"]) assert.deepEqual(resolvePersona(id).bookTags, []);
  });

  it("ペルソナの登録簿に新しい2つが載る", () => {
    assert.ok(PERSONAS["ibisha-seme"]);
    assert.ok(PERSONAS["furi-uke"]);
  });

  it("composeStyle の戻り値は bookTags を持たない（変えない）", () => {
    assert.equal("bookTags" in composeStyle({ traits: ["ibisha"] }), false);
  });
});
