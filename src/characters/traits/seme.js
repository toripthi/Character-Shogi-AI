/**
 * 特性: 攻め屋気質（REQUIREMENTS §5.3）。
 * 前進PST・敵陣制圧度・攻め駒・飛車の筋に重み、後退にペナルティ。王手自体は評価しない。
 * weights は既定値への「加算」。
 */
export default {
  id: "seme",
  name: "攻め屋気質",
  group: "temperament", // 攻守の軸。同じ group の特性は同時に選べない（§5.1）
  description: "前のめりに攻める。飛車の筋と敵陣制圧を好み、後退を嫌う。",
  // attack は既定（バランス）20 への加算。攻め 30。capture は取る手への加点（取った駒の価値の10%）
  weights: { advance: 1, control: 15, attack: 10, rookFile: 20, retreat: 20, capture: 0.1 },
};
