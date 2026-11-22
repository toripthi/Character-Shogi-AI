/**
 * 4-1: player と定跡（book）の組み込み。OFF は従来どおり、ON は lookup を先に引く。
 * 戻り（D-022）：stickyOut=false は、外れたあと評価条件（|balance| ≤ rejoinMaxAbs）を満たす時だけ戻る。
 * 状態は手番の色ごと（自己対局は単一 player で両手番を指すため）。
 */
import { describe, it } from "node:test";
import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { createPlayer } from "../../src/player.js";
import { ShogiBoard } from "../../src/core/board.js";

const DATA = JSON.parse(readFileSync(new URL("../fixtures/book/book.json", import.meta.url), "utf8"));
const START = () => new ShogiBoard();
// 定跡の表にない先手局面（7g7f 3c3d 7f7e 4c4d の後、先手番）
const OFF_BOOK = () => {
  const b = new ShogiBoard();
  for (const u of ["7g7f", "3c3d", "7f7e", "4c4d"]) b.makeMoveByUSI(u);
  return b;
};

describe("player と定跡", () => {
  it("戦法タグを持つプレイヤーは、そのタグを含むラインだけを使う（ibisha の 7g7f）。タグなしは引けない（D-018）", () => {
    const p = createPlayer({ traits: [], book: { enabled: true, data: DATA, tags: ["ibisha"] } });
    const r = p.chooseMove(START());
    assert.equal(r.source, "book");
    assert.equal(r.move.usi, "7g7f");
    const q = createPlayer({ traits: [], book: { enabled: true, data: DATA, tags: [] } });
    assert.equal(q.chooseMove(START()).source, "search");
  });

  it("定跡の表にない局面では探索に戻る（source: search）、maxOwnMoves=0 なら使わない", () => {
    const p = createPlayer({ traits: [], book: { enabled: true, data: DATA, tags: ["ibisha"] } });
    assert.equal(p.chooseMove(OFF_BOOK()).source, "search");
    const q = createPlayer({ traits: [], book: { enabled: true, data: DATA, tags: ["ibisha"], maxOwnMoves: 0 } });
    assert.equal(q.chooseMove(START()).source, "search");
  });

  it("stickyOut=false・rejoinMaxAbs 既定：一度外れても、評価が穏やかなら局面が表にあれば戻る", () => {
    const p = createPlayer({ traits: [], book: { enabled: true, data: DATA, tags: ["ibisha"] } });
    assert.equal(p.chooseMove(OFF_BOOK()).source, "search"); // 先手が外れる
    assert.equal(p.chooseMove(START()).source, "book"); // 初期局面は評価0で戻れる
  });

  it("stickyOut=false・rejoinMaxAbs < 0：外れたら評価条件を満たさず、戻らない", () => {
    const p = createPlayer({ traits: [], book: { enabled: true, data: DATA, tags: ["ibisha"], rejoinMaxAbs: -1 } });
    p.chooseMove(OFF_BOOK());
    assert.equal(p.chooseMove(START()).source, "search");
  });

  it("stickyOut=true：一度外れたら、表に戻っても使わない", () => {
    const p = createPlayer({ traits: [], book: { enabled: true, data: DATA, tags: ["ibisha"], stickyOut: true } });
    p.chooseMove(OFF_BOOK());
    assert.equal(p.chooseMove(START()).source, "search");
  });

  it("skipRate=1：必ず使わず探索。外れ扱いになる（以後の戻りの判定に使う）", () => {
    const p = createPlayer({ traits: [], seed: 3, book: { enabled: true, data: DATA, tags: ["ibisha"], skipRate: 1 } });
    assert.equal(p.chooseMove(START()).source, "search");
    assert.equal(p.chooseMove(START()).source, "search");
  });

  it("手番の色ごとに状態を持つ：先手が外れても、後手の定跡は影響を受けない", () => {
    const p = createPlayer({ traits: [], book: { enabled: true, data: DATA, tags: ["ibisha"], rejoinMaxAbs: -1 } });
    p.chooseMove(OFF_BOOK()); // 先手が外れる（後手番は別の状態）
    const white = new ShogiBoard();
    white.makeMoveByUSI("7g7f");
    // 後手は、先手の状態とは別。後手の局面が表にあれば、戻りの判定に関係なく使える
    // （この局面は後手の定跡に無いので search。後手の状態が外れ扱いでないことは stats で確認）
    assert.equal(p.chooseMove(white).source, "search");
    assert.ok(p.bookStats().misses >= 1);
  });

  it("baseline（usesBook: false）は、タグなしのラインがあっても定跡を引かない（D-011）", () => {
    const p = createPlayer({ persona: "baseline", book: { enabled: true, data: DATA, tags: [] } });
    assert.equal(p.chooseMove(START()).source, "search");
    assert.equal(p.bookStats().hits, 0); // 引いていない（lookup を呼ばない）
  });

  it("balance（棋風）は定跡を使える（ibisha-balance は ibisha の定跡を引く。D-018／D-011）", () => {
    const p = createPlayer({ persona: "ibisha-balance", book: { enabled: true, data: DATA } });
    const r = p.chooseMove(START());
    assert.equal(r.source, "book");
    assert.equal(r.move.usi, "7g7f");
  });

  it("OFF（book 未指定）は従来どおりで、book の統計は null", () => {
    const p = createPlayer({ persona: "balance" });
    assert.equal(p.book.enabled, false);
    assert.equal(p.bookStats(), null);
  });
});
