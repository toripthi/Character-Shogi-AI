/**
 * エンジンの公開入口（ブラウザ / Web Worker / Node 共通）。
 * UI やスクリプトはここからだけ import すれば足りる。
 */
export { ShogiBoard } from "./core/board.js";
export { createRng, pick, pickIndex } from "./core/rng.js";
export { evaluate, resolveStyle, TERMS, PIECE_SETS } from "./eval/index.js";
export { searchBestMove, think, MATE_SCORE } from "./search/index.js";
export { scoreRootMoves, selectMove } from "./selection/index.js";
export { createPlayer } from "./player.js";
export {
  TRAITS,
  PERSONAS,
  composeStyle,
  listTraits,
  listPersonas,
  resolvePersona,
  OPENING_AXIS,
  TEMPERAMENT_AXIS,
  axisPersonaId,
  personaSpecFromAxes,
  listAxisPersonas,
} from "./characters/index.js";
