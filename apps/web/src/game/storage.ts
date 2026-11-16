import type { GhostData } from './ghost';

/** Personal records kept in this browser (moves to the server in Phase 5). */
export interface TrackRecords {
  pb: { time: number; sectors: [number, number, number] } | null;
  bestSectors: [number | null, number | null, number | null];
}

export type ViewMode = 'overview' | 'chase';

export interface Settings {
  view: ViewMode;
  ghost: boolean;
  sound: boolean;
}

const DEFAULT_SETTINGS: Settings = { view: 'overview', ghost: true, sound: true };

function read<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function write(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* private mode / quota — ignore */
  }
}

export function loadRecords(trackId: string): TrackRecords {
  return read<TrackRecords>(`apex:records:${trackId}`) ?? { pb: null, bestSectors: [null, null, null] };
}

export function saveRecords(trackId: string, r: TrackRecords): void {
  write(`apex:records:${trackId}`, r);
}

export function loadGhost(trackId: string): GhostData | null {
  return read<GhostData>(`apex:ghost:${trackId}`);
}

export function saveGhost(trackId: string, g: GhostData): void {
  write(`apex:ghost:${trackId}`, g);
}

export function loadSettings(): Settings {
  return { ...DEFAULT_SETTINGS, ...read<Partial<Settings>>('apex:settings') };
}

export function saveSettings(s: Settings): void {
  write('apex:settings', s);
}
