/** 振り飛車の受け将棋（4-2）：受け将棋棋風＋振り飛車党。 */
export default {
  id: "furi-uke",
  name: "振り飛車の受け将棋",
  description: "振り飛車で飛車を大事にしながら囲う。",
  traits: ["uke", "furibisha"],
  plan: "furi-shiken-mino", // 手順テンプレート（src/plan）
};
