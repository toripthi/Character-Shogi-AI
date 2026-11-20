/**
 * 特性: 攻め将棋気質（REQUIREMENTS §5.3）。
 * 前進PST・敵陣制圧度・攻め駒・飛車の筋に重み、後退にペナルティ。王手自体は評価しない。
 * weights は既定値への「加算」。
 */
import { KING_ADVANCE_STAGES_SEME } from "../../eval/kingPos.js";

export default {
  id: "seme",
  name: "攻め将棋気質",
  group: "temperament", // 攻守の軸。同じ group の特性は同時に選べない（§5.1）
  description: "前のめりに攻める。飛車の筋と敵陣制圧を好み、後退を嫌う。",
  // attack は既定（バランス）20 への加算。攻め 30。capture は既定 +0.05 への加算で、合計 +0.15（取った駒の価値の15%）
  weights: { advance: 1, control: 15, attack: 10, rookFile: 20, retreat: 20, capture: 0.1 },
  // 玉の出すぎの段階罰（2026-11-20 本人決定）：攻めは終盤に軽くする（30手目まで80／50手目まで60／70手目まで40／以降20）
  kingAdvanceStages: KING_ADVANCE_STAGES_SEME,
};
