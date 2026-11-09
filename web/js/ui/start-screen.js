/**
 * 開始画面（この repo 独自）。対局を始める前に必ず出る。選ぶもの：
 *   手番（先手 / 後手 / 振り駒）、相手の棋風（戦法：ランダム・居飛車・振り飛車 × 気質：バランス・攻め・守り）、持ち時間。
 * 画面は入力を集めて渡すだけ。検証・保存・対局の開始は呼び出し側（main.js）と game/settings.js が持つ。
 * 前回の選択を初期値にする（getRaw）。入力欄の文字は 16px 以上（iOS Safari の拡大防止）。
 */
import { OPENING_AXIS, TEMPERAMENT_AXIS, personaSpecFromAxes } from "../../../src/characters/axes.js";
import { TIME_PRESETS } from "../game/time-control.js";

const SIDES = [["sente", "先手"], ["gote", "後手"], ["furigoma", "振り駒"]];

const el = (tag, cls, text) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
};

/** 横並びの選択ボタン（ラジオ相当）。value は get/set で読み書き */
function segmented(name, options, onChange) {
  const box = el("div", "seg");
  box.setAttribute("role", "radiogroup");
  box.setAttribute("aria-label", name);
  const buttons = new Map();
  let value = null;
  for (const [v, label] of options) {
    const b = el("button", "seg-btn", label);
    b.type = "button";
    b.setAttribute("role", "radio");
    b.dataset.value = v;
    b.addEventListener("click", () => { set(v); onChange?.(v); });
    buttons.set(v, b);
    box.append(b);
  }
  function set(v) {
    value = v;
    for (const [k, b] of buttons) {
      b.classList.toggle("seg-btn--on", k === v);
      b.setAttribute("aria-checked", String(k === v));
    }
  }
  return { el: box, get: () => value, set };
}

/**
 * @param {object} o
 * @param {()=>object} o.getRaw 入力欄の初期値（文字列の組）
 * @param {(raw:object)=>void} o.onStart 「対局開始」。不正なら Error を投げる（画面に出す）
 */
export function createStartScreen({ getRaw, onStart }) {
  const overlay = el("div", "sheet-overlay start-overlay");
  overlay.id = "start-screen";
  overlay.hidden = true;
  const sheet = el("div", "sheet");
  sheet.setAttribute("role", "dialog");
  sheet.setAttribute("aria-modal", "true");
  sheet.setAttribute("aria-label", "対局の設定");

  const head = el("div", "sheet-head");
  head.append(el("div", "start-title", "対局を始める"));
  const cancel = el("button", "stage-btn", "戻る");
  cancel.type = "button";
  cancel.id = "start-cancel";
  head.append(cancel);

  const body = el("div", "sheet-body");
  const side = segmented("手番", SIDES);
  const opening = segmented("相手の戦法", OPENING_AXIS.map((a) => [a.id, a.name]), () => refreshPersona());
  const temperament = segmented("相手の気質", TEMPERAMENT_AXIS.map((a) => [a.id, a.name]), () => refreshPersona());
  const personaNote = el("p", "sheet-hint start-persona");

  const time = el("select", "sheet-input");
  time.id = "start-time";
  for (const p of TIME_PRESETS) { const o = el("option", "", p.label); o.value = p.id; time.append(o); }
  const customMin = el("input", "sheet-input");
  const customInc = el("input", "sheet-input");
  for (const [i, ph] of [[customMin, "持ち時間（分）"], [customInc, "1手ごとの加算（秒）"]]) {
    i.type = "text"; i.inputMode = "decimal"; i.placeholder = ph; i.autocomplete = "off"; i.spellcheck = false;
  }
  customMin.id = "start-custom-min";
  customInc.id = "start-custom-inc";
  const custom = el("div", "start-custom");
  const rowMin = el("label", "sheet-row"); rowMin.append(el("span", "sheet-label", "持ち時間（分）"), customMin);
  const rowInc = el("label", "sheet-row"); rowInc.append(el("span", "sheet-label", "1手ごとの加算（秒。0 なら切れ負け）"), customInc);
  custom.append(rowMin, rowInc);
  const timeHint = el("p", "sheet-hint", "時間が切れた側が負けです。AI の考える時間も含みます。");

  const group = (title, ...nodes) => { body.append(el("h3", "sheet-group", title), ...nodes); };
  group("手番", side.el, el("p", "sheet-hint", "振り駒は、対局を始めるたびに歩5枚を振って決めます。"));
  group("相手の戦法", opening.el);
  group("相手の気質", temperament.el, personaNote);
  group("持ち時間", time, custom, timeHint);

  const foot = el("div", "sheet-foot");
  const error = el("div", "sheet-error");
  const go = el("button", "stage-btn stage-btn--primary sheet-apply", "対局開始");
  go.type = "button";
  go.id = "start-go";
  foot.append(error, go);
  sheet.append(head, body, foot);
  overlay.append(sheet);
  document.body.append(overlay);

  function refreshPersona() {
    try {
      const p = personaSpecFromAxes(opening.get(), temperament.get());
      personaNote.textContent = `${p.name}：${p.description}`;
    } catch {
      personaNote.textContent = "";
    }
  }
  const refreshCustom = () => { custom.hidden = time.value !== "custom"; };
  time.addEventListener("change", refreshCustom);

  function fill() {
    const raw = getRaw();
    side.set(raw.side);
    opening.set(raw.opening);
    temperament.set(raw.temperament);
    time.value = raw.time;
    customMin.value = raw.customMin ?? "";
    customInc.value = raw.customInc ?? "";
    refreshPersona();
    refreshCustom();
  }
  const read = () => ({
    side: side.get(), opening: opening.get(), temperament: temperament.get(),
    time: time.value, customMin: customMin.value, customInc: customInc.value,
  });

  function open({ cancellable = false, message = "" } = {}) {
    fill();
    cancel.hidden = !cancellable;
    error.textContent = message;
    overlay.hidden = false;
    body.scrollTop = 0;
  }
  function close() { overlay.hidden = true; }

  cancel.addEventListener("click", close);
  go.addEventListener("click", () => {
    try {
      onStart(read());
    } catch (e) {
      error.textContent = e.message;
    }
  });

  return { open, close, isOpen: () => !overlay.hidden, read };
}
