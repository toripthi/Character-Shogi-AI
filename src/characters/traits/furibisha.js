/**
 * 特性: 振り飛車党（4-2）。囲いは振り飛車の形（castleFuri）、飛車は5〜9筋（自陣）に振る（rookSwung）。
 * 重みは指示書の初期値（囲い1ptあたり10、飛車の条件を満たすと +100）。
 * bookTags は定跡の戦法タグ。
 * plan は手順テンプレートの id（src/plan。2026-11-10：振り飛車なら全ペルソナに紐づける）。
 */
export default {
  id: "furibisha",
  name: "振り飛車党",
  group: "opening",
  description: "振り飛車の囲いを組み、飛車を5〜9筋（自陣）に振る。",
  weights: { castleFuri: 30, rookSwung: 100 },
  bookTags: ["furibisha"],
  plan: "furi-shiken-mino",
};
