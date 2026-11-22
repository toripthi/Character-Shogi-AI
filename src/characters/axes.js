/**
 * 棋風の2つの軸（開始画面の選択肢）。2026-11 ユーザー指示 ③。2026-11-21 本人決定で訂正。
 *
 *   戦型の軸（opening）：   居飛車 / 振り飛車 / ランダム     （特性 ibisha / furibisha / random）
 *   棋風の軸（temperament）：バランス / 攻め / 守り           （特性 なし / seme / uke）
 *
 * 選択肢は 3×3 だが、実在するペルソナは 居飛車×棋風 と 振り飛車×棋風 の6つだけ。
 * ランダムはペルソナ（人格）ではなく、対局開始時に居飛車か振り飛車へ振り分ける選択の仕組みで、
 * 振り分けられた後は確定した戦型のペルソナと完全に同一になる（評価・定跡・手順テンプレートとも）。
 * 選択の id は `${opening}-${temperament}`（例 "ibisha-seme"、"random-balance"）。
 * 既存のペルソナ ibisha-seme・furi-uke は同じ id・同じ中身（そのまま使う）。
 * それ以外の組み合わせは、ここで特性から組み立てる（resolvePersona が "xxx-yyy" 形式の id を受け取れる）。
 * 純データ・純関数（Node / ブラウザ / Worker 共通）。
 */
import { PERSONAS } from "./personas/index.js";

export const OPENING_AXIS = Object.freeze([
  { id: "ibisha", name: "居飛車", traits: ["ibisha"], description: "居飛車の囲いを組み、飛車を自陣の1〜4筋に置く" },
  { id: "furi", name: "振り飛車", traits: ["furibisha"], description: "振り飛車の囲いを組み、飛車を5〜9筋（自陣）に振る" },
  { id: "random", name: "ランダム", traits: ["random"], description: "対局開始時に居飛車か振り飛車へ振り分ける。決まったあとは、その戦型として指す" },
]);

export const TEMPERAMENT_AXIS = Object.freeze([
  { id: "balance", name: "バランス", traits: [], description: "攻めにも守りにも偏らない、素直な指し回し" },
  { id: "seme", name: "攻め", traits: ["seme"], description: "前のめりに攻める。飛車の筋と敵陣制圧を好み、後退を嫌う" },
  { id: "uke", name: "受け", traits: ["uke"], description: "飛車を可愛がり、馬の守りを重く見る" },
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
 * 既存のペルソナ（ibisha-seme・furi-uke）があればそれをそのまま返す。
 * ランダムの組み合わせはペルソナではなく「振り分けの指定」で、解決すると対局開始時の
 * 抽選の一式（openings）になる。
 * @throws 未知の軸の値
 */
export function personaSpecFromAxes(opening, temperament) {
  const o = byId(OPENING_AXIS, opening);
  const t = byId(TEMPERAMENT_AXIS, temperament);
  if (!o) throw new Error(`未知の戦型 "${opening}"（${OPENING_AXIS.map((a) => a.id).join(", ")}）`);
  if (!t) throw new Error(`未知の棋風 "${temperament}"（${TEMPERAMENT_AXIS.map((a) => a.id).join(", ")}）`);
  const id = axisPersonaId(o.id, t.id);
  if (PERSONAS[id]) return PERSONAS[id];
  return {
    id,
    name: `${o.name}×${t.name}`,
    description: `戦型：${o.description}。棋風：${t.description}。`,
    traits: [...o.traits, ...t.traits],
  };
}

/** 表示名：登録済みのペルソナ名、軸の組み合わせの名前、どちらでもなければ id そのまま（Worker・重い評価を読み込まずに使える） */
export function personaDisplayName(id) {
  if (PERSONAS[id]) return PERSONAS[id].name;
  const a = parseAxisPersonaId(id);
  return a ? personaSpecFromAxes(a.opening, a.temperament).name : String(id);
}

/**
 * UI 用：実在するペルソナの一覧（居飛車×棋風・振り飛車×棋風の6つ）。
 * ランダムはペルソナではないので含まない（選択肢としては OPENING_AXIS にある）。
 */
export function listAxisPersonas() {
  return OPENING_AXIS.filter((o) => o.id !== "random").flatMap((o) =>
    TEMPERAMENT_AXIS.map((t) => ({ opening: o.id, temperament: t.id, ...personaSpecFromAxes(o.id, t.id) })),
  );
}
