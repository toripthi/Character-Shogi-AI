/** Wilson 95%区間（z=1.96）。勝率の点推定だけを見ないため。 */
export function wilson95(wins, n) {
  if (n === 0) return { lo: 0, hi: 1 };
  const z = 1.96;
  const p = wins / n;
  const denom = 1 + (z * z) / n;
  const center = p + (z * z) / (2 * n);
  const delta = z * Math.sqrt((p * (1 - p) + (z * z) / (4 * n)) / n);
  return { lo: Math.max(0, (center - delta) / denom), hi: Math.min(1, (center + delta) / denom) };
}
