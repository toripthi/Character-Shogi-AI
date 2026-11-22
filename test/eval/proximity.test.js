/**
 * 2026-11-09 改修（docs/specs/eval-2piece-spec-2026-11-09.md）の仕様どおりの値を確かめる。
 * 駒価値は既定の kyuui（歩100・香300・銀500・金600・と金500・馬1000）。
 * 本体（高速版）と参照実装の一致は fast-vs-reference.test.js が見る。ここは「仕様の数字になっているか」。
 */
import { describe, it } from "node:test";
import { strict as assert } from "node:assert";
import { ShogiBoard } from "../../src/core/board.js";
import { resolveStyle, evaluate, TERMS } from "../../src/eval/index.js";
import { materialTerm } from "../../src/eval/terms/material.js";
import { attackTerm } from "../../src/eval/terms/attack.js";
import { captureTerm } from "../../src/eval/terms/capture.js";
import { ATTACK_PCT, DEFENSE_PCT, LANCE_PCT, HAND_PCT, chebyshev } from "../../src/eval/proximity.js";
import { scoreRootMoves } from "../../src/selection/index.js";
import { resolvePersona } from "../../src/characters/index.js";

const STYLE = resolveStyle({});
const material = (sfen) => materialTerm(new ShogiBoard(sfen), STYLE);
const attack = (sfen) => attackTerm(new ShogiBoard(sfen), STYLE);

describe("距離係数の表（§2）", () => {
  it("チェビシェフ距離（縦・横・斜めを1歩）", () => {
    assert.equal(chebyshev(5, 1, 5, 3), 2);
    assert.equal(chebyshev(5, 1, 8, 2), 3);
    assert.equal(chebyshev(1, 1, 5, 5), 4);
  });
  it("攻め：距離1〜2が1、3が0.75、4が0.25、5以上が0。守り：1〜2が1、3が0.4、4以上が0", () => {
    assert.deepEqual([ATTACK_PCT[1], ATTACK_PCT[2], ATTACK_PCT[3], ATTACK_PCT[4], ATTACK_PCT[5], ATTACK_PCT[8]], [100, 100, 75, 25, 0, 0]);
    assert.deepEqual([DEFENSE_PCT[1], DEFENSE_PCT[2], DEFENSE_PCT[3], DEFENSE_PCT[4], DEFENSE_PCT[8]], [100, 100, 40, 0, 0]);
    assert.deepEqual([...LANCE_PCT], [100, 90, 80, 75]);
    assert.equal(HAND_PCT, 125);
  });
});

describe("成り駒の価値（§4）：元駒 ＋ 上乗せ分 × 距離係数", () => {
  it("敵玉と距離2：全額（と金 500）", () => {
    assert.equal(material("4k4/9/4+P4/9/9/9/9/9/4K4 b - 1"), 500);
  });
  it("敵玉と距離4：上乗せ分の 25%（100 + 400×0.25 = 200）", () => {
    assert.equal(material("4k4/9/9/9/+P8/9/9/9/4K4 b - 1"), 200);
  });
  it("敵玉からも自玉からも遠い：ほぼ元駒（歩 100）", () => {
    assert.equal(material("4k4/9/9/9/9/9/9/9/+P3K4 b - 1"), 100);
  });
  it("自玉のすぐ近く（守備）：全額。敵玉から遠くても効く", () => {
    assert.equal(material("4k4/9/9/9/9/9/9/3+P5/4K4 b - 1"), 500);
  });
  it("自玉と距離3（守り 0.4）：100 + 400×0.4 = 260", () => {
    assert.equal(material("4k4/9/9/9/9/4+P4/9/9/4K4 b - 1"), 260);
  });
  it("攻めと守りは大きい方を使い、合計しない（両玉と距離3：0.75 と 0.4 → 0.75。合計なら 1.15）", () => {
    assert.equal(material("9/4k4/9/9/4+P4/9/9/4K4/9 b - 1"), 400);
  });
  it("馬・龍は距離係数の対象外（遠くても 1000 / 1300）", () => {
    assert.equal(material("4k4/9/9/9/9/9/9/9/+B3K4 b - 1"), 1000);
    assert.equal(material("4k4/9/9/9/9/9/9/9/+R3K4 b - 1"), 1300);
  });
  it("駒割の本体は距離で割り引かない（銀・桂・歩・角・飛は距離に関係なく同じ）", () => {
    assert.equal(material("4k4/9/4S4/9/9/9/9/9/4K4 b - 1"), 500);
    assert.equal(material("4k4/9/9/9/9/9/9/9/S3K4 b - 1"), 500);
    assert.equal(material("4k4/9/9/9/9/9/9/9/B3K4 b - 1"), 800);
  });
});

describe("1段目のルール（§5）", () => {
  it("1段目のと金で、敵玉と距離8：上乗せ分 0 → 歩 100", () => {
    assert.equal(material("k7+P/9/9/9/9/9/9/9/4K4 b - 1"), 100);
  });
  it("1段目のと金でも、敵玉と距離3（0.75 になるはずの距離）：上乗せ分 0 → 100", () => {
    assert.equal(material("4+P4/9/9/4k4/9/9/9/9/4K4 b - 1"), 100);
  });
  it("1段目のと金でも、敵玉と距離2：ルールは効かず全額 500", () => {
    assert.equal(material("4+P4/9/3k5/9/9/9/9/9/4K4 b - 1"), 500);
  });
  it("1段目の金：敵玉と距離3以上なら 0.6 倍（600 → 360。銀 500 を下回る）", () => {
    assert.equal(material("k7G/9/9/9/9/9/9/9/4K4 b - 1"), 360);
    assert.ok(360 < STYLE.pieceValues.silver);
  });
  it("1段目の金でも、敵玉と距離2以内なら 600 のまま。2段目の金は割り引かない", () => {
    assert.equal(material("4G4/9/3k5/9/9/9/9/9/4K4 b - 1"), 600);
    assert.equal(material("k8/G8/9/9/9/9/9/9/4K4 b - 1"), 600);
  });
  it("どの駒価値セットでも、割り引いた金は銀を下回る", () => {
    for (const set of ["kyuui", "neutral", "aono"]) {
      const v = resolveStyle({ pieceSet: set }).pieceValues;
      assert.ok(v.gold * 0.6 < v.silver, set);
    }
  });
  it("後手の側も対称（後手の1段目 = 9段目）", () => {
    assert.equal(material("4k4/9/9/9/9/9/9/9/K7g w - 1"), 360);
    assert.equal(material("4k4/9/9/9/9/9/9/9/K7+p w - 1"), 100);
  });
});

describe("持ち駒は元駒の 1.25 倍（§6）", () => {
  it("歩 125・飛 1250・金 750。相手の持ち駒は引く", () => {
    assert.equal(material("4k4/9/9/9/9/9/9/9/4K4 b P 1"), 125);
    assert.equal(material("4k4/9/9/9/9/9/9/9/4K4 b R 1"), 1250);
    assert.equal(material("4k4/9/9/9/9/9/9/9/4K4 b G 1"), 750);
    assert.equal(material("4k4/9/9/9/9/9/9/9/4K4 b p 1"), -125);
  });
  it("持ち駒の香車は段係数の対象外（300 × 1.25 = 375）", () => {
    assert.equal(material("4k4/9/9/9/9/9/9/9/4K4 b L 1"), 375);
  });
});

describe("香車の段係数（§10）", () => {
  it("初期位置の段 1、1段進んで 0.9、2段進んで 0.8、3段以上 0.75", () => {
    assert.equal(material("4k4/9/9/9/9/9/9/9/L3K4 b - 1"), 300); // 9i
    assert.equal(material("4k4/9/9/9/9/9/9/L8/4K4 b - 1"), 270); // 9h
    assert.equal(material("4k4/9/9/9/9/9/L8/9/4K4 b - 1"), 240); // 9g
    assert.equal(material("4k4/9/9/9/9/L8/9/9/4K4 b - 1"), 225); // 9f
    assert.equal(material("4k4/9/9/L8/9/9/9/9/4K4 b - 1"), 225); // 9d
  });
  it("後手の香車は後手から見た段で数える（1段目が初期位置）", () => {
    assert.equal(material("l3k4/9/9/9/9/9/9/9/4K4 w - 1"), 300);
    assert.equal(material("4k4/l8/9/9/9/9/9/9/4K4 w - 1"), 270);
  });
  it("成香には掛けない（金の動きの成り駒として §4・§5 に従う）", () => {
    assert.equal(material("4k4/9/4+L4/9/9/9/9/9/4K4 b - 1"), 500);
  });
});

describe("攻め駒の項（§3）", () => {
  it("飛・角・馬・龍は距離係数を掛けず 1（敵玉から遠くても）", () => {
    assert.equal(attack("k8/9/8R/9/9/9/9/9/4K4 b - 1"), 1); // 飛：9a の玉と 1c… 距離8
    assert.equal(attack("k7B/9/9/9/9/9/9/9/4K4 b - 1"), 1);
    assert.equal(attack("k8/9/8+B/9/9/9/9/9/4K4 b - 1"), 1);
  });
  it("歩は敵玉との距離係数を掛ける（距離2:1、3:0.75、4:0.25、5以上:0）", () => {
    assert.equal(attack("4k4/9/4P4/9/9/9/9/9/4K4 b - 1"), 1); // 5c：距離2
    assert.equal(attack("4k4/9/1P7/9/9/9/9/9/4K4 b - 1"), 0.75); // 8c：距離3
    assert.equal(attack("4k4/9/P8/9/9/9/9/9/4K4 b - 1"), 0.25); // 9c：距離4
    assert.equal(attack("8k/9/P8/9/9/9/9/9/4K4 b - 1"), 0); // 9c と 1a の玉：距離8
  });
  it("1段目の金の動きの成り駒は、敵玉と距離3以上なら寄与 0（距離2以内なら 1）", () => {
    assert.equal(attack("4+P4/9/9/4k4/9/9/9/9/4K4 b - 1"), 0);
    assert.equal(attack("4+P4/9/3k5/9/9/9/9/9/4K4 b - 1"), 1);
  });
  it("相手の攻め駒が自陣に入った減点も同じ数え方（自玉との距離）", () => {
    assert.equal(attack("4k4/9/9/9/9/9/9/4p4/4K4 b - 1"), -1); // 5h：自玉と距離1
    assert.equal(attack("4k4/9/9/9/9/9/p8/9/4K4 b - 1"), -0.25); // 9g：自玉と距離4
  });
  it("気質の重み：攻め 30・バランス 20・守り 10", () => {
    assert.equal(resolvePersona("seme").style.weights.attack, 30);
    assert.equal(resolvePersona("balance").style.weights.attack, 20);
    assert.equal(resolvePersona("uke").style.weights.attack, 10);
  });
});

describe("取る手への加減点（§7）：手に対する項として、ルート採点にだけ入る", () => {
  const tie = () => ({ score: 0, breakdown: {} });
  // 先手の飛が5hから、5gの歩・5fの桂を…（5gの歩を取る手 5h5g）
  const SFEN = "4k4/9/9/9/9/9/4p4/4R4/4K4 b - 1";
  const scoreOf = (scored, usi) => scored.find((s) => s.move.usi === usi)?.score;

  it("項は kind: move・既定の重み 0.05。局面の評価（breakdown）には入らない", () => {
    assert.equal(TERMS.capture.kind, "move");
    assert.equal(TERMS.capture.defaultWeight, 0.05);
    assert.equal(evaluate(new ShogiBoard(SFEN), { weights: { capture: 5 } }).breakdown.capture, undefined);
  });
  it("気質ごとの重み：攻め +0.15、バランス +0.05、守り -0.05（既定 0.05 に特性の加算）", () => {
    assert.ok(Math.abs(resolvePersona("seme").style.weights.capture - 0.15) < 1e-9);
    assert.ok(Math.abs(resolvePersona("balance").style.weights.capture - 0.05) < 1e-9);
    assert.ok(Math.abs(resolvePersona("uke").style.weights.capture - -0.05) < 1e-9);
  });
  it("captureTerm は取った駒の価値（歩 100・飛 1000・龍 1300）。取らない手は 0", () => {
    const b = new ShogiBoard(SFEN);
    const moves = new Map(b.legalMoves().map((m) => [m.usi, m]));
    assert.equal(captureTerm(b, moves.get("5h5g"), STYLE), 100);
    assert.equal(captureTerm(b, moves.get("5h4h"), STYLE), 0);
    const b2 = new ShogiBoard("4k4/9/9/9/9/9/4+r4/4R4/4K4 b - 1");
    const m2 = b2.legalMoves().find((m) => m.usi === "5h5g");
    assert.equal(captureTerm(b2, m2, STYLE), 1300);
  });
  it("取る手のスコアに 重み × 取った駒の価値 が足される（攻め +10、守り -5。ほかの手は 0）", () => {
    const base = scoreRootMoves(new ShogiBoard(SFEN), { depth: 1, evaluate: tie, style: STYLE });
    for (const [w, want] of [[0.1, 10], [-0.05, -5]]) {
      const scored = scoreRootMoves(new ShogiBoard(SFEN), { depth: 1, evaluate: tie, style: STYLE, captureWeight: w });
      assert.ok(Math.abs(scoreOf(scored, "5h5g") - want) < 1e-9, `${w}: ${scoreOf(scored, "5h5g")}`);
      assert.ok(scoreOf(scored, "5h4h") === scoreOf(base, "5h4h"), "取らない手は変わらない（-0 と 0 は同じ）");
    }
  });
  it("captureWeight 0 は接続前と完全に同じ採点", () => {
    const a = scoreRootMoves(new ShogiBoard(SFEN), { depth: 2, style: STYLE });
    const b = scoreRootMoves(new ShogiBoard(SFEN), { depth: 2, style: STYLE, captureWeight: 0 });
    assert.deepEqual(a.map((s) => [s.move.usi, s.score]), b.map((s) => [s.move.usi, s.score]));
  });
  it("打ち切り（pruneMargin）と併用しても、margin 内の候補は打ち切りなしと一致する", () => {
    const style = resolvePersona("seme").style;
    for (const sfen of ["ls5n1/2s3kbl/+Prn1pgppp/P8/4P4/6PPP/4B2G1/6R2/LNS1KGSNL b G5P3p 1", "1n5n1/l1rgkgsbl/1ppspp1pp/pP1p2p2/2P1P4/3P5/5PPPP/1B2GR3/LNSGK1SNL w p 1"]) {
      const o = { depth: 2, style, retreatWeight: style.weights.retreat, captureWeight: style.weights.capture };
      const base = scoreRootMoves(new ShogiBoard(sfen), o);
      const pruned = scoreRootMoves(new ShogiBoard(sfen), { ...o, pruneMargin: 300 });
      const within = (sc) => sc.filter((s) => sc[0].score - s.score <= 100).map((s) => `${s.move.usi}:${s.score}`).sort();
      assert.deepEqual(within(pruned), within(base), sfen);
    }
  });
  it("詰みの点には足さない（早い詰みが遅い詰みより低くならない）", () => {
    // 先手の金打ちで詰み。5aの玉を 5b の金（5cの金が支える）…取る手ではないが、captureWeight を巨大にしても詰み点は不変
    const sfen = "4k4/4G4/4G4/9/9/9/9/9/4K4 b - 1";
    const a = scoreRootMoves(new ShogiBoard(sfen), { depth: 2, style: STYLE });
    const b = scoreRootMoves(new ShogiBoard(sfen), { depth: 2, style: STYLE, captureWeight: 1000 });
    assert.deepEqual(a.map((s) => [s.move.usi, s.score]), b.map((s) => [s.move.usi, s.score]));
  });
});
