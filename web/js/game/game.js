/**
 * 対局の進行（人間 vs AI）。DOM に依存しない。ルールは rules（エンジンの ShogiBoard）、思考は engine（Worker）に任せ、
 * ここでは「手番の管理・盤面（UI の BoardState）の更新・終局・時計・ログ」だけを持つ。
 *
 * 状態（phase）: 'idle'（未開始）/ 'human'（人間の入力待ち）/ 'choosing'（成り選択中）/ 'ai'（AI 思考中）/ 'over'（終局）
 * 指し手の確定口は commit() 1本。人間の手も AI の手も、必ず rules.play() が true を返したものだけを盤に反映する。
 */
import { createInitialBoardState } from "../models/board.js";
import { applyUsi } from "../engine/usi.js";
import { tapBoard, tapHand, targetsOf } from "./input.js";
import { judgeEnd, DEFAULT_MAX_MOVES } from "./termination.js";
import { createClock } from "./clock.js";

const other = (side) => (side === "SENTE" ? "GOTE" : "SENTE");
const positionKey = (rules) => rules.sfen().split(" ").slice(0, 3).join(" "); // 盤・手番・持ち駒（手数は除く）

/**
 * @param {object} o
 * @param {object} o.rules  createRules() の戻り値
 * @param {object} o.engine createEngineClient() の戻り値（newGame / think / restart）
 * @param {'SENTE'|'GOTE'} [o.humanSide]
 * @param {object} [o.config]  エンジンの設定（createPlayer のオプション）
 * @param {number} [o.seed]
 * @param {string} [o.playStyle] 指し方の記録欄（「真面目」「雑な早指し」「変則」など。ログに残すだけ）
 * @param {(pieceType:string, side:string)=>Promise<boolean|'CANCEL'>} [o.askPromotion] 成り選択（true=成る）
 * @param {(view:object)=>void} [o.onChange]
 * @param {(log:object)=>void} [o.saveLog] 終局時に呼ぶ（保存は呼び出し側）
 */
export function createGame({
  rules, engine, humanSide = "SENTE", config = {}, seed, playStyle = null, maxMoves = DEFAULT_MAX_MOVES,
  minAiDelayMs = 350, now = () => Date.now(), sleep = (ms) => new Promise((r) => setTimeout(r, ms)),
  askPromotion = async () => false, onChange = () => {}, saveLog = () => {},
}) {
  const aiSide = other(humanSide);
  const clock = createClock({ now });

  let phase = "idle";
  let token = 0; // 開始・投了・中断のたびに増やし、古い非同期の戻りを捨てる
  let boardState = null;
  let lastMove = null;
  let selection = null;
  let result = null;
  let message = "";
  let keys = [];
  let checks = [];
  let log = null;
  let moveLog = [];

  const emit = () => onChange(view());

  function view() {
    return {
      phase, humanSide, aiSide, boardState, lastMove, selection, result, message,
      turn: rules.turn(),
      inCheck: phase !== "over" && rules.inCheck(),
      plies: moveLog.length,
      targets: phase === "human" || phase === "choosing" ? targetsOf(selection, rules.legalUsis()) : [],
    };
  }

  /** 時計の表示用。{ SENTE, GOTE }（ms） */
  const clockMs = () => ({ SENTE: clock.elapsed("SENTE"), GOTE: clock.elapsed("GOTE") });

  async function start() {
    const myToken = ++token;
    if (phase === "ai") engine.restart();
    rules.reset();
    boardState = createInitialBoardState(null);
    boardState.isFlipped = humanSide === "GOTE";
    lastMove = null; selection = null; result = null; message = ""; moveLog = [];
    keys = [positionKey(rules)]; checks = [false];
    clock.reset();
    phase = "idle";
    emit();

    const effective = await engine.newGame({ config, seed });
    if (myToken !== token) return; // 開始中にまた start された
    log = { version: 1, startedAt: new Date(now()).toISOString(), humanSide, playStyle, maxMoves, config, engine: effective, moves: [], result: null };
    clock.start("SENTE");
    nextTurn();
  }

  function nextTurn() {
    if (rules.turn() === humanSide) {
      phase = "human";
      emit();
    } else {
      phase = "ai";
      emit();
      requestAi();
    }
  }

  async function requestAi() {
    const myToken = token;
    try {
      const [r] = await Promise.all([engine.think(rules.moves()), sleep(minAiDelayMs)]);
      if (myToken !== token) return;
      if (r.usi == null) return finish({ over: true, reason: "checkmate", winner: humanSide });
      if (!rules.isLegal(r.usi)) throw new Error(`エンジンが違法手を返しました: ${r.usi}`);
      commit(r.usi, "ai", { source: r.source, score: r.info?.score ?? null, depth: r.info?.depth ?? null, nodes: r.info?.nodes ?? null, engineMs: r.info?.ms ?? null, opening: r.opening ?? null });
    } catch (e) {
      if (myToken !== token) return; // 中断（restart）による失敗は無視
      console.error(e);
      message = String(e.message ?? e);
      finish({ over: true, reason: "engine-error", winner: null, error: message });
    }
  }

  /** 指し手の確定口。rules.play が true の手だけ盤に反映する */
  function commit(usi, by, meta = {}) {
    const side = rules.turn();
    if (!rules.play(usi)) throw new Error(`違法手です: ${usi}`);
    const applied = applyUsi(boardState, usi, side);
    boardState = applied.boardState;
    boardState.isFlipped = humanSide === "GOTE";
    lastMove = applied.move;
    selection = null;
    message = "";

    const used = clock.switchTo(other(side));
    keys.push(positionKey(rules));
    checks.push(rules.inCheck());
    const entry = { ply: moveLog.length + 1, side, usi, by, ms: used, ...meta };
    moveLog.push(entry);
    log.moves.push(entry);

    const ended = rules.result().over ? rules.result() : judgeEnd({ keys, checks, maxMoves });
    if (ended) return finish(ended);
    nextTurn();
  }

  function finish(res) {
    token++; // 戻ってくる非同期を捨てる
    clock.stop();
    result = res;
    phase = "over";
    selection = null;
    log.result = { reason: res.reason, winner: res.winner ?? null, ...(res.error ? { error: res.error } : {}) };
    log.endedAt = new Date(now()).toISOString();
    log.totalMs = clockMs();
    log.usi = rules.moves();
    try { saveLog(log); } catch (e) { console.error("対局ログの保存に失敗", e); }
    emit();
  }

  /** 盤のタップ（square は {file, rank}） */
  async function tapSquare(square) {
    if (phase !== "human") return;
    const r = tapBoard({ square, selection, boardState, humanSide, legalUsis: rules.legalUsis() });
    selection = r.selection;
    if (r.play) return commit(r.play, "human");
    if (r.choose) {
      const myToken = token;
      phase = "choosing";
      emit();
      const ans = await askPromotion(selection.pieceType, humanSide);
      if (myToken !== token) return;
      phase = "human";
      if (ans === "CANCEL") { selection = null; emit(); return; }
      return commit(ans ? r.choose[1] : r.choose[0], "human");
    }
    emit();
  }

  /** 持ち駒のタップ */
  function tapHandPiece(side, pieceType) {
    if (phase !== "human") return;
    const r = tapHand({ side, pieceType, selection, humanSide, legalUsis: rules.legalUsis() });
    selection = r.selection;
    message = r.message ?? "";
    emit();
  }

  /** 投了（人間側）。AI が考えていても打ち切る */
  function resign() {
    if (phase !== "human" && phase !== "ai" && phase !== "choosing") return;
    const wasThinking = phase === "ai";
    finish({ over: true, reason: "resign", winner: aiSide, loser: humanSide });
    if (wasThinking) engine.restart();
  }

  return { start, tapSquare, tapHandPiece, resign, view, clockMs, getLog: () => log, phase: () => phase };
}
