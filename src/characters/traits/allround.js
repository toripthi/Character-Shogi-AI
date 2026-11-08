/**
 * 特性: オールラウンダー（D-029 (e)）。居飛車・振り飛車のどちらも指す「戦法おまかせ」。
 *
 * 自分では評価の重みも定跡タグも持たない。対局開始時（newGame(seed)）に、手番の色ごとに
 * `choose` の重みで居飛車党／振り飛車党のどちらかを抽選し、選ばれた特性に置き換えて
 * 評価（囲い・飛車の位置）と定跡タグを組む（resolvePersona の openings、player.js）。
 *   - 先手と後手は別々に抽選する（自己対局で「居飛車対振り飛車」も出るように）。
 *   - 既定は 50:50（級位帯では半々と言われる）。ペルソナの openingWeights でキャラごとに変えられる。
 *   - group は ibisha / furibisha と同じ "opening"。併用はエラー（排他）。
 */
export default {
  id: "allround",
  name: "オールラウンダー",
  group: "opening",
  description: "居飛車か振り飛車かは対局開始時に決まる。決まったあとは、その戦法の党と同じ指し方をする。",
  weights: {},
  bookTags: [],
  // 抽選の候補（特性id: 重み）。候補は同じ group の特性であること。
  choose: { ibisha: 50, furibisha: 50 },
};
