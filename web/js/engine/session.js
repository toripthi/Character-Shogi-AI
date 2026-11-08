/**
 * エンジンの1局分の状態（Worker の中身。Worker に依存しないので Node のテストからも直接使える）。
 *
 * 局面は「平手からの USI の手順」で受け取り、毎回その場で再生して盤を作る。
 * （UI の盤状態→SFEN の変換を書かずに済む。千日手判定やログも、同じ手順がそのまま使える。）
 * player（createPlayer）は局内で状態（定跡の自手数・戦法の抽選・置換表）を持つので、
 * 1局につき1つ作り、newGame で作り直す。AI の手番でだけ think を呼ぶ使い方で問題ない
 * （match.js の「各手番に別々の player」と同じ使い方）。
 */
import { ShogiBoard, createPlayer } from "../../../src/index.js";

const PLAIN = (v) => v === null || ["number", "string", "boolean"].includes(typeof v);

/**
 * info から、Worker のメッセージで送れる素直な値（数値・文字列・真偽・null）と、定跡の出典行（entryLines）だけを取り出す。
 * score / depth / nodes / qnodes / ms は常に入る。定跡の手では candidates（使えた候補の件数）と entryLines も入る。
 */
export function plainInfo(info) {
  const out = {};
  for (const [k, v] of Object.entries(info ?? {})) {
    if (PLAIN(v)) out[k] = v;
  }
  if (Array.isArray(info?.entryLines)) out.entryLines = [...info.entryLines];
  return out;
}

export function createEngineSession() {
  let player = null;
  let effective = null;

  /**
   * 新しい対局を始める。
   * @param {{config?:object, seed?:number, bookData?:object}} opts
   *   config は createPlayer のオプション（persona, search, selection, book:{enabled, skipRate, ...}）。
   *   book.enabled のときは bookData（book.json の中身）が必要。seed を省くと現在時刻から決める。
   * @returns 実際に使われた設定（seed 込み）。局ログに残す。
   */
  function newGame({ config = {}, seed, bookData } = {}) {
    const usedSeed = Number.isInteger(seed) ? seed : Date.now() % 2147483647;
    const options = { ...config, seed: usedSeed };
    if (config.book?.enabled) options.book = { ...config.book, data: bookData };
    player = createPlayer(options);
    player.newGame(usedSeed);
    effective = { seed: usedSeed, personaId: player.persona.id, search: { ...player.search }, selection: { ...player.selection }, book: { ...player.book } };
    return effective;
  }

  /** 盤を渡して1手選ぶ（テスト・検証用の低レベル口） */
  function thinkOnBoard(board) {
    if (!player) throw new Error("newGame が呼ばれていません");
    const turn = board.turn();
    const r = player.chooseMove(board);
    return { usi: r.move ? r.move.usi : null, source: r.source, info: plainInfo(r.info), opening: player.opening(turn) ?? null };
  }

  /** 平手からの USI の手順を再生した局面で、手番側の1手を選ぶ。合法手が無ければ usi:null, source:"none"。 */
  function think(moves) {
    const board = new ShogiBoard();
    for (let i = 0; i < moves.length; i++) {
      if (!board.makeMoveByUSI(moves[i])) throw new Error(`${i + 1}手目 ${moves[i]} は指せません（平手からの手順として不正）`);
    }
    return thinkOnBoard(board);
  }

  return { newGame, think, thinkOnBoard, effectiveConfig: () => effective };
}
