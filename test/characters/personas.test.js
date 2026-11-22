import { describe, it } from "node:test";
import { strict as assert } from "node:assert";
import { ShogiBoard } from "../../src/core/board.js";
import { evaluate } from "../../src/eval/index.js";
import { resolvePersona } from "../../src/characters/index.js";
import { searchBestMove } from "../../src/search/index.js";

const seme = resolvePersona("seme").style;
const balance = resolvePersona("balance").style;
const uke = resolvePersona("uke").style;

describe("personas: 棋風の差が評価に出る", () => {
  it("攻め将棋は前進局面を加点する（advance項が正）", () => {
    // 前進の値は「持ち主から見た段×10」の一律表（2026-11-21 作り替え）。敵玉との距離係数は掛けない。
    // 重みは攻めだけが1、バランスは0。
    const near = new ShogiBoard("4k4/9/4P4/9/9/9/9/9/4K4 b - 1");
    assert.equal(evaluate(near, seme).breakdown.advance, 70, "歩が5c（持ち主から見て7段目）→ 70点");
    assert.equal(evaluate(near, balance).breakdown.advance, 0);
    const mid = new ShogiBoard("4k4/9/9/4P4/9/9/9/9/4K4 b - 1");
    assert.equal(evaluate(mid, seme).breakdown.advance, 60, "歩が5d（持ち主から見て6段目）→ 60点");
    const far = new ShogiBoard("8k/9/9/P8/9/9/9/9/4K4 b - 1");
    assert.equal(evaluate(far, seme).breakdown.advance, 60, "敵玉から遠くても段だけで決まる（1d＝6段目 → 60点）");
  });

  it("飛車が狙われたら受け将棋は減点する（rookDanger項が負）", () => {
    // 初期局面では飛車は狙われていない
    const safe = evaluate(new ShogiBoard(), uke);
    assert.equal(safe.breakdown.rookDanger, 0);
    // 飛車どうしが向かい合い、利きで減点が出る局面
    const danger = new ShogiBoard("4k4/4r4/9/9/9/9/9/4R4/4K4 b - 1");
    assert.ok(evaluate(danger, uke).breakdown.rookDanger <= 0);
  });

  // K3（4-0-6）：旧テストは「bestMove がある」だけで、飛車の扱いを確かめていなかった。
  // 局面6（4k4/4r4/…）は、飛車取りが玉に取り返される同数交換。深さ2で受け将棋も釣り合いも
  // 5h5b+（取り合い）を選び、2手後の損得は0。棋風では差が出ない局面なので、その事実を固定する。
  it("テスト局面6（受け将棋・深さ2）: 飛車の取り合いは同数交換（5h5b+、損得0）", () => {
    const board = new ShogiBoard("4k4/4r4/9/9/9/9/9/4R4/4K4 b - 1");
    const { bestMove, score } = searchBestMove(board, { depth: 2, style: uke });
    assert.equal(bestMove.usi, "5h5b+");
    assert.equal(score, 0);
  });

  it("テスト局面6b（受け将棋・深さ2）: 取り返せない飛車は取る（5h5b+、評価が大きく正）", () => {
    // 後手飛5bは取り返す駒がない。balance も同じ手を選ぶ（棋風で差は出ない）。
    const board = new ShogiBoard("k8/4r4/9/9/9/9/9/4R4/4K4 b - 1");
    const { bestMove, score } = searchBestMove(board, { depth: 2, style: uke });
    assert.equal(bestMove.usi, "5h5b+");
    assert.ok(score > 1000, `score=${score}`);
    const bal = searchBestMove(new ShogiBoard("k8/4r4/9/9/9/9/9/4R4/4K4 b - 1"), { depth: 2, style: balance });
    assert.equal(bal.bestMove.usi, "5h5b+");
  });
});
