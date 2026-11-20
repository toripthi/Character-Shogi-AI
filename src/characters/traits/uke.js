/**
 * 特性: 受け将棋気質（簡易版、Phase 5で拡張）。
 * 飛車への愛着（狙われた飛車の減点）と馬の守備加点を重くする。
 */
import { KING_ADVANCE_STAGES_UKE } from "../../eval/kingPos.js";

export default {
  id: "uke",
  name: "受け将棋気質",
  group: "temperament",
  description: "飛車を可愛がり、馬の守りを重く見る。",
  // attack は既定（バランス）20 への加算。受け 10。capture は既定 +0.05 への加算で、合計 -0.05（取った駒の価値の5%の減点。駒交換を怖がる）
  // dropDefense は既定 0 への加算で、受けだけが +30（仮置き）：自陣への打ち込み報酬（2026-11-13 着想、2026-11-20 実装）
  weights: { rookDanger: 150, horseGuard: 60, attack: -10, capture: -0.1, dropDefense: 30 },
  // 玉の出すぎの段階罰（2026-11-20 本人決定）：受けは後半でも罰を残す（30手目まで100／50手目まで80／80手目まで70／以降60）
  kingAdvanceStages: KING_ADVANCE_STAGES_UKE,
};
