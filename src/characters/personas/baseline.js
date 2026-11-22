/** 基準ペルソナ: 測定・比較のための素のペルソナ。棋風ではないので、UI の選択肢には出さない（D-011）。 */
export default {
  id: "baseline",
  name: "基準ペルソナ",
  description: "測定・比較のための素のペルソナ。評価は駒得のみ、定跡・手順テンプレートを使わない。",
  traits: [],
  // 評価は駒得（material）のみ。他の評価項は重みを上書きで全て 0 にする（D-011）。
  // 項が増えたら、ここにも 0 を足すこと（漏れると、その項が物差しに混ざる）。
  weights: {
    material: 1,
    advance: 0,
    control: 0,
    attack: 0,
    rookFile: 0,
    rookDanger: 0,
    horseGuard: 0,
    castleFuri: 0,
    castleIbisha: 0,
    rookSwung: 0,
    rookHome: 0,
    rookEdge: 0,
    mobility: 0,
    kingHome: 0,
    kingAdvance: 0,
    kingGuard: 0,
    bishopParity: 0,
    retreat: 0,
    capture: 0,
    knightJump: 0,
    dropDefense: 0,
  },
  // 定跡を使わない。タグなしのラインがあっても引かない（素の物差しとして使うため）。
  usesBook: false,
};
