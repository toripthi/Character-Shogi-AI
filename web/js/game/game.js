/**
 * 対局の進行（人間 vs AI）。DOM に依存しない。ルールは rules（エンジンの ShogiBoard）、思考は engine（Worker）に任せ、
 * ここでは「手番の管理・盤面（UI の BoardState）の更新・終局・時計・ログ」だけを持つ。
 *
 * 「待った」（takeback）：人間が最後に指した手とそれ以降（AI の応手）を取り消し、人間の手番に戻す。回数はこの中（ログ）に持つ。
 *
 * 状態（phase）: 'idle'（未開始）/ 'human'（人間の入力待ち）/ 'choosing'（成り選択中）/ 'ai'（AI 思考中）/ 'over'（終局）
 * 指し手の確定口は commit() 1本。人間の手も AI の手も、必ず rules.play() が true を返したものだけを盤に反映する。
 */
import { createInitialBoardState } from "../models/board.js";
import { applyUsi } from "../engine/usi.js";
import { tapBoard, tapHand, targetsOf } from "./input.js";
import { judgeEnd, DEFAULT_MAX_MOVES } from "./termination.js";
import { createClock } from "./clock.js";
import { remainingMs } from "./time-control.js";

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
 * @param {object} [o.meta] ログにそのまま足す情報（入力欄の値など。再現用）
 * @param {(pieceType:string, side:string)=>Promise<boolean|'CANCEL'>} [o.askPromotion] 成り選択（true=成る）
 * @param {object|null} [o.timeControl] 持ち時間（game/time-control.js の control。null＝無制限）。時間切れの側が負け
 * @param {string} [o.startMessage] 対局開始時に状態表示へ出す一言（振り駒の結果など）。最初の手を指すと消える
 * @param {(view:object)=>void} [o.onChange]
 * @param {(log:object)=>void} [o.saveLog] 終局時に呼ぶ（保存は呼び出し側）
 */
export function createGame({
  rules, engine, humanSide = "SENTE", config = {}, seed, playStyle = null, meta = {}, maxMoves = DEFAULT_MAX_MOVES,
  timeControl = null, startMessage = "",
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
  let takebackCount = 0; // 「待った」をした回数（この対局の合計。ログの takebackCount に入る）

  const emit = () => onChange(view());

  function view() {
    return {
      phase, humanSide, aiSide, boardState, lastMove, selection, result, message,
      turn: rules.turn(),
      inCheck: phase !== "over" && rules.inCheck(),
      plies: moveLog.length,
      takebacks: takebackCount,
      timeControl,
      canTakeback: canTakeback(),
      targets: phase === "human" || phase === "choosing" ? targetsOf(selection, rules.legalUsis()) : [],
    };
  }

  /** 時計の表示用。{ SENTE, GOTE }（ms） */
  const clockMs = () => ({ SENTE: clock.elapsed("SENTE"), GOTE: clock.elapsed("GOTE") });

  /** 各側の残り時間（ms）。無制限なら null。マイナスにはならない（0 で止める） */
  function remaining() {
    if (!timeControl) return null;
    const one = (side) => Math.max(0, remainingMs(timeControl, {
      elapsedMs: clock.elapsed(side), turnMs: clock.turnElapsed(), onMove: clock.running() === side,
      moves: moveLog.filter((m) => m.side === side).length,
    }));
    return { SENTE: one("SENTE"), GOTE: one("GOTE") };
  }

  /** いま手番の側の時間が切れていたら、その側の負けで終局する（時間切れ）。終局したら true。画面の定期処理から呼ぶ */
  function checkTimeout() {
    if (!timeControl || (phase !== "human" && phase !== "ai" && phase !== "choosing")) return false;
    const side = rules.turn();
    const left = remaining()[side];
    if (left > 0) return false;
    const wasThinking = phase === "ai";
    finish({ over: true, reason: "timeout", winner: other(side), loser: side });
    if (wasThinking) engine.restart();
    return true;
  }

  async function start() {
    const myToken = ++token;
    if (phase === "ai") engine.restart();
    rules.reset();
    boardState = createInitialBoardState(null);
    boardState.isFlipped = humanSide === "GOTE";
    lastMove = null; selection = null; result = null; message = startMessage; moveLog = []; takebackCount = 0;
    keys = [positionKey(rules)]; checks = [false];
    clock.reset();
    phase = "idle";
    emit();

    const effective = await engine.newGame({ config, seed });
    if (myToken !== token) return; // 開始中にまた start された
    log = { version: 1, startedAt: new Date(now()).toISOString(), humanSide, playStyle, maxMoves, timeControl, config, engine: effective, ...meta, takebackCount: 0, moves: [], result: null };
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
    // 時間が切れてから届いた手は指させない（その側の時間切れ負け）
    if (timeControl && remaining()[side] <= 0) {
      const wasThinking = phase === "ai";
      finish({ over: true, reason: "timeout", winner: other(side), loser: side });
      if (wasThinking) engine.restart();
      return;
    }
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
    if (timeControl) log.remainingMs = remaining();
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

  /** 人間が最後に指した手の番号（moveLog の添字）。まだ指していなければ -1 */
  const lastHumanIndex = () => moveLog.map((m) => m.by).lastIndexOf("human");

  /** 「待った」ができるか：人間の手番か AI の思考中で、人間が1手以上指している */
  function canTakeback() {
    return (phase === "human" || phase === "ai") && lastHumanIndex() >= 0;
  }

  /**
   * 「待った」：人間が最後に指した手以降を取り消し、その手を指す前の局面（人間の手番）に戻す。
   *  - 人間の手番のとき：AI の応手と、人間の手の 2 手を戻す（先手なら初手に戻れる）。
   *  - AI の思考中のとき：人間の手 1 手を戻す。AI の思考の結果は捨てる（思考は Worker の中で終わるまで続くが、反映しない）。
   * 時計は戻さない（待った中も経過時間は進む）。回数は takebackCount とログの takebackCount・各手の takebacks に持つ。
   * @returns {boolean} 実行したか
   */
  function takeback() {
    if (!canTakeback()) return false;
    const target = lastHumanIndex(); // この手数まで戻す（moveLog[0..target-1] を残す）
    token++; // AI の遅れて戻る結果を捨てる

    // 取り消す手に付いていた「待った」の印は、戻した先の手へ引き継ぐ（KIF の *待った は最後に残った手の下に書く）
    const carried = moveLog.slice(target).reduce((n, m) => n + (m.takebacks ?? 0), 0) + 1;
    moveLog = moveLog.slice(0, target);
    log.moves.length = target;
    if (target > 0) {
      moveLog[target - 1] = { ...moveLog[target - 1], takebacks: (moveLog[target - 1].takebacks ?? 0) + carried };
      log.moves[target - 1] = moveLog[target - 1];
    } else {
      log.takebacksAtStart = (log.takebacksAtStart ?? 0) + carried;
    }
    takebackCount++;
    log.takebackCount = takebackCount;

    // 盤・ルール・千日手の履歴を戻す
    rules.rewind(target);
    let bs = createInitialBoardState(null);
    let last = null;
    for (let i = 0; i < target; i++) {
      const applied = applyUsi(bs, moveLog[i].usi, i % 2 === 0 ? "SENTE" : "GOTE");
      bs = applied.boardState;
      last = applied.move;
    }
    boardState = bs;
    boardState.isFlipped = humanSide === "GOTE";
    lastMove = last;
    keys = keys.slice(0, target + 1);
    checks = checks.slice(0, target + 1);
    selection = null;
    message = "待ったしました";

    // 時計は止めずに、人間の番にする（AI が考えていたときだけ切り替える。人間の番のままなら計り直さない）
    if (clock.running() !== humanSide) clock.switchTo(humanSide);

    // AI の内部状態も、その局面を考える前に戻す（思考中なら、その思考が終わってから Worker が順に処理する）
    try {
      const p = engine.rollback?.(target);
      p?.catch?.((e) => console.warn("エンジンの状態を戻せませんでした", e));
    } catch (e) {
      console.warn("エンジンの状態を戻せませんでした", e);
    }
    phase = "human";
    emit();
    return true;
  }

  /** 投了（人間側）。AI が考えていても打ち切る */
  function resign() {
    if (phase !== "human" && phase !== "ai" && phase !== "choosing") return;
    const wasThinking = phase === "ai";
    finish({ over: true, reason: "resign", winner: aiSide, loser: humanSide });
    if (wasThinking) engine.restart();
  }

  /**
   * 対局を途中でやめる（新しい対局を始める前など）。1手以上指していれば「中断」として対局ログを残す。
   * 0手なら何も残さない。AI が考えていれば打ち切る。
   */
  function abandon() {
    if (phase !== "human" && phase !== "ai" && phase !== "choosing") return;
    const wasThinking = phase === "ai";
    if (moveLog.length > 0) {
      finish({ over: true, reason: "abandoned", winner: null });
    } else {
      token++;
      clock.stop();
      phase = "over";
      selection = null;
    }
    if (wasThinking) engine.restart();
  }

  return { start, tapSquare, tapHandPiece, resign, abandon, takeback, canTakeback, checkTimeout, view, clockMs, remainingMs: remaining, getLog: () => log, phase: () => phase };
}
