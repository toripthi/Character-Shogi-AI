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
  weights: { advance: 1, control: 15, attack: 30, rookFile: 20, retreat: 20 },
};
