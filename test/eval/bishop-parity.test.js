/**
 * 角の筋違い（減点）（2026-11-21 本人の指示）：（筋＋段）の和が奇数のマスにいる角 −90、馬 −5（馬は仮置き。角は2026-11-21に本人が −90 で確定）。
 * 角の移動では和の偶奇が変わらず、初期位置（先手8八・後手2二）は和が偶数なので、奇数のマスの
 * 角は打ち込んだ角＝筋違い角。本人の例（将棋座標）：(1,1) 罰なし、(1,2) 罰あり、(3,5) 罰なし。
 * 本体と参照実装（tsshogi 版の盤）の両方で確かめる。
 */
import { describe, it } from "node:test";
import { strict as assert } from "node:assert";
import { ShogiBoard } from "../../src/core/board.js";
import { ShogiBoard as OracleBoard } from "../../src/core/board-tsshogi.js";
import "../../src/eval/reference/index.js"; // fb の無い盤（tsshogi 版）で参照実装を使うための登録
import { bishopParityTerm } from "../../src/eval/terms/bishopParity.js";
import { evaluate } from "../../src/eval/index.js";

// 本体と参照実装が同じ値を返すことも毎回確かめる
function both(sfen) {
  const fast = bishopParityTerm(new ShogiBoard(sfen));
  const ref = bishopParityTerm(new OracleBoard(sfen));
  assert.ok(Object.is(fast, ref), `本体と参照が一致: ${sfen} (${fast} vs ${ref})`);
  return fast;
}

describe("角の筋違い：先手の角（本人の3例）", () => {
  it("(1,1) は和が偶数で罰なし", () => {
    assert.equal(both("4k3B/9/9/9/9/9/9/9/4K4 b - 1"), 0);
  });
  it("(1,2) は和が奇数で −90", () => {
    assert.equal(both("4k4/8B/9/9/9/9/9/9/4K4 b - 1"), -90);
  });
  it("(3,5) は和が偶数で罰なし", () => {
    assert.equal(both("4k4/9/9/9/6B2/9/9/9/4K4 b - 1"), 0);
  });
  it("初期局面は両角とも偶数のマスで 0（先手番・後手番とも）", () => {
    assert.equal(bishopParityTerm(new ShogiBoard()), 0);
    assert.equal(both("lnsgkgsnl/1r5b1/ppppppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL w - 1"), 0);
  });
  it("相手の角が奇数のマスなら手番視点で +90", () => {
    assert.equal(both("4k4/8B/9/9/9/9/9/9/4K4 w - 1"), 90);
  });
});

describe("角の筋違い：後手の角（鏡像でも同じ3例）", () => {
  it("(9,9) は和が偶数で罰なし", () => {
    assert.equal(both("4k4/9/9/9/9/9/9/9/b3K4 w - 1"), 0);
  });
  it("(9,8) は和が奇数で −90", () => {
    assert.equal(both("4k4/9/9/9/9/9/9/b8/4K4 w - 1"), -90);
  });
  it("(7,5) は和が偶数で罰なし", () => {
    assert.equal(both("4k4/9/9/9/2b6/9/9/9/4K4 w - 1"), 0);
  });
});

describe("角の筋違い：馬は角より軽い", () => {
  it("先手の馬が (1,2) なら −5（角の −90 より軽い）", () => {
    const horse = both("4k4/8+B/9/9/9/9/9/9/4K4 b - 1");
    assert.equal(horse, -5);
    assert.ok(horse > -90);
  });
  it("後手の馬が (9,8) なら −5", () => {
    assert.equal(both("4k4/9/9/9/9/9/9/+b8/4K4 w - 1"), -5);
  });
  it("馬が偶数のマス (1,1) なら罰なし", () => {
    assert.equal(both("4k3+B/9/9/9/9/9/9/9/4K4 b - 1"), 0);
  });
});

describe("角の筋違い：評価への登録（既定の重み1で全棋風に効く）", () => {
  it("evaluate の内訳に bishopParity が罰点そのままで入る", () => {
    const { breakdown } = evaluate(new ShogiBoard("4k4/8B/9/9/9/9/9/9/4K4 b - 1"));
    assert.equal(breakdown.bishopParity, -90);
  });
});
