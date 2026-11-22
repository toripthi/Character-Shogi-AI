/**
 * ペルソナの登録簿（名前をつけて保存した特性の組み合わせ）。
 *
 * ペルソナ = { id, name, description, traits: [特性id], weights?: {項id: 重み}, pieceSet? }
 *   - weights: 特性を足した後に「上書き」する重み（微調整用）
 *   - 棋力（級）は含めない。同じペルソナで級を選べるようにするため（D-012）。
 */
import balance from "./balance.js";
import seme from "./seme.js";
import uke from "./uke.js";
import ibishaSeme from "./ibisha-seme.js";
import furiUke from "./furi-uke.js";
import baseline from "./baseline.js";

// baseline は測定・比較用の素のペルソナ（D-011）。棋風ではないので、開始画面の選択肢
// （axes.js の軸の組み合わせ）には出てこない。id 指定でのみ使う。
export const PERSONAS = Object.fromEntries([balance, seme, uke, ibishaSeme, furiUke, baseline].map((p) => [p.id, p]));
