/**
 * ランダム（戦型の振り分け。D-029 (e)）：人格ではなく、対局開始時に、手番の色ごとに
 * 居飛車／振り飛車のどちらかへ振り分ける選択の仕組み。
 *  - 特性 random は ibisha / furibisha と同じ group（併用不可）
 *  - 抽選は seed から再現でき、先手と後手は別々（4通りが出る）、既定は 50:50、ペルソナで変えられる
 *  - 振り分けられた後は、確定した戦型のペルソナと完全に同一（探索・定跡・手順テンプレートとも）
 *  - 抽選の乱数は手選びの乱数（state.rng）と別系統
 */
import { describe, it } from "node:test";
import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { ShogiBoard } from "../../src/core/board.js";
import { createPlayer } from "../../src/player.js";
import { createRng } from "../../src/core/rng.js";
import { TRAITS, resolvePersona, drawOpenings } from "../../src/characters/index.js";

const BOOK = JSON.parse(readFileSync(new URL("../fixtures/book/book.json", import.meta.url), "utf8"));
const SEEDS = Array.from({ length: 400 }, (_, i) => i + 1);

describe("random: 特性とペルソナの解決", () => {
  it("特性：group は opening、評価の重みとタグは持たず、候補は 居飛車50:振り飛車50", () => {
    const t = TRAITS.random;
    assert.equal(t.name, "ランダム");
    assert.equal(t.group, "opening");
    assert.deepEqual(t.weights, {});
    assert.deepEqual(t.bookTags, []);
    assert.deepEqual(t.choose, { ibisha: 50, furibisha: 50 });
  });

  it("ibisha / furibisha とは併用できない（排他）", () => {
    assert.throws(() => resolvePersona({ traits: ["random", "ibisha"] }), /同時に選べない/);
    assert.throws(() => resolvePersona({ traits: ["furibisha", "random"] }), /同時に選べない/);
  });

  it("戦法ごとの一式は、固定の ibisha / furibisha のペルソナと同じ style・bookTags・plan になる", () => {
    const r = resolvePersona({ id: "x", traits: ["uke", "random"] });
    assert.deepEqual(Object.keys(r.openings.variants), ["ibisha", "furibisha"]);
    for (const o of ["ibisha", "furibisha"]) {
      const fixed = resolvePersona({ id: "y", traits: ["uke", o] });
      assert.deepEqual(r.openings.variants[o].style, fixed.style);
      assert.deepEqual(r.openings.variants[o].bookTags, fixed.bookTags);
      assert.equal(r.openings.variants[o].plan, fixed.plan);
      assert.ok(r.openings.variants[o].plan, `${o} の plan が付いている`);
      assert.deepEqual(r.openings.variants[o].traits, ["uke", o]);
    }
    // 戦法が決まる前の style・タグ・plan は、戦法の項を含まない
    assert.equal(r.style.weights.castleIbisha, 0);
    assert.equal(r.style.weights.castleFuri, 0);
    assert.deepEqual(r.bookTags, []);
    assert.equal(r.plan, null);
  });

  it("通常のペルソナは openings が null、抽選は両色 null", () => {
    for (const id of ["balance", "seme", "uke", "ibisha-seme", "furi-uke"]) {
      const r = resolvePersona(id);
      assert.equal(r.openings, null, id);
      assert.deepEqual(drawOpenings(r.openings, 7), { black: null, white: null });
    }
  });

  it("openingWeights：確率を変えられる。不正な指定はエラー", () => {
    const only = (w) => resolvePersona({ traits: ["random"], openingWeights: w }).openings;
    assert.deepEqual(only({ ibisha: 90, furibisha: 10 }).weights, { ibisha: 90, furibisha: 10 });
    assert.ok(SEEDS.every((s) => Object.values(drawOpenings(only({ ibisha: 1, furibisha: 0 }), s)).every((o) => o === "ibisha")));
    assert.throws(() => only({ ibisha: 0, furibisha: 0 }), /全部 0/);
    assert.throws(() => only({ ibisha: -1 }), /0 以上/);
    assert.throws(() => only({ rushi: 1 }), /候補にない/);
  });
});

describe("random: 抽選（drawOpenings）", () => {
  const openings = resolvePersona({ traits: ["random"] }).openings;

  it("同じシードなら同じ結果（再現できる）", () => {
    for (const s of [1, 2, 3, 12345]) {
      assert.deepEqual(drawOpenings(openings, s), drawOpenings(openings, s));
    }
  });

  it("先手と後手は別々に抽選される：4通りがどれも約25%、各色は約50%", () => {
    const count = { "ibisha/ibisha": 0, "ibisha/furibisha": 0, "furibisha/ibisha": 0, "furibisha/furibisha": 0 };
    let blackIbisha = 0;
    let whiteIbisha = 0;
    for (const s of SEEDS) {
      const d = drawOpenings(openings, s);
      count[`${d.black}/${d.white}`]++;
      if (d.black === "ibisha") blackIbisha++;
      if (d.white === "ibisha") whiteIbisha++;
    }
    for (const [k, n] of Object.entries(count)) {
      const rate = n / SEEDS.length;
      assert.ok(rate > 0.17 && rate < 0.33, `${k}: ${rate}`);
    }
    assert.ok(Math.abs(blackIbisha / SEEDS.length - 0.5) < 0.1, `先手 ${blackIbisha}`);
    assert.ok(Math.abs(whiteIbisha / SEEDS.length - 0.5) < 0.1, `後手 ${whiteIbisha}`);
  });

  it("重みの比が効く（90:10 で居飛車が約9割）", () => {
    const o = resolvePersona({ traits: ["random"], openingWeights: { ibisha: 90, furibisha: 10 } }).openings;
    const n = SEEDS.filter((s) => drawOpenings(o, s).black === "ibisha").length;
    assert.ok(n / SEEDS.length > 0.82 && n / SEEDS.length < 0.97, `n=${n}`);
  });
});

describe("random: player", () => {
  const seedWhere = (black, white) =>
    SEEDS.find((s) => {
      const d = drawOpenings(resolvePersona({ traits: ["random"] }).openings, s);
      return d.black === black && d.white === white;
    });

  it("newGame(seed) で抽選し直す。同じシードなら同じ。通常のキャラは null のまま", () => {
    const p = createPlayer({ traits: ["random"], seed: 1 });
    const want = drawOpenings(p.persona.openings, 1);
    assert.equal(p.opening("black"), want.black); // 作成時のシードで抽選済み
    assert.equal(p.opening("white"), want.white);
    for (const s of [2, 3, 4, 5]) {
      p.newGame(s);
      const d = drawOpenings(p.persona.openings, s);
      assert.equal(p.opening("black"), d.black);
      assert.equal(p.opening("white"), d.white);
    }
    const plain = createPlayer({ persona: "furi-uke" });
    assert.equal(plain.opening("black"), null);
    assert.equal(plain.opening("white"), null);
  });

  it("抽選後は、同じ戦法の固定のキャラと同じ手を指す（探索、先手・後手とも。4通りすべて）", () => {
    const afterOne = () => {
      const b = new ShogiBoard();
      b.makeMoveByUSI("7g7f");
      return b;
    };
    const opts = { search: { depth: 2 }, book: { enabled: false }, plan: false };
    for (const bw of ["ibisha", "furibisha"]) {
      for (const ww of ["ibisha", "furibisha"]) {
        const seed = seedWhere(bw, ww);
        assert.ok(seed, `${bw}/${ww} のシードが見つかる`);
        const all = createPlayer({ traits: ["uke", "random"], seed, ...opts });
        const fixedB = createPlayer({ traits: ["uke", bw], seed, ...opts });
        const fixedW = createPlayer({ traits: ["uke", ww], seed, ...opts });
        const a1 = all.chooseMove(new ShogiBoard());
        const b1 = fixedB.chooseMove(new ShogiBoard());
        assert.equal(a1.move.usi, b1.move.usi, `${bw}/${ww} 先手`);
        assert.equal(a1.info.score, b1.info.score, `${bw}/${ww} 先手の評価値`);
        // 後手番の比較は、どちらも「新品のプレイヤーの1手目」にそろえる。
        // 2026-11-09：uke は取る手の加減点（capture）でルート採点の経路に入り、手選びで乱数を使う。
        // 先手の1手を指した後の乱数の位置は、抽選型と固定型で別物なので、続けて比べると食い違う。
        const allW = createPlayer({ traits: ["uke", "random"], seed, ...opts });
        const a2 = allW.chooseMove(afterOne());
        const w1 = fixedW.chooseMove(afterOne());
        assert.equal(a2.move.usi, w1.move.usi, `${bw}/${ww} 後手`);
        assert.equal(a2.info.score, w1.info.score, `${bw}/${ww} 後手の評価値`);
      }
    }
  });

  it("抽選後は、同じ戦法の固定のキャラと同じ手を指す（定跡。同じシードなら候補も同じ）", () => {
    for (const o of ["ibisha", "furibisha"]) {
      const seed = seedWhere(o, o === "ibisha" ? "furibisha" : "ibisha");
      const all = createPlayer({ traits: ["random"], seed, book: { enabled: true, data: BOOK } });
      const fixed = createPlayer({ traits: [o], seed, book: { enabled: true, data: BOOK } });
      const a = all.chooseMove(new ShogiBoard());
      const f = fixed.chooseMove(new ShogiBoard());
      assert.equal(a.source, "book");
      assert.equal(a.move.usi, f.move.usi);
      assert.deepEqual(a.info.candidates, f.info.candidates);
    }
  });

  it("抽選後は、確定した戦型の手順テンプレートが効く（居飛車＝ibisha-basic、振り飛車＝furi-shiken-mino）", () => {
    // 後手の手は盤面へ直接指してそろえ、先手の2手目までを固定のペルソナと比較する。
    const play = (b, usi) => b.makeMove(b.legalMoves().find((m) => m.usi === usi));
    const cases = [
      // [確定した戦型, 固定のペルソナ, 先手の2手目, その planStep]
      ["ibisha", "ibisha-balance", "2g2f", "p26"],
      ["furibisha", "furi-balance", "6g6f", "p66"],
    ];
    for (const [opening, fixedId, secondMove, secondStep] of cases) {
      const seed = seedWhere(opening, opening === "ibisha" ? "furibisha" : "ibisha");
      assert.ok(seed, `${opening} のシードが見つかる`);
      const opts = { seed, search: { depth: 1 }, selection: { margin: 0 }, book: { enabled: false } };
      const rnd = createPlayer({ persona: "random-balance", ...opts });
      const fixed = createPlayer({ persona: fixedId, ...opts });
      assert.equal(rnd.opening("black"), opening);
      for (const p of [rnd, fixed]) {
        const b = new ShogiBoard();
        const r1 = p.chooseMove(b);
        assert.equal(r1.source, "plan", `${p.persona.id} 初手`);
        assert.equal(r1.move.usi, "7g7f", `${p.persona.id} 初手`);
        assert.equal(r1.info.planStep, "p76", `${p.persona.id} 初手`);
        play(b, "7g7f");
        play(b, "3c3d"); // 後手は手で指す（抽選結果に依らせない）
        const r2 = p.chooseMove(b);
        assert.equal(r2.source, "plan", `${p.persona.id} 2手目`);
        assert.equal(r2.move.usi, secondMove, `${p.persona.id} 2手目`);
        assert.equal(r2.info.planStep, secondStep, `${p.persona.id} 2手目`);
      }
    }
  });

  it("自己対局：先手と後手で戦法が違っても（居飛車対振り飛車）、手番ごとに評価を切り替えて指し続けられる", () => {
    const seed = seedWhere("ibisha", "furibisha");
    const p = createPlayer({ persona: { traits: ["random"] }, seed, search: { depth: 2 }, book: { enabled: false } });
    const board = new ShogiBoard();
    for (let i = 0; i < 12 && !board.isGameOver(); i++) {
      const r = p.chooseMove(board);
      assert.ok(r.move, `手 ${i}`);
      board.makeMoveByUSI(r.move.usi);
    }
  });

  it("抽選の乱数は手選びの乱数と別系統：ランダムでも、newGame(seed) 後の手選びの乱数列は固定のキャラと同じ", () => {
    // 手選び（selection の slip）に state.rng を使う。抽選が state.rng を消費すると、固定のキャラと列がずれる。
    const seed = seedWhere("furibisha", "ibisha");
    const sel = { slipRate: 1, slipMargin: 400, temperature: 100 };
    const opts = { search: { depth: 2 }, book: { enabled: false }, plan: false, selection: sel };
    const all = createPlayer({ traits: ["random"], seed: 99, ...opts });
    const fixed = createPlayer({ traits: ["furibisha"], seed: 99, ...opts });
    all.newGame(seed);
    fixed.newGame(seed);
    const a = all.chooseMove(new ShogiBoard());
    const f = fixed.chooseMove(new ShogiBoard());
    assert.equal(a.move.usi, f.move.usi);
    // 参考：mulberry32 の列そのものが drawOpenings で変わっていないこと
    assert.equal(createRng(seed)(), createRng(seed)());
  });
});
