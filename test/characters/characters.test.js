import { describe, it } from "node:test";
import { strict as assert } from "node:assert";
import {
  TRAITS,
  PERSONAS,
  composeStyle,
  listTraits,
  listPersonas,
  resolvePersona,
} from "../../src/characters/index.js";
import { assertKnownTerms, evaluate } from "../../src/eval/index.js";
import { ShogiBoard } from "../../src/core/board.js";

// 排他・加算のテスト用の特性表（実データには居飛車/振り飛車はまだ無い）
const FIXTURE_TRAITS = {
  ibisha: { id: "ibisha", group: "opening", weights: { advance: 1 } },
  furibisha: { id: "furibisha", group: "opening", weights: { advance: 2 } },
  seme: { id: "seme", group: "temperament", weights: { advance: 10, attack: 5 } },
  extra: { id: "extra", weights: { advance: 100, material: -0.5 } },
};

describe("characters: 特性の合成", () => {
  it("特性なしは既定値（駒得のみ）", () => {
    const style = composeStyle({});
    assert.equal(style.weights.material, 1);
    assert.equal(style.weights.advance, 0);
  });

  it("特性の重みは既定値に加算される", () => {
    const style = composeStyle({ traits: ["seme", "extra"] }, FIXTURE_TRAITS);
    assert.equal(style.weights.advance, 110);
    assert.equal(style.weights.attack, 25); // 既定 20 ＋ 特性 5
    assert.equal(style.weights.material, 0.5); // 既定1 + (-0.5)
  });

  it("spec.weights は特性を足した後に上書きする", () => {
    const style = composeStyle({ traits: ["seme"], weights: { advance: 3 } }, FIXTURE_TRAITS);
    assert.equal(style.weights.advance, 3);
    assert.equal(style.weights.attack, 25); // 既定 20 ＋ 特性 5
  });

  it("別 group の特性は組み合わせられる（攻め × 居飛車）", () => {
    const style = composeStyle({ traits: ["seme", "ibisha"] }, FIXTURE_TRAITS);
    assert.equal(style.weights.advance, 11);
  });

  it("同じ group の特性は同時に選べない（居飛車 × 振り飛車）", () => {
    assert.throws(
      () => composeStyle({ traits: ["ibisha", "furibisha"] }, FIXTURE_TRAITS),
      /同時に選べない/,
    );
  });

  it("未知の特性・重複・未知の評価項はエラー", () => {
    assert.throws(() => composeStyle({ traits: ["nothing"] }), /未知の特性/);
    assert.throws(() => composeStyle({ traits: ["extra", "extra"] }, FIXTURE_TRAITS), /重複/);
    assert.throws(() => composeStyle({ weights: { typo: 1 } }), /未知の評価項/);
    assert.throws(
      () => composeStyle({ traits: ["bad"] }, { bad: { id: "bad", weights: { typo: 1 } } }),
      /未知の評価項/,
    );
  });
});

describe("characters: 実データの整合", () => {
  it("すべての特性の weights が登録済みの評価項だけを使っている", () => {
    for (const trait of Object.values(TRAITS)) {
      assert.doesNotThrow(() => assertKnownTerms(trait.weights, trait.id), trait.id);
    }
  });

  it("すべてのペルソナが解決でき、参照する特性が実在する", () => {
    for (const id of Object.keys(PERSONAS)) {
      const p = resolvePersona(id);
      assert.equal(p.id, id);
      for (const t of p.traits) {
        assert.ok(TRAITS[t], `${id} が参照する特性 ${t}`);
      }
    }
  });

  it("ペルソナの重みは旧実装と同じ（回帰）", () => {
    const w = (id) => resolvePersona(id).style.weights;
    // 4-2 で囲い・飛車の項を足したので、旧い項の重みは従来どおり、新しい項は 0 で確かめる
    const old = { ...w("seme") };
    const newTerms = ["castleFuri", "castleIbisha", "rookSwung", "rookHome"];
    for (const t of newTerms) {
      assert.equal(old[t], 0, `新しい項 ${t} は既定で 0`);
      delete old[t];
    }
    // 2026-11-10 §4：玉の位置の3項は全キャラの既定で有効（重みは自己対局の測定で決めた）
    assert.deepEqual([old.kingHome, old.kingAdvance, old.kingGuard], [40, 80, 15]);
    for (const t of ["kingHome", "kingAdvance", "kingGuard"]) delete old[t];
    assert.deepEqual(old, {
      material: 1,
      advance: 1,
      control: 15,
      attack: 30, // 既定 20（バランス）＋ 攻め +10
      rookFile: 20,
      rookDanger: 0,
      horseGuard: 0,
      retreat: 20,
      capture: 0.1, // 取る手への加点（2026-11-09 §7）
    });
    assert.equal(w("balance").attack, 20);
    assert.equal(w("uke").attack, 10);
    assert.equal(w("balance").capture, 0);
    assert.equal(w("uke").capture, -0.05);
    assert.equal(w("uke").rookDanger, 150);
    assert.equal(w("uke").horseGuard, 60);
    assert.equal(w("balance").advance, 0);
  });

  it("その場で作った組み合わせも解決できる（UIのドロップダウン想定）", () => {
    const p = resolvePersona({ traits: ["uke"], weights: { rookDanger: 200 } });
    assert.equal(p.id, "custom");
    assert.equal(p.style.weights.rookDanger, 200);
    assert.equal(p.style.weights.horseGuard, 60);
  });

  it("未知のペルソナidはエラー", () => {
    assert.throws(() => resolvePersona("nothing"), /未知のペルソナ/);
  });

  it("UI用の一覧が引ける", () => {
    assert.deepEqual(
      listTraits().map((t) => [t.id, t.group]),
      [
        ["seme", "temperament"],
        ["uke", "temperament"],
        ["ibisha", "opening"],
        ["furibisha", "opening"],
        ["random", "opening"], // D-029 (e)：戦型の振り分け（人格ではない）。並びは 居飛車党／振り飛車党／ランダム
      ],
    );
    // 4-2 で居飛車・振り飛車の特性と、その組み合わせのペルソナを足した。
    // baseline は測定用の素のペルソナ（D-011。棋風ではなく、UI の選択肢には出ない）
    assert.deepEqual(
      listPersonas().map((p) => p.id),
      ["balance", "seme", "uke", "ibisha-seme", "furi-uke", "baseline"],
    );
  });

  it("baseline の評価は駒得のみ（material 以外の重みは全て 0。D-011）", () => {
    const { weights } = resolvePersona("baseline").style;
    assert.equal(weights.material, 1);
    for (const [term, w] of Object.entries(weights)) {
      if (term !== "material") assert.equal(w, 0, `${term} は 0 のはず`);
    }
    // 実際に評価しても、内訳に出るのは material だけ（先手が歩1枚持ち＝100×1.25）
    const board = new ShogiBoard("lnsgkgsnl/1r5b1/ppppppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL b P 1");
    const r = evaluate(board, resolvePersona("baseline").style);
    assert.equal(r.score, 125);
    assert.deepEqual(
      Object.entries(r.breakdown).filter(([, v]) => v !== 0).map(([k]) => k),
      ["material"],
    );
  });
});
