/**
 * 振り駒。歩5枚を振り、「歩」の枚数が多ければ振った側（あなた）が先手、「と金」が多ければ相手が先手。
 * random は 0 以上 1 未満の乱数（Math.random か、シード付きの createRng）。
 * @returns {{ fu:number, tokin:number, humanSide:'SENTE'|'GOTE' }}
 */
export function drawFurigoma(random = Math.random) {
  let fu = 0;
  for (let i = 0; i < 5; i++) if (random() < 0.5) fu++;
  return { fu, tokin: 5 - fu, humanSide: fu >= 3 ? "SENTE" : "GOTE" };
}

export const describeFurigoma = ({ fu, tokin, humanSide }) =>
  `振り駒：歩${fu}枚・と金${tokin}枚 → あなたが${humanSide === "SENTE" ? "先手" : "後手"}`;
