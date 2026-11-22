import { createRng } from "../../../src/core/rng.js";

/**
 * 振り駒。歩5枚を振り、「歩」の枚数が多ければ振った側（あなた）が先手、「と金」が多ければ相手が先手。
 * random は 0 以上 1 未満の乱数で、シード付きの createRng を渡す（D-026：Math.random は使わない）。
 * 呼び出し側は対局のシードから作った乱数を渡すこと。省略した場合は現在時刻を種にする。
 * @returns {{ fu:number, tokin:number, humanSide:'SENTE'|'GOTE' }}
 */
export function drawFurigoma(random = createRng(Date.now())) {
  let fu = 0;
  for (let i = 0; i < 5; i++) if (random() < 0.5) fu++;
  return { fu, tokin: 5 - fu, humanSide: fu >= 3 ? "SENTE" : "GOTE" };
}

export const describeFurigoma = ({ fu, tokin, humanSide }) =>
  `振り駒：歩${fu}枚・と金${tokin}枚 → あなたが${humanSide === "SENTE" ? "先手" : "後手"}`;
