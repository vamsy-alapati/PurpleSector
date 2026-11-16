/** 83.4567 → "1:23.457" */
export function formatTime(t: number | null | undefined): string {
  if (t == null || !Number.isFinite(t)) return '-:--.---';
  const ms = Math.round(t * 1000);
  const m = Math.floor(ms / 60000);
  const s = Math.floor(ms / 1000) % 60;
  const r = ms % 1000;
  return `${m}:${String(s).padStart(2, '0')}.${String(r).padStart(3, '0')}`;
}

/** 21.3 → "21.300" */
export function formatSector(t: number | null | undefined): string {
  if (t == null || !Number.isFinite(t)) return '--.---';
  return t.toFixed(3);
}

/** -0.1234 → "-0.123", 0.5 → "+0.500" */
export function formatDelta(d: number): string {
  return `${d < 0 ? '-' : '+'}${Math.abs(d).toFixed(3)}`;
}
