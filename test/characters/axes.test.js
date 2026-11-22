import { describe, it } from "node:test";
import { strict as assert } from "node:assert";
import { ShogiBoard } from "../../src/core/board.js";
import { createPlayer } from "../../src/player.js";
import {
  OPENING_AXIS, TEMPERAMENT_AXIS, listAxisPersonas, personaSpecFromAxes, axisPersonaId, parseAxisPersonaId, resolvePersona, PERSONAS,
} from "../../src/characters/index.js";

describe("棋風の2軸（戦型×気質）：選択肢は3×3、実在するペルソナは6つ", () => {
  it("戦型は居飛車・振り飛車・ランダム、気質はバランス・攻め・守り。ペルソナの一覧は居飛車・振り飛車の6つだけ", () => {
    assert.deepEqual(OPENING_AXIS.map((a) => a.id), ["ibisha", "furi", "random"]);
    assert.deepEqual(TEMPERAMENT_AXIS.map((a) => a.id), ["balance", "seme", "uke"]);
    const all = listAxisPersonas();
    assert.equal(all.length, 6);
    assert.deepEqual(
      new Set(all.map((p) => p.id)),
      new Set(["ibisha-balance", "ibisha-seme", "ibisha-uke", "furi-balance", "furi-seme", "furi-uke"]),
    );
    for (const p of all) {
      const r = resolvePersona(p.id); // 文字列 id のまま解決できる
      assert.equal(r.id, p.id);
      assert.equal(r.openings, null, `${p.id} は抽選しない`);
      // 戦法の特性は必ず1つ、気質の特性は 0 または 1 つ
      const opening = OPENING_AXIS.find((o) => o.id === p.opening);
      assert.ok(opening.traits.every((t) => r.traits.includes(t)));
    }
  });

  it("選択肢としては3×3のどれも選べる。ランダムの組み合わせはペルソナではなく振り分けの指定になる", () => {
    for (const o of OPENING_AXIS) {
      for (const t of TEMPERAMENT_AXIS) {
        const id = axisPersonaId(o.id, t.id);
        const r = resolvePersona(id); // 選択の id のまま解決できる
        assert.equal(r.id, id);
        assert.equal(!!r.openings, o.id === "random", `${id}：ランダムのときだけ戦法を振り分ける`);
        assert.ok(o.traits.every((x) => r.traits.includes(x)), id);
      }
    }
  });

  it("既存のペルソナ（ibisha-seme・furi-uke）と同じ中身で、手順テンプレートも引き継ぐ", () => {
    assert.equal(personaSpecFromAxes("ibisha", "seme"), PERSONAS["ibisha-seme"]);
    assert.equal(personaSpecFromAxes("furi", "uke"), PERSONAS["furi-uke"]);
    assert.equal(resolvePersona("furi-uke").plan, "furi-shiken-mino");
    // 2026-11-10 §1：振り飛車なら全ペルソナに紐づく（特性から。axes.js の組み立てにも自動で付く）
    assert.equal(resolvePersona("furi-seme").plan, "furi-shiken-mino");
    assert.equal(resolvePersona("furi-balance").plan, "furi-shiken-mino");
    // 2026-11-21：居飛車も全ペルソナに ibisha-basic が紐づく（特性から）
    assert.equal(resolvePersona("ibisha-seme").plan, "ibisha-basic");
    assert.equal(resolvePersona("ibisha-balance").plan, "ibisha-basic");
    assert.equal(resolvePersona("ibisha-uke").plan, "ibisha-basic");
    // 戦型を持たないペルソナには付かない
    assert.equal(resolvePersona("balance").plan, null);
    // ランダム：全体の plan は null（戦型が決まる前）。振り分けの候補ごとに、確定した戦型のものを持つ
    for (const t of ["balance", "seme", "uke"]) {
      const r = resolvePersona(`random-${t}`);
      assert.equal(r.plan, null);
      assert.equal(r.openings.variants.ibisha.plan, "ibisha-basic");
      assert.equal(r.openings.variants.furibisha.plan, "furi-shiken-mino");
    }
  });

  it("軸の id の解釈：不正な組み合わせ・未知の id は弾く", () => {
    assert.deepEqual(parseAxisPersonaId("random-uke"), { opening: "random", temperament: "uke" });
    assert.equal(parseAxisPersonaId("balance"), null);
    assert.equal(parseAxisPersonaId("ibisha-ibisha"), null);
    assert.throws(() => personaSpecFromAxes("ibisha", "x"), /棋風/);
    assert.throws(() => personaSpecFromAxes("x", "seme"), /戦型/);
    assert.throws(() => resolvePersona("random-nothing"), /未知のペルソナ/);
  });

  it("気質で評価の重みが変わり、戦法で囲い・飛車の位置の項が変わる", () => {
    const w = (id) => resolvePersona(id).style.weights;
    assert.equal(w("ibisha-balance").advance, w("furi-balance").advance);
    assert.ok((w("ibisha-seme").advance ?? 0) > (w("ibisha-balance").advance ?? 0), "攻めは前進を好む");
    assert.ok((w("ibisha-uke").rookDanger ?? 0) > (w("ibisha-balance").rookDanger ?? 0), "守りは飛車の危険を重く見る");
    assert.ok((w("ibisha-balance").castleIbisha ?? 0) > 0 && !(w("ibisha-balance").castleFuri > 0));
    assert.ok((w("furi-balance").castleFuri ?? 0) > 0 && !(w("furi-balance").castleIbisha > 0));
  });

  it("6ペルソナとランダム3通りとも、先手・後手の両方で最初の1手を指せる（ランダムは戦法を振り分ける）", () => {
    const choices = [
      ...listAxisPersonas(),
      ...TEMPERAMENT_AXIS.map((t) => ({ id: axisPersonaId("random", t.id), opening: "random", temperament: t.id })),
    ];
    assert.equal(choices.length, 9);
    for (const p of choices) {
      const pl = createPlayer({ persona: p.id, seed: 3, search: { depth: 1 } });
      const b = new ShogiBoard();
      const r1 = pl.chooseMove(b);
      assert.ok(r1.move, p.id);
      b.makeMove(r1.move);
      const r2 = pl.chooseMove(b);
      assert.ok(r2.move, p.id);
      if (p.opening === "random") {
        assert.ok(["ibisha", "furibisha"].includes(pl.opening("black")));
        assert.ok(["ibisha", "furibisha"].includes(pl.opening("white")));
      }
    }
  });
});
