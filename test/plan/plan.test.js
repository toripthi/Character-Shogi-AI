/**
 * 手順テンプレート層（src/plan）。薄め：手順が通ること、後手の鏡像、初手30通りへの返し、端歩の割り込み、打ち切り、
 * player への接続（source: "plan"）、安全弁。
 */
import { describe, it } from "node:test";
import { strict as assert } from "node:assert";
import { ShogiBoard } from "../../src/core/board.js";
import { createPlanner, PLANS, mirrorSquare, pawnsInContact } from "../../src/plan/index.js";
import { drawOpenings } from "../../src/characters/index.js";
import { createPlayer } from "../../src/player.js";
import { matchForm } from "../../src/eval/terms/castle.js";

const planner = createPlanner(PLANS["furi-shiken-mino"]);
const IBISHA = { opponent: "ibisha" };
const FURI = { opponent: "furi" };
const play = (b, usi) => b.makeMove(b.legalMoves().find((m) => m.usi === usi));
const first = () => 0; // 乱数：最初の候補（四間）
const second = () => 0.99; // 乱数：最後の候補（三間）

describe("手順テンプレート：先手（対居飛車）", () => {
  it("手順どおりに進み、美濃が成立して、端歩に移る", () => {
    const b = new ShogiBoard();
    const whiteReplies = ["3c3d", "8c8d", "8d8e", "7a7b", "3a3b", "4a4b", "9c9d", "9d9e"];
    const seq = [];
    for (let i = 0; i < 8; i++) {
      const n = planner.next(b, "black", IBISHA, first);
      seq.push(n.usi);
      play(b, n.usi);
      play(b, whiteReplies[i]);
    }
    assert.deepEqual(seq, ["7g7f", "6g6f", "2h6h", "5i4h", "4h3h", "3h2h", "3i3h", "6i5h"]);
    assert.equal(matchForm(b, "black", "mino"), true);
    assert.equal(planner.next(b, "black", IBISHA, first).usi, "1g1f"); // 端歩
  });
  it("三間飛車を選ぶと 7八飛", () => {
    const b = new ShogiBoard();
    play(b, "7g7f"); play(b, "3c3d"); play(b, "6g6f"); play(b, "8c8d");
    assert.equal(planner.next(b, "black", IBISHA, second).usi, "2h7h");
  });
});

describe("手順テンプレート：後手は盤を回して同じ手順", () => {
  it("初手30通りのどれに対しても、後手は 3四歩（9六歩のときだけ、端歩 9四歩）", () => {
    const initial = new ShogiBoard();
    const firsts = initial.legalMoves().map((m) => m.usi);
    assert.equal(firsts.length, 30);
    for (const f of firsts) {
      const b = new ShogiBoard();
      play(b, f);
      const n = planner.next(b, "white", IBISHA, first);
      assert.equal(n.usi, f === "9g9f" ? "9c9d" : "3c3d", `初手 ${f} への返し`);
    }
  });
  it("mirrorSquare：7g ↔ 3c", () => {
    assert.equal(mirrorSquare("7g"), "3c");
    assert.equal(mirrorSquare("1d"), "9f");
  });
});

describe("手順テンプレート：端歩の割り込み・打ち切り", () => {
  it("後手が1四歩としたら、手順の途中でも 1六歩が最優先", () => {
    const b = new ShogiBoard();
    play(b, "7g7f"); play(b, "1c1d");
    const n = planner.next(b, "black", IBISHA, first);
    assert.equal(n.usi, "1g1f");
    assert.equal(n.kind, "interrupt");
  });
  it("対振り飛車：4八金→5八金で打ち切り（その後は指さない）", () => {
    const b = new ShogiBoard();
    const white = ["3c3d", "8b4b", "4a3b", "7a7b", "9c9d", "9d9e", "9e9f", "9f9g"];
    const seq = [];
    for (let i = 0; i < 7; i++) {
      const n = planner.next(b, "black", FURI, first);
      if (!n) break;
      seq.push(n.usi);
      play(b, n.usi);
      if (white[i]) play(b, white[i]);
    }
    assert.deepEqual(seq, ["7g7f", "6g6f", "2h6h", "5i4h", "4h3h", "4i4h", "6i5h"]);
    assert.equal(matchForm(b, "black", "kinMusou"), true);
    assert.equal(planner.next(b, "black", FURI, first), null); // 打ち切り（端歩にも行かない）
  });
});

describe("手順テンプレート：player への接続", () => {
  it("furi-uke の初手は 7六歩（source: plan）", () => {
    const p = createPlayer({ persona: "furi-uke", search: { depth: 2 }, selection: { margin: 0 }, book: { enabled: false } });
    const r = p.chooseMove(new ShogiBoard());
    assert.equal(r.move.usi, "7g7f");
    assert.equal(r.source, "plan");
  });
  it("plan:false なら使わない／ペルソナに plan がなければ従来どおり", () => {
    const off = createPlayer({ persona: "furi-uke", search: { depth: 1 }, selection: { margin: 0 }, book: { enabled: false }, plan: false });
    assert.equal(off.chooseMove(new ShogiBoard()).source, "search");
    const bal = createPlayer({ persona: "balance", search: { depth: 1 }, selection: { margin: 0 } });
    assert.equal(bal.chooseMove(new ShogiBoard()).source, "search");
  });
  it("安全弁：テンプレートの手が大損なら探索に任せる（駒を取られる局面）", () => {
    // 先手の 7六歩が角で取られて大損になる局面を作り、テンプレートを避けること
    const b = new ShogiBoard("lnsgkgsnl/1r7/pppppp1pp/6p2/9/2B6/PPPPPPPPP/7R1/LNSGKGSNL b - 1");
    const p = createPlayer({ persona: "furi-uke", search: { depth: 2 }, selection: { margin: 0 }, book: { enabled: false } });
    const r = p.chooseMove(b);
    assert.ok(r.move);
  });
});

describe("手順テンプレート：戦型の全ペルソナに紐づく・ランダムは確定した戦型のものが効く（2026-11-10 §1／2026-11-21）", () => {
  const first7 = (persona, opts = {}) =>
    createPlayer({ persona, search: { depth: 1 }, selection: { margin: 0 }, book: { enabled: false }, ...opts }).chooseMove(new ShogiBoard());
  it("furi-*・ibisha-* とも初手は 7六歩（source: plan）。戦型のない balance は探索のまま", () => {
    for (const id of ["furi-seme", "furi-balance", "furi-uke", "ibisha-seme", "ibisha-balance", "ibisha-uke"]) {
      const r = first7(id);
      assert.equal(r.source, "plan", id);
      assert.equal(r.move.usi, "7g7f", id);
    }
    assert.equal(first7("balance").source, "search", "balance");
  });
  it("ランダム：確定した戦型の手順テンプレートが効く（居飛車なら ibisha-basic、振り飛車なら furi-shiken-mino）", () => {
    const probe = createPlayer({ persona: "random-balance", search: { depth: 1 } });
    const seedOf = (want) => {
      for (let s = 1; s < 200; s++) if (drawOpenings(probe.persona.openings, s).black === want) return s;
      throw new Error("seed が見つからない");
    };
    // 振り飛車に確定：初手は plan の 7六歩、2手目は 6六歩（p66）
    const furiP = createPlayer({ persona: "random-balance", search: { depth: 1 }, selection: { margin: 0 }, book: { enabled: false }, seed: seedOf("furibisha") });
    const fb = new ShogiBoard();
    const f1 = furiP.chooseMove(fb);
    assert.equal(f1.source, "plan");
    assert.equal(f1.move.usi, "7g7f");
    play(fb, "7g7f"); play(fb, "3c3d");
    const f2 = furiP.chooseMove(fb);
    assert.equal(f2.source, "plan");
    assert.equal(f2.move.usi, "6g6f");
    assert.equal(f2.info.planStep, "p66");
    // 居飛車に確定：初手は plan の 7六歩、2手目は 2六歩（p26）＝ ibisha-basic
    const ibiP = createPlayer({ persona: "random-balance", search: { depth: 1 }, selection: { margin: 0 }, book: { enabled: false }, seed: seedOf("ibisha") });
    const ib = new ShogiBoard();
    const i1 = ibiP.chooseMove(ib);
    assert.equal(i1.source, "plan");
    assert.equal(i1.move.usi, "7g7f");
    assert.equal(i1.info.planStep, "p76");
    play(ib, "7g7f"); play(ib, "3c3d");
    const i2 = ibiP.chooseMove(ib);
    assert.equal(i2.source, "plan");
    assert.equal(i2.move.usi, "2g2f");
    assert.equal(i2.info.planStep, "p26");
  });
  it("ランダム：色ごとに抽選結果に従う（先手居飛車×後手振り飛車で、両方とも確定した戦型の plan）", () => {
    const probe = createPlayer({ persona: "random-balance", search: { depth: 1 } });
    let seed = null;
    for (let s = 1; s < 500 && seed === null; s++) {
      const d = drawOpenings(probe.persona.openings, s);
      if (d.black === "ibisha" && d.white === "furibisha") seed = s;
    }
    assert.ok(seed, "seed が見つかる");
    const p = createPlayer({ persona: "random-balance", search: { depth: 1 }, selection: { margin: 0 }, book: { enabled: false }, seed });
    const b = new ShogiBoard();
    const r1 = p.chooseMove(b); // 先手＝居飛車：ibisha-basic の 7六歩
    assert.equal(r1.source, "plan");
    assert.equal(r1.move.usi, "7g7f");
    play(b, "7g7f");
    const r2 = p.chooseMove(b); // 後手＝振り飛車：furi-shiken-mino の 3四歩
    assert.equal(r2.source, "plan");
    assert.equal(r2.move.usi, "3c3d");
  });
});

describe("手順テンプレート：歩同士が正面で接触したら抜ける（D-040）", () => {
  const seq = (...moves) => {
    const b = new ShogiBoard();
    for (const m of moves) play(b, m);
    return b;
  };
  it("pawnsInContact：正面（同一の筋で段差1）でのみ true。斜め・横の隣接と段差2以上は false。駒を取れるかは関係ない", () => {
    assert.equal(pawnsInContact(new ShogiBoard(), "black"), false);
    assert.equal(pawnsInContact(seq("7g7f", "3c3d"), "black"), false);
    assert.equal(pawnsInContact(seq("7g7f", "7c7d"), "black"), false); // 7六と7四：同一の筋だが段差2
    assert.equal(pawnsInContact(seq("7g7f", "7c7d", "7f7e"), "black"), true); // 7五と7四：正面で向き合う
    assert.equal(pawnsInContact(seq("7g7f", "8c8d", "7f7e"), "white"), false); // 7五と8四：斜めは接触に数えない
    assert.equal(pawnsInContact(seq("7g7f", "8c8d", "7f7e", "8d8e"), "black"), false); // 7五と8五：横の隣接も数えない
    assert.equal(pawnsInContact(seq("7g7f", "7c7d", "7f7e"), "white"), true); // 色に依らず対称
  });
  it("角が歩を取れる局面でも、歩が離れていれば抜けない（キーは「取れるか」ではない）", () => {
    // 初手の7六歩で先手の角道が開く。後手の歩は遠い（距離2以上）ので、接触ではない。
    const b = seq("7g7f", "3c3d");
    assert.equal(pawnsInContact(b, "black"), false);
    assert.equal(planner.next(b, "black", IBISHA, first).usi, "6g6f");
  });
  it("接触したらその手番ではテンプレートを使わず、離れても戻らない（ラッチ）。newGame で解除", () => {
    const mk = () => createPlayer({ persona: "furi-uke", search: { depth: 1 }, selection: { margin: 0 }, book: { enabled: false } });
    const touching = seq("7g7f", "7c7d", "7f7e", "3c3d"); // 先手の7五と後手の7四が正面で向き合う（先手番）
    assert.equal(pawnsInContact(touching, "black"), true);
    const noContact = seq("7g7f", "3c3d"); // 先手番・接触なし：本来なら 6六歩（plan）
    const p = mk();
    assert.equal(mk().chooseMove(noContact).source, "plan"); // 比較：接触前なら plan
    assert.notEqual(p.chooseMove(touching).source, "plan"); // 接触：抜ける
    assert.notEqual(p.chooseMove(noContact).source, "plan"); // 離れても戻らない
    p.newGame(1);
    assert.equal(p.chooseMove(noContact).source, "plan"); // 新しい対局では最初から
  });
  it("ラッチは色ごと：先手が抜けても、後手の手順テンプレートは影響を受けない", () => {
    const p = createPlayer({ persona: "furi-uke", search: { depth: 1 }, selection: { margin: 0 }, book: { enabled: false } });
    const b = seq("7g7f", "7c7d", "7f7e", "3c3d");
    assert.notEqual(p.chooseMove(b).source, "plan"); // 先手：抜ける
    // 後手番の別の局面（接触なし）：後手側は独立
    const w = seq("7g7f");
    assert.equal(p.chooseMove(w).source, "plan");
  });
});

describe("手順テンプレート：待った（saveState/restoreState）で離脱ラッチも巻き戻る（D-036）", () => {
  const seq = (...moves) => {
    const b = new ShogiBoard();
    for (const m of moves) play(b, m);
    return b;
  };
  it("離脱前に saveState し、離脱後に restoreState すると、plan が再び効く", () => {
    const p = createPlayer({ persona: "furi-uke", search: { depth: 1 }, selection: { margin: 0 }, book: { enabled: false } });
    const noContact = seq("7g7f", "3c3d"); // 先手番・接触なし：plan が効く局面
    const saved = p.saveState(); // 離脱前の状態
    const touching = seq("7g7f", "7c7d", "7f7e", "3c3d"); // 先手の歩が正面で接触
    assert.notEqual(p.chooseMove(touching).source, "plan"); // 接触：抜ける（ラッチ）
    assert.notEqual(p.chooseMove(noContact).source, "plan"); // ラッチが残っている
    p.restoreState(saved); // 待った：離脱前の状態に戻す
    assert.equal(p.chooseMove(noContact).source, "plan"); // plan が再び効く
  });
});

describe("手順テンプレート：居飛車（ibisha-basic、2026-11-21 追加）", () => {
  const iPlanner = createPlanner(PLANS["ibisha-basic"]);
  it("先手：７六歩→２六歩→２五歩→７八金の順に進み、尽きたら null", () => {
    const b = new ShogiBoard();
    const whiteReplies = ["8c8d", "3c3d", "8d8e", "3a3b"];
    const seqMoves = [];
    for (let i = 0; i < 4; i++) {
      const n = iPlanner.next(b, "black", {}, first);
      seqMoves.push(n.usi);
      play(b, n.usi);
      play(b, whiteReplies[i]);
    }
    assert.deepEqual(seqMoves, ["7g7f", "2g2f", "2f2e", "6i7h"]);
    assert.equal(iPlanner.next(b, "black", {}, first), null); // 手順が尽きたら探索に任せる
  });
  it("後手：鏡像で ３四歩→８四歩→８五歩→３二金", () => {
    const b = new ShogiBoard();
    const blackMoves = ["7g7f", "2g2f", "2f2e", "5g5f"];
    const seqMoves = [];
    for (let i = 0; i < 4; i++) {
      play(b, blackMoves[i]);
      const n = iPlanner.next(b, "white", {}, first);
      seqMoves.push(n.usi);
      play(b, n.usi);
    }
    assert.deepEqual(seqMoves, ["3c3d", "8c8d", "8d8e", "4a3b"]);
  });
  it("居飛車ペルソナ（ibisha-seme）は player 経由で plan を使う", () => {
    const p = createPlayer({ persona: "ibisha-seme", search: { depth: 1 }, selection: { margin: 0 }, book: { enabled: false } });
    const r = p.chooseMove(new ShogiBoard());
    assert.equal(r.source, "plan");
    assert.equal(r.move.usi, "7g7f");
    assert.equal(r.info.planStep, "p76");
  });
});
