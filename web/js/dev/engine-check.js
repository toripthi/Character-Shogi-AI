/**
 * B 段階の部品（Worker のエンジン・USI 変換・ルール盤）を実ブラウザで通す自己点検。
 * 結果は画面に出し、window.__engineCheck にも入れる（自動確認用）。
 */
import { createEngineClient } from "../engine/engine-client.js";
import { createRules } from "../engine/rules.js";
import { applyUsi, boardStateToSfen } from "../engine/usi.js";
import { createInitialBoardState } from "../models/board.js";
import { buildSettings } from "../game/settings.js";

const list = document.getElementById("list");
const results = [];
const head3 = (sfen) => sfen.split(" ").slice(0, 3).join(" ");

async function check(name, fn) {
  const li = document.createElement("li");
  li.className = "run";
  li.textContent = name;
  list.append(li);
  try {
    const detail = await fn();
    li.className = "pass";
    if (detail) li.insertAdjacentHTML("beforeend", `<small>${detail}</small>`);
    results.push({ name, ok: true, detail });
  } catch (e) {
    li.className = "fail";
    li.insertAdjacentHTML("beforeend", `<small>${String(e.message ?? e)}</small>`);
    results.push({ name, ok: false, error: String(e.message ?? e) });
  }
}
const must = (cond, msg) => { if (!cond) throw new Error(msg); };

const engine = createEngineClient();
const CONFIG = { persona: "balance", search: { depth: 2 } };

await check("Worker が起動し、newGame が実際の設定（seed 込み）を返す", async () => {
  const eff = await engine.newGame({ config: CONFIG, seed: 1 });
  must(eff.seed === 1 && eff.personaId === "balance" && eff.search.depth === 2, JSON.stringify(eff));
  return `seed=${eff.seed} persona=${eff.personaId} depth=${eff.search.depth}`;
});

await check("初形から1手選び、メインスレッドのルール盤で合法", async () => {
  const rules = createRules();
  const r = await engine.think(rules.moves());
  must(r.usi && rules.isLegal(r.usi), `不正な手: ${r.usi}`);
  return `${r.usi}（${r.source}, ${Math.round(r.info.ms)}ms）`;
});

await check("人間役（ランダム）とAIで24手指し、AIの手がすべて合法・UI の盤とルール盤が一致", async () => {
  await engine.newGame({ config: CONFIG, seed: 3 });
  const rules = createRules();
  let ui = createInitialBoardState(null);
  let maxMs = 0, aiMoves = 0;
  for (let ply = 0; ply < 24; ply++) {
    const side = rules.turn();
    let usi;
    if (ply % 2 === 0) {
      const legal = rules.legalUsis();
      usi = legal[(ply * 7 + 3) % legal.length]; // 人間役: 決まった疑似乱数
    } else {
      const r = await engine.think(rules.moves());
      must(r.usi && rules.isLegal(r.usi), `${ply + 1}手目 AI の不正な手: ${r.usi}`);
      usi = r.usi; aiMoves++; maxMs = Math.max(maxMs, r.info.ms);
    }
    must(rules.play(usi), `${ply + 1}手目 ${usi} を指せない`);
    ui = applyUsi(ui, usi, side).boardState;
    must(head3(boardStateToSfen(ui, rules.turn())) === head3(rules.sfen()), `${ply + 1}手目 ${usi} の後で UI とルール盤が不一致`);
  }
  return `AI ${aiMoves}手、最長 ${Math.round(maxMs)}ms`;
});

await check("定跡（Worker が data/book/book.json を取得）：ibisha-seme は初手で定跡を引く", async () => {
  await engine.newGame({ config: { persona: "ibisha-seme", search: { depth: 2 }, book: { enabled: true } }, seed: 1 });
  const r = await engine.think([]);
  must(r.source === "book", `source=${r.source}`);
  return `${r.usi}（候補 ${r.info.candidates}件）`;
});

await check("不正な手順は、何手目かを示して失敗する（Worker は生きている）", async () => {
  await engine.newGame({ config: CONFIG, seed: 1 });
  let msg = null;
  try { await engine.think(["7g7f", "7g7f"]); } catch (e) { msg = e.message; }
  must(msg && msg.includes("2手目"), `メッセージ: ${msg}`);
  const r = await engine.think([]);
  must(r.usi, "失敗の後に思考できない");
  return msg;
});

await check("restart：思考中でも打ち切れて、作り直した Worker がすぐ使える", async () => {
  await engine.newGame({ config: { persona: "seme", search: { depth: 4, maxNodes: 3000000, maxDepth: 4 } }, seed: 1 });
  const slow = engine.think(["7g7f", "3c3d", "2g2f", "8c8d", "2f2e", "8d8e"]);
  const outcome = slow.then(() => "終了", (e) => e.message);
  engine.restart();
  const msg = await outcome;
  must(msg.includes("作り直し"), `打ち切りの結果: ${msg}`);
  await engine.newGame({ config: CONFIG, seed: 1 });
  const r = await engine.think([]);
  must(r.usi, "restart の後に思考できない");
  return msg;
});

await check("E：固定 seed で、match.js の実対局と同じ手を選ぶ（本物の Worker・設定画面と同じ設定の組み立て）", async () => {
  const fixture = await (await fetch(new URL("../../dev/parity-fixture.json", import.meta.url))).json();
  let ai = 0, games = 0;
  for (const c of fixture.cases) {
    for (const g of c.games) {
      const { config } = buildSettings({ ...c.raw, seed: String(g.seedA), side: g.aBlack ? "gote" : "sente" });
      await engine.newGame({ config, seed: g.seedA });
      for (let ply = 0; ply < g.usi.length; ply++) {
        if (g.aBlack ? ply % 2 !== 0 : ply % 2 !== 1) continue; // 人間役（match.js の B）の手は与えるだけ
        const r = await engine.think(g.usi.slice(0, ply));
        must(r.usi === g.usi[ply] && r.source === g.sources[ply], `${c.name}／AI は${g.aBlack ? "先手" : "後手"}／${ply + 1}手目：match.js は ${g.usi[ply]}(${g.sources[ply]})、Worker は ${r.usi}(${r.source})`);
        ai++;
      }
      games++;
    }
  }
  return `${games}局・AIの${ai}手がすべて一致`;
});

engine.terminate();
const failed = results.filter((r) => !r.ok).length;
document.getElementById("summary").textContent = failed === 0 ? `すべて通過（${results.length}件）` : `${failed}件が失敗（全${results.length}件）`;
window.__engineCheck = { done: true, failed, results };
