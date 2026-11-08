/**
 * Character Shogi AI — web 版の起点。人間 vs AI の対局モード（docs/WEB-UI-PLAN.md の C）。
 * 盤・持ち駒の描画は流用元（ui/board-view.js・ui/player-info.js）、対局の進行は game/game.js、
 * ルールの判定はエンジンの ShogiBoard（engine/rules.js）、思考は Worker（engine/engine-client.js）。
 * ここはそれらを画面につなぐだけ。設定は 既定 < 保存済み（localStorage）< URL のクエリ（game/settings.js）。設定画面とログの書き出しは ui/menu-sheet.js。
 */
import { loadLayouts } from "./assets/layout-loader.js";
import { loadAssetManifest } from "./assets/asset-manifest.js";
import { initBoardView, renderBoard } from "./ui/board-view.js";
import { renderHandPieces, renderPlayerInfoBox } from "./ui/player-info.js";
import { createInitialBoardState } from "./models/board.js";
import { computeLayoutSizes } from "./layout.js";
import { createRules } from "./engine/rules.js";
import { createEngineClient } from "./engine/engine-client.js";
import { createGame } from "./game/game.js";
import { buildSettings, rawFromSearch, resolveRaw, loadSavedRaw, saveRaw } from "./game/settings.js";
import { describeResult } from "./game/termination.js";
import { logToKif } from "./game/kif.js";
import { addLog, listLogs, removeLog, logFileBase, logSummary } from "./game/log-store.js";
import { createMenuSheet } from "./ui/menu-sheet.js";
import { PERSONAS } from "../../src/characters/personas/index.js";
import { formatClock } from "./game/clock.js";
import { createPromotionPopup } from "./ui/promotion-popup.js";
import { renderTargetMarks, squareAtPoint } from "./ui/target-marks.js";

const OPPONENT_HAND_ORDER = ["HI", "KA", "KI", "GI", "KE", "KY", "FU"]; // 右詰め
const SELF_HAND_ORDER = ["FU", "KY", "KE", "GI", "KI", "KA", "HI"]; // 左詰め

const look = { boardId: "wood", pieceId: "maki_ryoko_1_letter" };
const $ = (id) => document.getElementById(id);

let layouts = null;
let manifest = null;
let lastPieceH = null;
let game = null;
let popup = null;
let settings = null; // 検証済みの設定（buildSettings の結果）
let rawSettings = null; // 入力欄の値（文字列）
let engine = null;
let rules = null;
let menu = null;
let current = { phase: "idle", boardState: createInitialBoardState(null), lastMove: null, selection: null, targets: [], humanSide: "SENTE" };

function renderAll() {
  const frame = $("app-frame");
  const boardEl = $("board");
  const sizes = computeLayoutSizes(frame, boardEl, layouts.boardLayout);
  if (sizes) {
    const h = Math.round(sizes.squareSize.height);
    if (h !== lastPieceH) {
      lastPieceH = h;
      document.documentElement.style.setProperty("--piece-h", `${h}px`);
    }
  }
  const v = current;
  const bs = v.boardState;
  const sel = v.selection;
  renderBoard(bs, look.boardId, { sente: look.pieceId, gote: look.pieceId },
    sel && sel.origin === "BOARD" ? sel : null, v.lastMove,
    sizes ? { width: sizes.boardWrapWidth, height: sizes.boardWrapHeight } : null);
  renderTargetMarks(boardEl, layouts.boardLayout, bs, v.targets);
  if (!sizes) return;

  const topHand = bs.isFlipped ? bs.handSente : bs.handGote;
  const bottomHand = bs.isFlipped ? bs.handGote : bs.handSente;
  const selHand = sel && sel.origin === "HAND" ? sel.pieceType : null; // 選べるのは自分の持ち駒（画面手前）だけ
  // 画面奥の持ち駒は常に倒立、手前は常に正立（流用元の規約）
  renderHandPieces(topHand, "RIGHT", OPPONENT_HAND_ORDER, $("opponent-hand"), null,
    sizes.squareSize, look.pieceId, layouts.pieceLayout, layouts.pieceFit, manifest, "GOTE");
  renderHandPieces(bottomHand, "LEFT", SELF_HAND_ORDER, $("self-hand"), selHand,
    sizes.squareSize, look.pieceId, layouts.pieceLayout, layouts.pieceFit, manifest, "SENTE");

  const oppSide = bs.isFlipped ? "SENTE" : "GOTE";
  const selfSide = bs.isFlipped ? "GOTE" : "SENTE";
  const personaId = game?.getLog()?.engine?.personaId ?? settings?.config.persona;
  renderPlayerInfoBox($("opponent-label"), $("opponent-name"), oppSide, personaId ? `AI（${personaId}）` : "AI", null);
  renderPlayerInfoBox($("self-label"), $("self-name"), selfSide, "あなた", null);
}

/** 状態表示（1行目＝いまの状況、2行目＝補足）とボタンの有効/無効 */
function renderStatus() {
  const v = current;
  let line = "";
  let sub = "";
  let alert = false;
  switch (v.phase) {
    case "idle": line = "準備しています…"; break;
    case "human": line = "あなたの番です"; if (v.inCheck) { line = "王手がかかっています"; alert = true; } break;
    case "choosing": line = "成りますか？"; break;
    case "ai": line = "AI が考えています…"; break;
    case "over": line = describeResult(v.result, v.humanSide) || "対局終了"; alert = true; break;
  }
  if (v.message) sub = v.message;
  else if (v.phase !== "idle") sub = `${v.plies} 手`;
  if (v.phase === "over" && v.result?.error) sub = v.result.error;
  $("status-line").textContent = line;
  $("status-line").classList.toggle("status-line--alert", alert);
  $("status-sub").textContent = sub;
  $("btn-resign").disabled = !["human", "choosing", "ai"].includes(v.phase);
}

function renderClocks() {
  if (!game) return;
  const ms = game.clockMs();
  const ai = current.aiSide ?? "GOTE";
  const me = current.humanSide;
  $("self-clock").textContent = formatClock(ms[me]);
  $("opponent-clock").textContent = formatClock(ms[ai]);
  const live = current.phase === "over" || current.phase === "idle" ? null : current.turn;
  $("self-clock").classList.toggle("player-clock--active", live === me);
  $("opponent-clock").classList.toggle("player-clock--active", live === ai);
}

function onGameChange(v) {
  current = v;
  if (v.phase === "over") popup?.close();
  renderAll();
  renderStatus();
  renderClocks();
}

/** 終局（中断を含む）時に対局ログを保存。リロードで消えないように */
function saveLog(log) {
  try {
    addLog(localStorage, log);
    menu?.refreshLogs();
  } catch (e) {
    console.warn("対局ログを localStorage に保存できませんでした", e);
  }
}

/** ファイルとして保存（iOS Safari も download 属性で「ファイル」に保存できる） */
function download(filename, text, mime = "application/octet-stream") {
  const url = URL.createObjectURL(new Blob([text], { type: `${mime};charset=utf-8` }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

const logActions = {
  kif: (log) => download(`${logFileBase(log)}.kif`, logToKif(log)),
  json: (log) => download(`${logFileBase(log)}.json`, JSON.stringify(log, null, 2)),
  all: () => download(`csai-logs-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(listLogs(localStorage), null, 2)),
  remove: (log) => { removeLog(localStorage, log.id); },
  copy: async (log) => {
    try {
      await navigator.clipboard.writeText(logToKif(log));
      alert("KIF をコピーしました");
    } catch (e) {
      alert(`コピーできませんでした: ${e.message}`);
    }
  },
};

function setupInput() {
  $("board").addEventListener("click", (e) => {
    if (!game) return;
    const sq = squareAtPoint($("board"), layouts.boardLayout, current.boardState, e.clientX, e.clientY);
    if (sq) game.tapSquare(sq);
  });
  for (const id of ["opponent-hand", "self-hand"]) {
    $(id).addEventListener("click", (e) => {
      const el = e.target.closest(".hand-piece");
      if (!el || !game) return;
      const flipped = current.boardState.isFlipped;
      const isOpponent = id === "opponent-hand";
      const side = isOpponent ? (flipped ? "SENTE" : "GOTE") : (flipped ? "GOTE" : "SENTE");
      game.tapHandPiece(side, el.dataset.pieceType);
    });
  }
  $("btn-resign").addEventListener("click", () => {
    if (confirm("投了しますか？")) game.resign();
  });
  $("btn-new").addEventListener("click", () => {
    if (["human", "choosing", "ai"].includes(current.phase) && !confirm("いまの対局を中止して、新しく始めますか？（中断として記録します）")) return;
    popup.close();
    newGame();
  });
  $("btn-menu").addEventListener("click", () => menu.open("settings"));
}

/** いまの設定で新しい対局を始める。指している対局があれば中断として記録する */
function newGame() {
  game?.abandon();
  const thisGame = createGame({
    rules,
    engine,
    humanSide: settings.humanSide,
    config: settings.config,
    seed: settings.seed,
    playStyle: settings.playStyle,
    meta: { settingsRaw: rawSettings },
    ...(settings.maxMoves ? { maxMoves: settings.maxMoves } : {}),
    askPromotion: (pieceType) => popup.ask(pieceType),
    onChange: (v) => { if (game === thisGame) onGameChange(v); }, // 破棄した対局の遅れた通知は無視する
    saveLog,
  });
  game = thisGame;
  startGame();
}

async function startGame() {
  try {
    await game.start();
  } catch (e) {
    console.error(e);
    $("status-line").textContent = `対局を始められません: ${e.message}`;
    $("status-line").classList.add("status-line--alert");
  }
}

async function init() {
  [layouts, manifest] = await Promise.all([loadLayouts(), loadAssetManifest()]);
  popup = createPromotionPopup({ layouts, manifest, pieceId: look.pieceId });
  rules = createRules();
  engine = createEngineClient();
  menu = createMenuSheet({
    personas: PERSONAS,
    getRaw: () => rawSettings,
    onApply: (raw) => {
      const built = buildSettings(raw); // 不正ならここで Error（シートに表示される）
      if (["human", "choosing", "ai"].includes(current.phase) && !confirm("いまの対局を中止して、この設定で新しく始めますか？（中断として記録します）")) throw new Error("キャンセルしました");
      rawSettings = { ...raw };
      settings = built;
      saveRaw(localStorage, rawSettings);
      popup.close();
      newGame();
    },
    getLogs: () => listLogs(localStorage),
    actions: logActions,
    summary: (log) => logSummary(log, describeResult),
  });
  // 検証用（?debug=1 のときだけ）。画面の自動操作の試験が、対局の手順（ログ）を読むための窓口。通常は付けない
  if (new URLSearchParams(location.search).get("debug") === "1") window.__csai = { getLog: () => game?.getLog(), view: () => game?.view() ?? current };
  initBoardView($("board"), layouts, manifest, renderAll);
  setupInput();
  renderAll();
  renderStatus();
  addEventListener("resize", renderAll);
  setInterval(renderClocks, 250);

  // 設定：既定 < 保存済み < URL。不正なら黙って直さず、設定画面を開いて理由を見せる
  rawSettings = resolveRaw({ saved: loadSavedRaw(localStorage), url: rawFromSearch(location.search) });
  try {
    settings = buildSettings(rawSettings);
  } catch (e) {
    $("status-line").textContent = "設定を確認してください";
    $("status-line").classList.add("status-line--alert");
    menu.open("settings", e.message);
    return;
  }
  newGame();
}

init().catch((e) => {
  console.error(e);
  $("status-line").textContent = `初期化に失敗: ${e.message}`;
  $("status-line").classList.add("status-line--alert");
});
