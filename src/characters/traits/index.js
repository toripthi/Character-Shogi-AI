/**
 * 特性の登録簿。特性を足すときは、このフォルダに1ファイル書いてここに1行足す。
 *
 * 特性 = 棋風の部品。{ id, name, description, group?, weights }
 *   - group: 同じ group の特性は同時に選べない（例: 居飛車党/振り飛車党、攻め/守り）
 *   - weights: 評価項の重みの加算分（キーは eval/registry.js の項id）
 *   - choose?: { 特性id: 重み }。あるとき、その特性は「対局開始時に候補から1つ抽選して置き換える」特性（allround）
 */
import seme from "./seme.js";
import mamori from "./mamori.js";
import ibisha from "./ibisha.js";
import furibisha from "./furibisha.js";
import allround from "./allround.js";

export const TRAITS = Object.fromEntries([seme, mamori, ibisha, furibisha, allround].map((t) => [t.id, t]));
