/**
 * 棋風の2つの軸（開始画面の選択肢）。2026-11 ユーザー指示 ③。
 *
 *   戦法の軸（opening）：   ランダム / 居飛車 / 振り飛車     （特性 allround / ibisha / furibisha）
 *   気質の軸（temperament）：バランス / 攻め / 守り           （特性 なし / seme / mamori）
 *
 * 3×3 = 9 通りの組み合わせはどれも選べる。ペルソナの id は `${opening}-${temperament}`
 * （例 "ibisha-seme"、"random-balance"）。既存のペルソナ ibisha-seme・furi-mamori は同じ id・同じ中身（そのまま使う）。
 * それ以外の組み合わせは、ここで特性から組み立てる（resolvePersona が "xxx-yyy" 形式の id を受け取れる）。
 * 純データ・純関数（Node / ブラウザ / Worker 共通）。
 */
import { PERSONAS } from "./personas/index.js";

export const OPENING_AXIS = Object.freeze([
  { id: "random", name: "ランダム", traits: ["allround"], description: "居飛車か振り飛車かは対局開始時に決まる" },
  { id: "ibisha", name: "居飛車", traits: ["ibisha"], description: "居飛車の囲いを組み、飛車を自陣の1〜4筋に置く" },
  { id: "furi", name: "振り飛車", traits: ["furibisha"], description: "振り飛車の囲いを組み、飛車を5〜9筋（自陣）に振る" },
]);

export const TEMPERAMENT_AXIS = Object.freeze([
  { id: "balance", name: "バランス", traits: [], description: "攻めにも守りにも偏らない（駒得を基準に指す）" },
  { id: "seme", name: "攻め", traits: ["seme"], description: "前のめりに攻める。飛車の筋と敵陣制圧を好み、後退を嫌う" },
  { id: "mamori", name: "守り", traits: ["mamori"], description: "飛車を可愛がり、馬の守りを重く見る" },
]);

export const axisPersonaId = (opening, temperament) => `${opening}-${temperament}`;

const byId = (axis, id) => axis.find((a) => a.id === id) ?? null;

/** "ibisha-seme" のような id を { opening, temperament } に。軸の id でなければ null。 */
export function parseAxisPersonaId(id) {
  if (typeof id !== "string") return null;
  const i = id.indexOf("-");
  if (i < 0) return null;
  const opening = id.slice(0, i);
  const temperament = id.slice(i + 1);
  return byId(OPENING_AXIS, opening) && byId(TEMPERAMENT_AXIS, temperament) ? { opening, temperament } : null;
}

/**
 * 軸の組み合わせ → ペルソナの定義（resolvePersona に渡せる形）。
 * 既存のペルソナ（ibisha-seme・furi-mamori）があればそれをそのまま返す。
 * @throws 未知の軸の値
 */
export function personaSpecFromAxes(opening, temperament) {
  const o = byId(OPENING_AXIS, opening);
  const t = byId(TEMPERAMENT_AXIS, temperament);
  if (!o) throw new Error(`未知の戦法 "${opening}"（${OPENING_AXIS.map((a) => a.id).join(", ")}）`);
  if (!t) throw new Error(`未知の気質 "${temperament}"（${TEMPERAMENT_AXIS.map((a) => a.id).join(", ")}）`);
  const id = axisPersonaId(o.id, t.id);
  if (PERSONAS[id]) return PERSONAS[id];
  return {
    id,
    name: `${o.name}×${t.name}`,
    description: `戦法：${o.description}。気質：${t.description}。`,
    traits: [...o.traits, ...t.traits],
  };
}

/** 表示名：登録済みのペルソナ名、軸の組み合わせの名前、どちらでもなければ id そのまま（Worker・重い評価を読み込まずに使える） */
export function personaDisplayName(id) {
  if (PERSONAS[id]) return PERSONAS[id].name;
  const a = parseAxisPersonaId(id);
  return a ? personaSpecFromAxes(a.opening, a.temperament).name : String(id);
}

/** UI 用：9通りの一覧 */
export function listAxisPersonas() {
  return OPENING_AXIS.flatMap((o) =>
    TEMPERAMENT_AXIS.map((t) => ({ opening: o.id, temperament: t.id, ...personaSpecFromAxes(o.id, t.id) })),
  );
}
