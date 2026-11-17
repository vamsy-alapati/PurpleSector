import { useState } from 'react';
import type { AttemptResult, SectorStatus } from '../game/Game';
import { formatDelta, formatSector, formatTime } from '../lib/format';
import { copyToClipboard, nativeShare, playUrl, SHARE_TARGETS, shareText } from '../lib/share';

/** Where the lap's leaderboard submission is at. */
export type Submission =
  | { state: 'idle' }
  | { state: 'sending' }
  | { state: 'done'; rank: number; total: number; improved: boolean; best: number }
  | { state: 'error'; message: string }
  | { state: 'offline' };

const CHIP: Record<SectorStatus, string> = {
  best: 'bg-fuchsia-500 text-white',
  pb: 'bg-emerald-500 text-black',
  slower: 'bg-amber-400 text-black',
  invalid: 'bg-neutral-600 text-white/70',
};

export function ResultsPopup({
  result,
  trackName,
  dateLabel,
  submission,
  onRetry,
  onLeaderboard,
  onSaveLap,
  onMainMenu,
}: {
  result: AttemptResult;
  trackName: string;
  dateLabel: string;
  submission: Submission;
  onRetry: () => void;
  onLeaderboard: () => void;
  /** Lap was driven without a name: offer to pick one and submit it. */
  onSaveLap: (() => void) | null;
  onMainMenu: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const [showTargets, setShowTargets] = useState(false);
  const ranked = submission.state === 'done' ? submission : null;
  const text = shareText(result, trackName, dateLabel, ranked ? { rank: ranked.rank, total: ranked.total } : null);
  const link = playUrl();

  const share = async () => {
    // Phones: native share sheet. Desktop (or if cancelled): show the buttons.
    if (!(await nativeShare(text, link))) setShowTargets(true);
  };
  const copy = async () => {
    if (await copyToClipboard(`${text}\n${link}`)) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="absolute inset-0 flex touch-pan-y justify-center overflow-y-auto bg-black/60 p-4 backdrop-blur-[2px]">
      <div className="my-auto w-full max-w-sm rounded-2xl border border-white/10 bg-neutral-950/90 p-6 text-center text-white shadow-2xl">
        <div className="text-[11px] font-black tracking-[0.4em] text-fuchsia-400">
          {result.valid ? (result.newPb ? 'NEW PERSONAL BEST' : 'LAP COMPLETE') : 'LAP INVALID'}
        </div>

        <div
          className={`tabular mt-2 font-mono text-5xl font-black ${
            result.valid ? (result.newPb ? 'text-fuchsia-300' : 'text-white') : 'text-red-400 line-through'
          }`}
        >
          {formatTime(result.time)}
        </div>

        {result.valid ? (
          <div className="mt-1 text-sm text-white/60">
            {result.pbDelta === null ? (
              'First lap on today’s track'
            ) : (
              <>
                vs your best{' '}
                <span className={`tabular font-mono ${result.pbDelta < 0 ? 'text-emerald-300' : 'text-amber-300'}`}>
                  {formatDelta(result.pbDelta)}
                </span>
              </>
            )}
          </div>
        ) : (
          <div className="mt-1 text-sm text-white/60">Track limits exceeded. Keep it inside the kerbs!</div>
        )}

        <div className="mt-4 grid grid-cols-3 gap-1.5">
          {[0, 1, 2].map((i) => {
            const st = result.sectorStatus[i];
            return (
              <div key={i} className={`rounded-md py-1 ${st ? CHIP[st] : 'bg-white/10'}`}>
                <div className="text-[9px] font-bold opacity-70">S{i + 1}</div>
                <div className="tabular font-mono text-xs font-bold">{formatSector(result.sectors[i])}</div>
              </div>
            );
          })}
        </div>

        <div className="mt-3 text-sm">
          {result.valid && submission.state === 'sending' && <span className="text-white/50">Submitting to the leaderboard…</span>}
          {ranked && (
            <span className="text-white/80">
              Today’s rank <span className="font-black text-fuchsia-300">#{ranked.rank}</span>
              <span className="text-white/50"> of {ranked.total}</span>
              {!ranked.improved && (
                <span className="block text-xs text-white/50">
                  (your best today: <span className="tabular font-mono">{formatTime(ranked.best)}</span>)
                </span>
              )}
            </span>
          )}
          {submission.state === 'error' && <span className="text-amber-300">Not submitted: {submission.message}</span>}
          {submission.state === 'offline' && (
            <span className="text-white/50">
              Your best: <span className="tabular font-mono text-fuchsia-300">{formatTime(result.bestTime)}</span> (not on the
              leaderboard)
            </span>
          )}
        </div>

        {result.valid && submission.state === 'offline' && onSaveLap && (
          <button
            onClick={onSaveLap}
            className="mt-3 w-full rounded-xl border border-fuchsia-400/60 bg-fuchsia-500/15 px-4 py-2.5 font-bold text-fuchsia-100 transition hover:bg-fuchsia-500/30"
          >
            Pick a name to save this lap
          </button>
        )}

        <div className="mt-5 flex gap-2">
          <button
            onClick={onRetry}
            className="flex-1 rounded-xl bg-red-500 px-4 py-3 font-black tracking-wide text-white transition hover:bg-red-400 active:scale-[0.98]"
          >
            RETRY <span className="ml-1 font-mono text-xs opacity-70">R</span>
          </button>
          {result.valid && (
            <button
              onClick={share}
              className="flex-1 rounded-xl bg-fuchsia-500 px-4 py-3 font-black tracking-wide text-white transition hover:bg-fuchsia-400 active:scale-[0.98]"
            >
              SHARE
            </button>
          )}
        </div>

        <button
          onClick={onLeaderboard}
          className="mt-2 w-full rounded-xl bg-white/10 px-4 py-2.5 font-bold transition hover:bg-white/20"
        >
          🏆 Leaderboard <span className="ml-1 font-mono text-xs text-fuchsia-300">L</span>
        </button>
        <button onClick={onMainMenu} className="mt-3 text-xs text-white/50 underline hover:text-white/80">
          Main menu
        </button>

        {result.valid && showTargets && (
          <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
            {SHARE_TARGETS.map((t) => (
              <a
                key={t.id}
                href={t.url(text, link)}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-lg bg-white/10 px-3 py-2 font-bold transition hover:bg-white/20"
              >
                {t.label}
              </a>
            ))}
            <button
              onClick={copy}
              className="col-span-2 rounded-lg bg-white/10 px-3 py-2 font-bold transition hover:bg-white/20"
            >
              {copied ? 'Copied!' : 'Copy text + link'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
