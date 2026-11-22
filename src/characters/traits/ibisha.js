/**
 * 特性: 居飛車党（4-2）。囲いは居飛車の形（castleIbisha）、飛車は自陣の1〜4筋（rookHome）に置く。
 * 重みは、囲い1ptあたり30（castleIbisha、D-021）、飛車の条件を満たすと +100。
 * bookTags は定跡の戦型タグ（定跡のラインの tags と照合する）。
 * plan は手順テンプレートの id（src/plan。2026-11-21 追加：居飛車の基本手順）。
 */
export default {
  id: "ibisha",
  name: "居飛車党",
  group: "opening",
  description: "居飛車の囲いを組み、飛車を自陣の1〜4筋に置く。",
  weights: { castleIbisha: 30, rookHome: 100 },
  bookTags: ["ibisha"],
  plan: "ibisha-basic",
};
