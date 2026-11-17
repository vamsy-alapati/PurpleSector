/** Thin client for the Purple Sector API (Cloudflare Pages Functions under /api). */

export interface Player {
  id: string;
  name: string;
  token: string;
}

export interface LeaderboardEntry {
  rank: number;
  playerId: string;
  name: string;
  time: number;
  sectors: number[];
}

export interface Leaderboard {
  day: string;
  total: number;
  entries: LeaderboardEntry[];
  me: { rank: number; time: number } | null;
}

export interface SubmitResult {
  time: number;
  sectors: number[];
  improved: boolean;
  best: number;
  rank: number | null;
  total: number | null;
}

export interface GhostLap {
  name: string;
  time: number;
  inputs: string;
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

async function call<T>(path: string, init: RequestInit = {}, player?: Player | null): Promise<T> {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (player) headers.authorization = `Bearer ${player.token}`;
  let res: Response;
  try {
    res = await fetch(`/api/${path}`, { ...init, headers: { ...headers, ...(init.headers as object) } });
  } catch {
    throw new ApiError(0, 'Offline — check your connection');
  }
  const body = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) throw new ApiError(res.status, body.error ?? `Server error (${res.status})`);
  return body as T;
}

export const api = {
  register: (name: string) => call<Player>('players', { method: 'POST', body: JSON.stringify({ name }) }),
  me: (player: Player) => call<{ id: string; name: string }>('players/me', {}, player),
  recoveryCode: (player: Player) => call<{ code: string }>('players/recovery-code', { method: 'POST' }, player),
  recover: (code: string) => call<Player>('players/recover', { method: 'POST', body: JSON.stringify({ code }) }),
  submitLap: (player: Player, day: string, inputs: string) =>
    call<SubmitResult>('laps', { method: 'POST', body: JSON.stringify({ day, inputs }) }, player),
  leaderboard: (day: string, player: Player | null) =>
    call<Leaderboard>(`leaderboard?day=${encodeURIComponent(day)}`, {}, player),
  ghost: (day: string, playerId: string) =>
    call<GhostLap>(`ghost?day=${encodeURIComponent(day)}&player=${encodeURIComponent(playerId)}`),
};

// ---------- identity kept in this browser ----------

const KEY = 'ps:player';

export function loadPlayer(): Player | null {
  try {
    const p = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Player | null;
    return p && typeof p.token === 'string' && typeof p.name === 'string' ? p : null;
  } catch {
    return null;
  }
}

export function savePlayer(p: Player): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(p));
  } catch {
    /* ignore */
  }
}

export function forgetPlayer(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}
