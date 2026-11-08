/**
 * 囲いのデータ（純データ。ロジックは持たない）。
 * 作成：ユーザー（将棋の知識）。実装担当は内容を変更しない。誤りに気づいたらレポートで指摘する。
 *
 * ■ 形（CASTLES）
 *   - board : 先手視点の盤面（SFENの第1フィールドだけ。持ち駒・手番・後手の駒は使わない）。
 *             置いてある駒がすべて同じマスにあれば、その形が成立する（部分点なし）。
 *             歩も厳密一致（歩の位置で形の名前が変わるため）。後手の囲いは盤面を180度回転して判定する。
 *   - pt    : 硬さ。全形で共通のものさし。
 *   - from  : 経由可能な形（この形の手前の段階）。「次」「排他」は持たない。
 *             経由できない形どうしは両立しない（ルートの外にある形は、その行では評価しない）。
 *
 * ■ 目標（CASTLE_ROUTES）
 *   戦法ごとの「ゴール」と「ゴールの先」。上から順に見て、最初に条件が合った行を使う。
 *   点 = ゴール（と、その手前＝fromをたどった形）は pt そのまま
 *        ゴールの先（beyond）は  pt(ゴール) + (pt(形) − pt(ゴール)) × 係数
 *        どれにも合わなければ 0 点。ルートの外の形は評価しない。
 *   goal が複数あるときは、どれに合っても（高いほうを採る）。
 *
 * ■ 判定の定義（確定）
 *   - 自分の飛車の筋（自分視点。後手は 10 − 筋）：1〜4筋 = 居飛車、5〜9筋 = 振り飛車、5筋 = 中飛車
 *   - 相手の戦法：相手の飛車の筋で同様に判定。一度「振り飛車」と判定したら、その局では戻さない
 *   - 角換わり：次がすべて同時に成り立つ局面を一度でも見たら、その局では角換わり
 *       先手の飛車が2八、後手の飛車が8二、先手と後手の持ち駒に角、先手の銀が7七、後手の銀が3三
 *     （角交換をしても、これを経由しなければ角換わりとは呼ばない）
 */

export const CASTLES = {
  kataMino: {
    name: "片美濃囲い",
    pt: 4,
    board: "9/9/9/9/9/9/5PPP1/6SK1/5G1NL",
    from: [],
  },
  mino: {
    name: "美濃囲い",
    pt: 5,
    board: "9/9/9/9/9/9/5PPP1/4G1SK1/5G1NL",
    from: ["kataMino"],
  },
  // つなぎ形（2026-10-18 追加・ユーザー案）：美濃から4六歩を突いた瞬間。実戦では美濃より脆く、高美濃にもなっていないので、
  // 4六歩を突く一手が、深さ2でも指せるよう、美濃（5）より少し高い点（5.2）を与える。評価が0に落ちて指し手が荒れるのも防ぐ。値は仮。
  minoP46: {
    name: "美濃囲い（4六歩・途中）",
    pt: 5.2, // 美濃（5）より少し高い（ユーザー案）。深さ2でも4六歩を指せるように。以前は4.2
    board: "9/9/9/9/9/5P3/6PP1/4G1SK1/5G1NL",
    from: ["mino"], // 美濃から4六歩を突いて到達する形
    transition: true, // つなぎ形：親（美濃）より pt が低くてよい（テストの検査を免除）
  },
  takaMino: {
    name: "高美濃囲い",
    pt: 6,
    board: "9/9/9/9/9/5P3/5GPP1/6SK1/5G1NL",
    from: ["mino"],
  },
  // 高美濃 → 銀冠 の途中形（2026-10-18・ユーザー案）。順序は 2六歩 → 2七銀 → 3八金 → 3六歩 → 3七桂。
  // 各手の点の比率は 1:3:4:1:4（形が崩れやすい 2六歩・3六歩は控えめ）。点は「その形での値」＝直前の形＋その手の点。
  // 点の配分：高美濃6→銀冠7の差1を 1:3:4:1:4 で割った（元の 4・5・6・7 の表を保つ）。
  // この順序以外で進めた形には点がない（形の判定が部分点なしのため）。値は仮（重み・係数と一緒に調整）。
  ginKanStep1: {
    name: "高美濃→銀冠（2六歩）",
    pt: 6.077, // 高美濃6 ＋1/13（銀冠7までの差1を 1:3:4:1:4 で配分）
    board: "9/9/9/9/9/5P1P1/5GP2/6SK1/5G1NL",
    from: ["takaMino"],
  },
  ginKanStep2: {
    name: "高美濃→銀冠（2七銀）",
    pt: 6.308, // ＋3/13
    board: "9/9/9/9/9/5P1P1/5GPS1/7K1/5G1NL",
    from: ["ginKanStep1"],
  },
  ginKanStep3: {
    name: "高美濃→銀冠（3八金）",
    pt: 6.615, // ＋4/13
    board: "9/9/9/9/9/5P1P1/5GPS1/6GK1/7NL",
    from: ["ginKanStep2"],
  },
  ginKanStep4: {
    name: "高美濃→銀冠（3六歩）",
    pt: 6.692, // ＋1/13
    board: "9/9/9/9/9/5PPP1/5G1S1/6GK1/7NL",
    from: ["ginKanStep3"],
  },
  ginKanmuri: {
    name: "銀冠",
    pt: 7, // ＋4/13（3七桂）。元の配分どおり銀冠は7
    board: "9/9/9/9/9/5PPP1/5GNS1/6GK1/8L",
    from: ["ginKanStep4"],
  },
  kinMusou: {
    name: "金無双",
    pt: 3,
    board: "9/9/9/9/9/9/5PPP1/4GGK2/7NL",
    from: [],
  },
  kabuto: {
    name: "兜囲い",
    pt: 2,
    board: "9/9/9/9/9/2P6/1PS1P4/2GKG4/LN7",
    from: [],
  },
  kabutoTamabiki: {
    name: "兜囲い（玉引き）",
    pt: 3,
    board: "9/9/9/9/9/2P6/1PS1P4/2G1G4/LNK6",
    from: ["kabuto"],
  },
  kabutoNyujo: {
    name: "兜囲い（入城）",
    pt: 3,
    board: "9/9/9/9/9/2P6/1PS1P4/1KG1G4/LN7",
    from: ["kabuto"],
  },
  kinYagura: {
    name: "金矢倉",
    pt: 4,
    board: "9/9/9/9/9/2PP5/1PSG5/1KG6/LN7",
    from: ["kabuto"],
  },
  elmo: {
    name: "elmo囲い",
    pt: 4,
    board: "9/9/9/9/9/9/1P1P5/2KS5/LNG6",
    from: [],
  },
};

/**
 * stance   : 自分の戦法（特性から決まる）。"furi" = 振り飛車党、"ibisha" = 居飛車党
 * opponent : 相手の戦法。"ibisha" | "furi"
 * rook     : "naka"（自分の飛車が5筋）。省略 = 問わない
 * kakugawari : true = 角換わりのとき。省略 = 問わない
 */
export const CASTLE_ROUTES = [
  {
    id: "furi-naka-vs-ibisha",
    label: "中飛車（対居飛車）",
    stance: "furi",
    opponent: "ibisha",
    rook: "naka",
    goal: ["kataMino"],
    beyond: { mino: 0 }, // 美濃へは引かれず、行っても減点なし
  },
  {
    id: "furi-vs-ibisha",
    label: "四間・三間・向かい飛車（対居飛車）",
    stance: "furi",
    opponent: "ibisha",
    goal: ["mino"],
    beyond: { takaMino: 1, ginKanStep1: 1, ginKanStep2: 1, ginKanStep3: 1, ginKanStep4: 1, ginKanmuri: 1, minoP46: 1 }, // 行ければ嬉しい。係数1＝形の点がそのまま（2026-10-18：0.25から変更。高美濃6・銀冠7）
    // Phase 5: 向かい飛車は級が上がると片美濃で満足する（6級＝美濃、3級＝片美濃）。級のデータで goal を上書きする想定
  },
  {
    id: "furi-vs-furi",
    label: "振り飛車（対振り飛車）",
    stance: "furi",
    opponent: "furi",
    goal: ["kinMusou"],
    beyond: {},
    // 中飛車（対振り飛車）はユーザー未指定。四間・三間・向かい飛車と同じ扱いにした（要確認）
    provisional: true,
  },
  {
    id: "ibisha-kakugawari",
    label: "居飛車（角換わり）",
    stance: "ibisha",
    opponent: "ibisha",
    kakugawari: true,
    goal: ["kabutoNyujo", "kabutoTamabiki"], // どちらでもよい
    beyond: {},
  },
  {
    id: "ibisha-vs-ibisha",
    label: "居飛車（対居飛車）",
    stance: "ibisha",
    opponent: "ibisha",
    goal: ["kinYagura"],
    beyond: {},
  },
  {
    id: "ibisha-vs-furi",
    label: "居飛車（対振り飛車）",
    stance: "ibisha",
    opponent: "furi",
    goal: ["elmo"],
    beyond: {},
  },
];
