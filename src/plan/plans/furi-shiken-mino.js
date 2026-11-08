/**
 * 手順テンプレート：振り飛車（四間70%／三間30%）→ 美濃／金無双。先手視点（後手は実装側で180度回す）。
 * 手順：ユーザー作成（2026-10-18）。形式は docs/PLAN.md。
 *
 * 約束：
 *  - 手は USI の盤上の手。piece は動かす駒の種類（「済み」「指せる」の判定に使う）。
 *  - 状態を持たない。盤面から「済み／指せる／飛ばす」を決める。
 *  - interrupts は最優先。steps は上から最初の「指せる」手。tail は steps の後。
 *  - stop が付いた手に達したら（済み・飛ばす）、そこで終わり（tail も指さない）。
 */
export default {
  id: "furi-shiken-mino",
  stance: "furi",
  safety: { depth: 2, marginCp: 150 }, // 浅い探索で最善手より150点を超えて悪い手は指さない（仮の値）

  interrupts: [
    // ① 後手が1四歩としてきたら、最優先で1六歩（振り飛車の生命線）
    { id: "hashi-16", move: "1g1f", piece: "pawn", when: { oppPawnAt: "1d" } },
  ],

  steps: [
    { id: "p76", move: "7g7f", piece: "pawn" },
    { id: "p66", move: "6g6f", piece: "pawn" },
    {
      id: "rook",
      piece: "rook",
      choose: [
        { move: "2h6h", weight: 70 }, // 6八飛 四間飛車
        { move: "2h7h", weight: 30 }, // 7八飛 三間飛車
      ],
    },
    { id: "k48", move: "5i4h", piece: "king" },
    { id: "k38", move: "4h3h", piece: "king" },

    // 相手が振り飛車：4八金 → 5八金で打ち切り（金無双）
    { id: "g48", move: "4i4h", piece: "gold", when: { opponent: "furi" } },
    { id: "g58-furi", move: "6i5h", piece: "gold", when: { opponent: "furi" }, stop: true },

    // 相手が居飛車：2八玉 → 3八銀 → 5八金（美濃）。その後は tail
    { id: "k28", move: "3h2h", piece: "king", when: { opponent: "ibisha" } },
    { id: "s38", move: "3i3h", piece: "silver", when: { opponent: "ibisha" } },
    { id: "g58-ibisha", move: "6i5h", piece: "gold", when: { opponent: "ibisha" } },
  ],

  tail: [
    // 1六歩がまだなら1六歩。相手の歩が1三のままなら、さらに1五歩
    { id: "hashi-16-late", move: "1g1f", piece: "pawn" },
    { id: "hashi-15", move: "1f1e", piece: "pawn", when: { oppPawnAt: "1c" } },
  ],
};
