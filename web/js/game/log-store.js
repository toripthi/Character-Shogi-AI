/**
 * 対局ログの保存・一覧・削除・書き出し名。storage は localStorage 互換（getItem/setItem）。DOM に依存しない。
 */
export const LOG_KEY = "csai.gamelogs";
export const LOG_KEEP = 30;

export function listLogs(storage) {
  try {
    const all = JSON.parse(storage.getItem(LOG_KEY) ?? "[]");
    return Array.isArray(all) ? all : [];
  } catch {
    return [];
  }
}

/** 追加して最新 LOG_KEEP 件だけ残す。id を振って返す */
export function addLog(storage, log) {
  const entry = { ...log, id: log.id ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}` };
  const all = listLogs(storage).filter((l) => l.id !== entry.id);
  all.push(entry);
  storage.setItem(LOG_KEY, JSON.stringify(all.slice(-LOG_KEEP)));
  return entry;
}

export function removeLog(storage, id) {
  storage.setItem(LOG_KEY, JSON.stringify(listLogs(storage).filter((l) => l.id !== id)));
}

/** "csai-20261108-153012-ibisha-seme-d3-s7"（拡張子なし）。開始日時はローカル時刻 */
export function logFileBase(log) {
  const d = new Date(log.startedAt ?? Date.now());
  const p = (n) => String(n).padStart(2, "0");
  const stamp = `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
  const persona = log.engine?.personaId ?? log.config?.persona ?? "ai";
  const depth = log.config?.search?.depth ?? "x";
  const seed = log.engine?.seed ?? "x";
  return `csai-${stamp}-${persona}-d${depth}-s${seed}`;
}

/** 一覧の1行の見出し（日時・設定・結果・手数） */
export function logSummary(log, describe) {
  const d = new Date(log.startedAt ?? 0);
  const p = (n) => String(n).padStart(2, "0");
  const when = `${d.getMonth() + 1}/${d.getDate()} ${p(d.getHours())}:${p(d.getMinutes())}`;
  const persona = log.engine?.personaId ?? log.config?.persona ?? "AI";
  const result = log.result?.reason === "abandoned" ? "中断" : describe({ over: true, ...log.result }, log.humanSide);
  return { title: `${when}　${persona}　深さ${log.config?.search?.depth ?? "?"}　${log.humanSide === "SENTE" ? "先手" : "後手"}`, detail: `${log.moves?.length ?? 0}手　${result}${log.takebackCount ? `　待った${log.takebackCount}回` : ""}${log.playStyle ? `　［${log.playStyle}］` : ""}` };
}
