/**
 * 設定とログの画面（この repo 独自）。全画面のシートに「設定」「対局ログ」の2つのタブ。
 * 画面は入力を集めて渡すだけ。検証・保存・対局の開始は呼び出し側（main.js）と game/settings.js が持つ。
 * 入力欄の文字は 16px 以上（iOS Safari は小さい入力欄にフォーカスすると画面を拡大してしまう）。
 */
import { STYLES } from "../game/settings.js";

/** 入力欄の定義。type: select | number | text */
function fieldsFor(personas) {
  return [
    { group: "AI" },
    { key: "persona", label: "AI の個性", type: "select", options: Object.values(personas).map((p) => [p.id, `${p.name}（${p.id}）`]), describe: (v) => personas[v]?.description ?? "" },
    { key: "depth", label: "探索の深さ", type: "select", options: [1, 2, 3, 4, 5, 6].map((n) => [String(n), String(n)]), hint: "大きいほど強く、遅くなります（既定 3）" },
    { key: "book", label: "定跡", type: "select", options: [["1", "使う"], ["0", "使わない"]] },
    { group: "探索の予算（空欄＝既定。入れるなら両方）" },
    { key: "maxNodes", label: "ノード上限", type: "number", placeholder: "例 20000", inputmode: "numeric" },
    { key: "maxDepth", label: "最大の深さ", type: "number", placeholder: "例 5", inputmode: "numeric" },
    { group: "手の選び方（空欄＝既定）" },
    { key: "margin", label: "許容する差 margin（cp）", type: "number", placeholder: "既定 0", inputmode: "decimal", hint: "最善手との差がこの値以内の手から選ぶ" },
    { key: "slip", label: "悪手を選ぶ確率 slip（0〜1）", type: "number", placeholder: "既定 0", inputmode: "decimal" },
    { key: "slipMargin", label: "悪手の許容差 slipMargin（cp）", type: "number", placeholder: "既定 500", inputmode: "decimal" },
    { group: "対局" },
    { key: "side", label: "あなたの手番", type: "select", options: [["sente", "先手"], ["gote", "後手"]] },
    { key: "seed", label: "seed", type: "number", placeholder: "空欄＝毎回ランダム", inputmode: "numeric", hint: "同じ seed・同じ設定なら AI は同じように指します" },
    { key: "style", label: "指し方（記録用）", type: "select", options: [["", "未指定"], ...STYLES.map((s) => [s, s])] },
    { key: "maxMoves", label: "手数の上限（引き分け）", type: "number", inputmode: "numeric" },
  ];
}

const el = (tag, cls, text) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
};

/**
 * @param {object} o
 * @param {object} o.personas PERSONAS
 * @param {()=>object} o.getRaw 入力欄の現在値（文字列の組）
 * @param {(raw:object)=>void} o.onApply 「この設定で新しい対局」。不正なら Error を投げる（画面に出す）
 * @param {()=>Array} o.getLogs
 * @param {{kif:Function, json:Function, copy:Function, all:Function, remove:Function}} o.actions ログの書き出し・削除
 * @param {(log:object)=>{title:string, detail:string}} o.summary
 */
export function createMenuSheet({ personas, getRaw, onApply, getLogs, actions, summary }) {
  const overlay = el("div", "sheet-overlay");
  overlay.hidden = true;
  const sheet = el("div", "sheet");
  sheet.setAttribute("role", "dialog");
  sheet.setAttribute("aria-modal", "true");

  const head = el("div", "sheet-head");
  const tabs = el("div", "sheet-tabs");
  const tabSettings = el("button", "sheet-tab", "設定");
  const tabLogs = el("button", "sheet-tab", "対局ログ");
  for (const t of [tabSettings, tabLogs]) t.type = "button";
  tabs.append(tabSettings, tabLogs);
  const close = el("button", "stage-btn", "閉じる");
  close.type = "button";
  head.append(tabs, close);

  const body = el("div", "sheet-body");
  const settingsPane = el("div", "sheet-pane");
  const logsPane = el("div", "sheet-pane");
  body.append(settingsPane, logsPane);

  const foot = el("div", "sheet-foot");
  const error = el("div", "sheet-error");
  const apply = el("button", "stage-btn stage-btn--primary sheet-apply", "この設定で新しい対局");
  apply.type = "button";
  foot.append(error, apply);
  sheet.append(head, body, foot);
  overlay.append(sheet);
  document.body.append(overlay);

  /* ---- 設定 ---- */
  const inputs = {};
  const fields = fieldsFor(personas);
  for (const f of fields) {
    if (f.group) { settingsPane.append(el("h3", "sheet-group", f.group)); continue; }
    const row = el("label", "sheet-row");
    row.append(el("span", "sheet-label", f.label));
    let input;
    if (f.type === "select") {
      input = el("select", "sheet-input");
      for (const [value, text] of f.options) { const o = el("option", "", text); o.value = value; input.append(o); }
    } else {
      input = el("input", "sheet-input");
      input.type = f.type === "number" ? "text" : "text"; // 空欄・小数・検証メッセージを自前で扱うため text（数値キーボードは inputmode で出す）
      if (f.inputmode) input.inputMode = f.inputmode;
      if (f.placeholder) input.placeholder = f.placeholder;
      input.autocomplete = "off";
      input.autocapitalize = "off";
      input.spellcheck = false;
    }
    inputs[f.key] = input;
    row.append(input);
    if (f.hint) row.append(el("span", "sheet-hint", f.hint));
    if (f.describe) {
      const d = el("span", "sheet-hint sheet-describe");
      row.append(d);
      input.addEventListener("change", () => { d.textContent = f.describe(input.value); });
      f.refresh = () => { d.textContent = f.describe(input.value); };
    }
    settingsPane.append(row);
  }
  settingsPane.append(el("p", "sheet-note", "変更は次の対局から効きます（いまの対局は続きます）。「新しい対局」で始めると、指している対局は中断として記録されます。"));

  function fillSettings() {
    const raw = getRaw();
    for (const [k, input] of Object.entries(inputs)) input.value = raw[k] ?? "";
    for (const f of fields) f.refresh?.();
  }
  function readSettings() {
    return Object.fromEntries(Object.entries(inputs).map(([k, i]) => [k, i.value]));
  }

  /* ---- 対局ログ ---- */
  function renderLogs() {
    logsPane.replaceChildren();
    const logs = [...getLogs()].reverse();
    if (!logs.length) { logsPane.append(el("p", "sheet-note", "まだ対局ログがありません。対局が終わる（または中断する）と、ここに残ります。")); return; }
    const top = el("div", "sheet-log-top");
    top.append(el("span", "sheet-note", `直近 ${logs.length} 局（この端末のブラウザに保存）`));
    const all = el("button", "stage-btn", "全件 JSON");
    all.type = "button";
    all.addEventListener("click", () => actions.all());
    top.append(all);
    logsPane.append(top);
    for (const log of logs) {
      const s = summary(log);
      const item = el("div", "sheet-log");
      item.append(el("div", "sheet-log-title", s.title), el("div", "sheet-log-detail", s.detail));
      const row = el("div", "sheet-log-actions");
      for (const [text, fn] of [["KIF", () => actions.kif(log)], ["JSON", () => actions.json(log)], ["KIF をコピー", () => actions.copy(log)], ["削除", () => { if (confirm("このログを削除しますか？")) { actions.remove(log); renderLogs(); } }]]) {
        const b = el("button", "stage-btn", text);
        b.type = "button";
        b.addEventListener("click", fn);
        row.append(b);
      }
      item.append(row);
      logsPane.append(item);
    }
  }

  /* ---- 開閉・タブ ---- */
  function showTab(name) {
    const isSettings = name === "settings";
    settingsPane.hidden = !isSettings;
    logsPane.hidden = isSettings;
    foot.hidden = !isSettings;
    tabSettings.classList.toggle("sheet-tab--on", isSettings);
    tabLogs.classList.toggle("sheet-tab--on", !isSettings);
    if (isSettings) fillSettings(); else renderLogs();
    error.textContent = "";
    body.scrollTop = 0;
  }
  function open(tab = "settings", message = "") {
    overlay.hidden = false;
    showTab(tab);
    error.textContent = message;
  }
  function hide() { overlay.hidden = true; }

  tabSettings.addEventListener("click", () => showTab("settings"));
  tabLogs.addEventListener("click", () => showTab("logs"));
  close.addEventListener("click", hide);
  overlay.addEventListener("click", (e) => { if (e.target === overlay) hide(); });
  apply.addEventListener("click", () => {
    try {
      onApply(readSettings());
      hide();
    } catch (e) {
      error.textContent = e.message;
    }
  });

  return { open, close: hide, isOpen: () => !overlay.hidden, refreshLogs: () => { if (!logsPane.hidden) renderLogs(); } };
}
