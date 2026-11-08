/**
 * 簡易置換表（局面キー（fb.zkey() の Zobrist）+ 深さ + スコア + フラグ + bestMove）。
 * フラグ（4-0-7, K4）：exact（正確な値）／lower（真の値はこの値以上：βカットで得た値）／
 * upper（真の値はこの値以下：α以下で終わった値）。カットが起きた値を exact として保存しない。
 */

export function probeTt(tt, key, depth, alpha, beta) {
  const entry = tt.get(key);
  if (!entry || entry.depth < depth) {
    return null;
  }
  if (entry.flag === "exact") {
    return entry.score;
  }
  if (entry.flag === "lower" && entry.score >= beta) {
    return entry.score;
  }
  if (entry.flag === "upper" && entry.score <= alpha) {
    return entry.score;
  }
  return null;
}

/**
 * @param {"exact"|"lower"|"upper"} [flag] 既定 "exact"（旧呼び出しの互換）
 */
export function storeTt(tt, key, depth, score, bestMove, flag = "exact") {
  const prev = tt.get(key);
  if (prev && prev.depth > depth) {
    return;
  }
  tt.set(key, { depth, score, flag, bestMoveUsi: bestMove?.usi ?? null });
}
