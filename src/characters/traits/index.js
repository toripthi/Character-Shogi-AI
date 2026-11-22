/**
 * 特性の登録簿。特性を足すときは、このフォルダに1ファイル書いてここに1行足す。
 *
 * 特性 = 棋風の部品。{ id, name, description, group?, weights }
 *   - group: 同じ group の特性は同時に選べない（例: 居飛車党/振り飛車党、攻め/守り）
 *   - weights: 評価項の重みの加算分（キーは eval/registry.js の項id）
 *   - kingAdvanceStages?: 玉の出すぎの段階表（eval/kingPos.js）。気質の特性が持つ（重みとは別のキャラデータ）
 *   - choose?: { 特性id: 重み }。あるとき、その特性は「対局開始時に候補から1つ抽選して置き換える」特性（random＝戦型の振り分け）
 */
import seme from "./seme.js";
import uke from "./uke.js";
import ibisha from "./ibisha.js";
import furibisha from "./furibisha.js";
import random from "./random.js";

export const TRAITS = Object.fromEntries([seme, uke, ibisha, furibisha, random].map((t) => [t.id, t]));
