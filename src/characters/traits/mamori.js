/**
 * 特性: 守り屋気質（簡易版、Phase 5で拡張）。
 * 飛車への愛着（狙われた飛車の減点）と馬の守備加点を重くする。
 */
export default {
  id: "mamori",
  name: "守り屋気質",
  group: "temperament",
  description: "飛車を可愛がり、馬の守りを重く見る。",
  // attack は既定（バランス）20 への加算。守り 10。capture は取る手への減点（取った駒の価値の5%。駒交換を怖がる）
  weights: { rookDanger: 150, horseGuard: 60, attack: -10, capture: -0.05 },
};
