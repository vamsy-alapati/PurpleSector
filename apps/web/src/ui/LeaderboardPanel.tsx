import { useCallback, useEffect, useState } from 'react';
import { api, type Leaderboard, type Player } from '../lib/api';
import { formatTime } from '../lib/format';

export function LeaderboardPanel({
  day,
  trackName,
  player,
  onClose,
  onRaceGhost,
}: {
  day: string;
  trackName: string;
  player: Player | null;
  onClose: () => void;
  /** Load that player's lap as the ghost and start racing it. */
  onRaceGhost: (playerId: string, name: string) => Promise<void>;
}) {
  const [board, setBoard] = useState<Leaderboard | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loadingGhost, setLoadingGhost] = useState<string | null>(null);

  const load = useCallback(() => {
    setErr(null);
    api
      .leaderboard(day, player)
      .then(setBoard)
      .catch((e: Error) => setErr(e.message));
  }, [day, player]);

  useEffect(load, [load]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'Escape' || e.code === 'KeyL') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const leader = board?.entries[0]?.time ?? null;
  const meInTop = board?.entries.some((e) => e.playerId === player?.id) ?? false;

  return (
    <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/65 p-3 backdrop-blur-[2px]" onClick={onClose}>
      <div
        className="flex max-h-[88vh] w-full max-w-md flex-col rounded-2xl border border-white/10 bg-neutral-950/95 text-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 border-b border-white/10 px-5 pb-3 pt-4">
          <div>
            <div className="text-[11px] font-black tracking-[0.4em] text-fuchsia-400">LEADERBOARD</div>
            <div className="text-lg font-bold">{trackName}</div>
            <div className="text-xs text-white/50">
              Today · {board ? `${board.total} driver${board.total === 1 ? '' : 's'}` : '…'}
            </div>
          </div>
          <button onClick={onClose} className="rounded-lg bg-white/10 px-3 py-1.5 text-sm font-bold hover:bg-white/20">
            Close <span className="font-mono text-[10px] text-fuchsia-300">L</span>
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-2 py-2">
          {err && (
            <div className="p-6 text-center text-sm text-white/70">
              {err}
              <button onClick={load} className="mt-3 block w-full rounded-lg bg-white/10 py-2 font-bold hover:bg-white/20">
                Try again
              </button>
            </div>
          )}
          {!err && !board && <div className="p-6 text-center text-sm text-white/50">Loading…</div>}
          {board && board.entries.length === 0 && (
            <div className="p-6 text-center text-sm text-white/60">No laps yet today. Set the first time!</div>
          )}
          {board?.entries.map((e) => {
            const mine = e.playerId === player?.id;
            return (
              <div
                key={e.playerId}
                className={`flex items-center gap-3 rounded-lg px-3 py-2 ${mine ? 'bg-fuchsia-500/20 ring-1 ring-fuchsia-400/50' : 'odd:bg-white/[0.03]'}`}
              >
                <div className={`tabular w-8 text-right font-mono text-sm font-bold ${e.rank <= 3 ? 'text-fuchsia-300' : 'text-white/60'}`}>
                  {e.rank}
                </div>
                <div className="min-w-0 flex-1 truncate font-semibold">
                  {e.name}
                  {mine && <span className="ml-1 text-xs text-fuchsia-300">(you)</span>}
                </div>
                <div className="text-right">
                  <div className="tabular font-mono text-sm font-bold">{formatTime(e.time)}</div>
                  {leader !== null && e.rank > 1 && (
                    <div className="tabular font-mono text-[10px] text-white/40">+{(e.time - leader).toFixed(3)}</div>
                  )}
                </div>
                <button
                  disabled={loadingGhost !== null}
                  onClick={async () => {
                    setLoadingGhost(e.playerId);
                    try {
                      await onRaceGhost(e.playerId, e.name);
                    } catch (x) {
                      setErr((x as Error).message);
                    } finally {
                      setLoadingGhost(null);
                    }
                  }}
                  title={`Race ${e.name}'s ghost`}
                  className="rounded-md bg-white/10 px-2 py-1 text-xs font-bold transition hover:bg-fuchsia-500 disabled:opacity-50"
                >
                  {loadingGhost === e.playerId ? '…' : '👻 Race'}
                </button>
              </div>
            );
          })}
        </div>

        {board?.me && !meInTop && (
          <div className="border-t border-white/10 px-5 py-3 text-sm">
            You: <span className="font-bold">#{board.me.rank}</span> ·{' '}
            <span className="tabular font-mono">{formatTime(board.me.time)}</span>
          </div>
        )}
        {!player && (
          <div className="border-t border-white/10 px-5 py-3 text-xs text-white/50">
            Pick a name before your first lap to appear here.
          </div>
        )}
      </div>
    </div>
  );
}
