/** Shared helpers for the API (Cloudflare Worker). */
import { buildTrack, generateTrackDef, utcDateKey, type Track } from '@purple-sector/sim';

export interface Env {
  DB: D1Database;
  /** The game's static files (apps/web/dist). */
  ASSETS: Fetcher;
}

export function json(data: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers },
  });
}

export function error(status: number, message: string): Response {
  return json({ error: message }, status);
}

export async function readJson<T>(request: Request, maxBytes = 64 * 1024): Promise<T | null> {
  const text = await request.text();
  if (text.length > maxBytes) return null;
  try {
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

// ---------- days ----------

export function today(now = new Date()): string {
  return utcDateKey(now);
}

export function dayOffset(day: string, offset: number): string {
  const [y, m, d] = day.split('-').map(Number) as [number, number, number];
  return utcDateKey(new Date(Date.UTC(y, m - 1, d + offset)));
}

export const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Laps for yesterday's track are still accepted for a few minutes after midnight (lap in progress). */
export function acceptsLapsFor(day: string, now = new Date()): boolean {
  const t = today(now);
  if (day === t) return true;
  const sinceMidnight = now.getTime() - Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return day === dayOffset(t, -1) && sinceMidnight < 10 * 60 * 1000;
}

// ---------- tracks (cached per server instance) ----------

const trackCache = new Map<string, Track>();

export function trackFor(day: string): Track {
  let t = trackCache.get(day);
  if (!t) {
    t = buildTrack(generateTrackDef(day));
    if (trackCache.size > 4) trackCache.clear();
    trackCache.set(day, t);
  }
  return t;
}

// ---------- players ----------

function hex(bytes: ArrayBuffer | Uint8Array): string {
  return [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function newToken(): string {
  return hex(crypto.getRandomValues(new Uint8Array(32)));
}

export async function hashToken(token: string): Promise<string> {
  return hex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token)));
}

export interface PlayerRow {
  id: string;
  name: string;
}

/** The player behind `Authorization: Bearer <token>`, or null. */
export async function authPlayer(request: Request, env: Env): Promise<PlayerRow | null> {
  const m = /^Bearer ([0-9a-f]{64})$/.exec(request.headers.get('authorization') ?? '');
  if (!m) return null;
  return env.DB.prepare('SELECT id, name FROM players WHERE token_hash = ?').bind(await hashToken(m[1]!)).first<PlayerRow>();
}

// ---------- usernames ----------

const RESERVED = ['admin', 'administrator', 'moderator', 'mod', 'system', 'purplesector', 'purple sector', 'official', 'support'];
/** Deliberately short; catches the obvious. Extend as needed. */
const BLOCKED = ['fuck', 'shit', 'cunt', 'nigg', 'fag', 'bitch', 'whore', 'slut', 'rape', 'nazi', 'hitler', 'dick', 'pussy', 'penis', 'vagina', 'porn', 'sex'];

function normaliseForFilter(s: string): string {
  return s
    .toLowerCase()
    .replace(/0/g, 'o')
    .replace(/1/g, 'i')
    .replace(/3/g, 'e')
    .replace(/4/g, 'a')
    .replace(/5/g, 's')
    .replace(/7/g, 't')
    .replace(/@/g, 'a')
    .replace(/[^a-z]/g, '');
}

/** Returns the cleaned name, or an error message. */
export function validateName(raw: unknown): { name: string } | { error: string } {
  if (typeof raw !== 'string') return { error: 'Name is required' };
  const name = raw.trim().replace(/\s+/g, ' ');
  if (name.length < 3 || name.length > 16) return { error: 'Name must be 3–16 characters' };
  if (!/^[A-Za-z0-9_.\- ]+$/.test(name)) return { error: 'Use letters, numbers, spaces, _ . -' };
  const key = name.toLowerCase();
  if (RESERVED.includes(key)) return { error: 'That name is reserved' };
  const n = normaliseForFilter(name);
  if (BLOCKED.some((w) => n.includes(w))) return { error: 'Please choose a different name' };
  return { name };
}
