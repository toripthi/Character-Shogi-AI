/**
 * 持ち時間（時間の使い方）。DOM・エンジンに依存しない純粋なロジック。
 *
 * 持ち時間の形（control）: null（無制限）または { mainMs, incrementMs, perMove }
 *   - mainMs      最初の持ち時間（ms）
 *   - incrementMs 1手指すごとに足す時間（ms。フィッシャー）。0 なら足さない
 *   - perMove     true なら「1手 mainMs 以内」。手番になるたびに mainMs に戻る（持ち時間は積み上がらない）
 * 時間切れ（残り 0 以下）になった側が負け（切れ負け）。
 *
 * 残り時間 = 通常: mainMs + incrementMs × (その側が指した手数) − その側の経過時間
 *           perMove: 手番の側は mainMs − 今の手に使った時間、手番でない側は mainMs
 * 「待った」で手数が減ると、取り消した手ぶんの加算も無くなる（経過時間は戻らない）。
 */
export const TIME_PRESETS = Object.freeze([
  { id: "none", label: "無制限", control: null },
  { id: "10m", label: "10分 切れ負け", control: { mainMs: 10 * 60_000, incrementMs: 0, perMove: false } },
  { id: "3m", label: "3分 切れ負け", control: { mainMs: 3 * 60_000, incrementMs: 0, perMove: false } },
  { id: "10s", label: "1手10秒", control: { mainMs: 10_000, incrementMs: 0, perMove: true } },
  { id: "5m5s", label: "5分＋5秒（フィッシャー）", control: { mainMs: 5 * 60_000, incrementMs: 5_000, perMove: false } },
  { id: "custom", label: "カスタム", control: undefined },
]);

export const DEFAULT_TIME = "none";

const numberOf = (text, label, { min, max, allowZero }) => {
  const t = String(text ?? "").trim();
  const n = Number(t);
  if (t === "" || !Number.isFinite(n) || n < 0 || (!allowZero && n === 0) || n > max || n < (min ?? 0)) {
    throw new Error(`${label} の値が不正です: "${t}"`);
  }
  return n;
};

/**
 * 画面の入力（time: プリセット id、customMin: 持ち時間（分）、customInc: 1手ごとの加算（秒））→ control。
 * 不正な値はエラー（黙って直さない）。
 */
export function buildTimeControl({ time = DEFAULT_TIME, customMin = "10", customInc = "0" } = {}) {
  const preset = TIME_PRESETS.find((p) => p.id === String(time));
  if (!preset) throw new Error(`time の値が不正です: "${time}"（${TIME_PRESETS.map((p) => p.id).join(", ")}）`);
  if (preset.id !== "custom") return preset.control ? { ...preset.control } : null;
  const min = numberOf(customMin, "持ち時間（分）", { max: 600, allowZero: false });
  const inc = numberOf(customInc, "1手ごとの加算（秒）", { max: 600, allowZero: true });
  return { mainMs: Math.round(min * 60_000), incrementMs: Math.round(inc * 1000), perMove: false };
}

/** 残り時間（ms）。無制限なら null。elapsedMs=その側の経過時間の累計、turnMs=今の手に使った時間（手番の側だけ）、moves=その側が指した手数 */
export function remainingMs(control, { elapsedMs, turnMs, moves, onMove }) {
  if (!control) return null;
  if (control.perMove) return control.mainMs - (onMove ? turnMs : 0);
  return control.mainMs + control.incrementMs * moves - elapsedMs;
}

const trim = (n) => String(Math.round(n * 100) / 100);
function spanText(ms) {
  const s = ms / 1000;
  if (s >= 60 && s % 60 === 0) return `${trim(s / 60)}分`;
  if (s >= 60) return `${trim(s / 60)}分`;
  return `${trim(s)}秒`;
}

/** 表示・KIF 用の短い文面 */
export function describeTimeControl(control) {
  if (!control) return "無制限";
  if (control.perMove) return `1手${spanText(control.mainMs)}`;
  if (control.incrementMs > 0) return `${spanText(control.mainMs)}＋${trim(control.incrementMs / 1000)}秒`;
  return `${spanText(control.mainMs)} 切れ負け`;
}
