/**
 * ペルソナの登録簿（名前をつけて保存した特性の組み合わせ）。
 *
 * ペルソナ = { id, name, description, traits: [特性id], weights?: {項id: 重み}, pieceSet? }
 *   - weights: 特性を足した後に「上書き」する重み（微調整用）
 *   - 棋力（級）は含めない。同じペルソナで級を選べるようにするため（D-012）。
 */
import balance from "./balance.js";
import seme from "./seme.js";
import mamori from "./mamori.js";
import ibishaSeme from "./ibisha-seme.js";
import furiMamori from "./furi-mamori.js";

export const PERSONAS = Object.fromEntries([balance, seme, mamori, ibishaSeme, furiMamori].map((p) => [p.id, p]));
