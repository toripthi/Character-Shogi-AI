/** バランス型: 駒得のみの基準ペルソナ。特性なし。 */
export default {
  id: "balance",
  name: "バランス型",
  description: "駒得のみの基準ペルソナ。",
  traits: [],
  // 定跡を使わない（D-029）。超初心者向け。定跡のラインがタグなしで入っても引かない。
  usesBook: false,
};
