/**
 * 2択の確認ダイアログ（ブラウザの confirm は「OK / キャンセル」しか出せないので、文言を指定できるものを作った）。
 *   const dialog = createChoiceDialog();
 *   const yes = await dialog.ask({ message: "本当に「待った」しますか？", yes: "待ったする", no: "やっぱり待ったしない" });
 *   dialog.close();   // 開いていれば「いいえ」で閉じる
 * 外側タップ・Esc は「いいえ」。
 */
export function createChoiceDialog() {
  let overlay = null;
  let settle = null;

  function close(answer = false) {
    if (overlay) { overlay.remove(); overlay = null; }
    document.removeEventListener("keydown", onKey);
    if (settle) { const s = settle; settle = null; s(answer); }
  }
  function onKey(e) { if (e.key === "Escape") close(false); }

  function ask({ message, yes, no }) {
    close(false);
    return new Promise((resolve) => {
      settle = resolve;
      overlay = document.createElement("div");
      overlay.className = "dialog-overlay";
      const box = document.createElement("div");
      box.className = "dialog";
      box.setAttribute("role", "alertdialog");
      box.setAttribute("aria-modal", "true");
      const text = document.createElement("p");
      text.className = "dialog-message";
      text.textContent = message;
      const row = document.createElement("div");
      row.className = "dialog-actions";
      const mk = (label, cls, answer, id) => {
        const b = document.createElement("button");
        b.type = "button";
        b.className = `stage-btn ${cls}`;
        b.textContent = label;
        b.dataset.answer = String(answer);
        if (id) b.id = id;
        b.addEventListener("click", () => close(answer));
        return b;
      };
      row.append(mk(yes, "stage-btn--primary", true, "dialog-yes"), mk(no, "", false, "dialog-no"));
      box.append(text, row);
      overlay.append(box);
      overlay.addEventListener("click", (e) => { if (e.target === overlay) close(false); });
      document.addEventListener("keydown", onKey);
      document.body.append(overlay);
    });
  }

  return { ask, close: () => close(false), isOpen: () => overlay !== null };
}
