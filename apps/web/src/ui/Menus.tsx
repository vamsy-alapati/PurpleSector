import { useEffect, useState } from 'react';
import { formatTime } from '../lib/format';
import { NameForm, type FormError } from './NameForm';

function msUntilNextUtcMidnight(): number {
  const now = new Date();
  const next = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1);
  return next - now.getTime();
}

function formatCountdown(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

function NextTrackCountdown() {
  const [ms, setMs] = useState(msUntilNextUtcMidnight);
  useEffect(() => {
    const id = setInterval(() => setMs(msUntilNextUtcMidnight()), 1000);
    return () => clearInterval(id);
  }, []);
  return <span className="tabular font-mono">{formatCountdown(ms)}</span>;
}

export function StartMenu({
  trackName,
  dateLabel,
  best,
  playerName,
  touch,
  onStart,
  onRegister,
  onRecover,
  onPlayOffline,
  onLeaderboard,
  onOtherDevice,
}: {
  trackName: string;
  dateLabel: string;
  best: number | null;
  /** null → first visit: ask for a username before the first lap. */
  playerName: string | null;
  /** Phone/tablet: show touch instructions instead of keyboard keys. */
  touch: boolean;
  onStart: () => void;
  /** Resolves to an error message, or null on success. `offline` = server unreachable. */
  onRegister: (name: string) => Promise<FormError>;
  onRecover: (code: string) => Promise<FormError>;
  onPlayOffline: () => void;
  onLeaderboard: () => void;
  /** Show the recovery code (only when signed in). */
  onOtherDevice: (() => void) | null;
}) {
  return (
    <Overlay>
      <div className="text-[11px] font-black tracking-[0.5em] text-fuchsia-400">PURPLE SECTOR</div>
      <h1 className="mt-2 text-3xl font-black sm:text-4xl">One track. One day.</h1>
      <p className="mt-1 text-white/60">Find the limit.</p>

      <div className="mt-6 rounded-xl bg-white/5 px-4 py-3 text-left">
        <div className="flex items-baseline justify-between">
          <span className="text-[10px] font-bold tracking-widest text-white/50">TODAY'S TRACK</span>
          <span className="text-[11px] text-white/50">{dateLabel}</span>
        </div>
        <div className="text-xl font-bold">{trackName}</div>
        <div className="mt-1 flex justify-between text-sm text-white/60">
          <span>
            Your best: <span className="tabular font-mono text-fuchsia-300">{formatTime(best)}</span>
          </span>
        </div>
        <div className="mt-1 text-xs text-white/45">
          New track in <NextTrackCountdown />
        </div>
      </div>

      {playerName === null ? (
        <div className="mt-6">
          <NameForm
            submitLabel="START ENGINE"
            onRegister={onRegister}
            onRecover={onRecover}
            onPlayOffline={onPlayOffline}
          />
        </div>
      ) : (
        <>
          <button
            onClick={onStart}
            className="mt-6 w-full rounded-xl bg-red-500 px-6 py-3 text-lg font-black tracking-wide text-white transition hover:bg-red-400 active:scale-[0.98]"
          >
            START ENGINE
          </button>
          <p className="mt-2 text-xs text-white/40">
            Driving as <span className="font-bold text-white/70">{playerName}</span>
            {!touch && ' · or press Enter'}
          </p>
          {onOtherDevice && (
            <button onClick={onOtherDevice} className="mt-1 text-xs text-fuchsia-300/80 underline hover:text-fuchsia-200">
              Use this name on another device
            </button>
          )}
        </>
      )}

      <button
        onClick={onLeaderboard}
        className="mt-3 w-full rounded-xl bg-white/10 px-6 py-2.5 font-bold transition hover:bg-white/20"
      >
        🏆 Leaderboard
      </button>

      {touch ? (
        <p className="mt-5 text-sm text-white/60">
          Left thumb: <span className="font-bold text-white">◀ ▶</span> steer · Right thumb: <span className="font-bold text-red-300">BRAKE</span> + <span className="font-bold text-emerald-300">GAS</span>
          <span className="mt-1 block text-xs text-white/40">Landscape works best.</span>
        </p>
      ) : (
      <div className="mt-6 grid grid-cols-2 gap-x-6 gap-y-1 text-left text-sm text-white/70">
        <Key k="↑ / W">Throttle</Key>
        <Key k="↓ / S">Brake / reverse</Key>
        <Key k="← → / A D">Steer</Key>
        <Key k="R">Instant restart</Key>
        <Key k="C">Full track / chase cam</Key>
        <Key k="G">Ghost on / off</Key>
        <Key k="M">Sound on / off</Key>
        <Key k="L">Leaderboard</Key>
        <Key k="Esc">Pause</Key>
      </div>
      )}
    </Overlay>
  );
}

export function PauseMenu({
  playerName,
  onResume,
  onRestart,
  onMainMenu,
  onOtherDevice,
}: {
  playerName: string | null;
  onResume: () => void;
  onRestart: () => void;
  onMainMenu: () => void;
  /** Show the recovery code (only when signed in). */
  onOtherDevice: (() => void) | null;
}) {
  return (
    <Overlay>
      <h2 className="text-3xl font-black">PAUSED</h2>
      {playerName && (
        <p className="mt-1 text-xs text-white/40">
          Driving as <span className="font-bold text-white/70">{playerName}</span>
        </p>
      )}
      <div className="mt-6 flex flex-col gap-3">
        <button
          onClick={onResume}
          className="rounded-xl bg-red-500 px-6 py-3 font-black text-white transition hover:bg-red-400"
        >
          RESUME
        </button>
        <button
          onClick={onRestart}
          className="rounded-xl bg-white/10 px-6 py-3 font-bold transition hover:bg-white/20"
        >
          RESTART
        </button>
        <button
          onClick={onMainMenu}
          className="rounded-xl bg-white/10 px-6 py-3 font-bold transition hover:bg-white/20"
        >
          MAIN MENU
        </button>
      </div>
      {onOtherDevice && (
        <button onClick={onOtherDevice} className="mt-4 text-xs text-fuchsia-300/80 underline hover:text-fuchsia-200">
          Use this name on another device
        </button>
      )}
    </Overlay>
  );
}

function Overlay({ children }: { children: React.ReactNode }) {
  return (
    <div className="absolute inset-0 flex touch-pan-y justify-center overflow-y-auto bg-black/55 p-4 backdrop-blur-[2px]">
      <div className="my-auto w-full max-w-sm rounded-2xl border border-white/10 bg-neutral-950/85 p-6 text-center text-white shadow-2xl">
        {children}
      </div>
    </div>
  );
}

function Key({ k, children }: { k: string; children: React.ReactNode }) {
  return (
    <>
      <kbd className="font-mono text-xs text-red-300">{k}</kbd>
      <span>{children}</span>
    </>
  );
}
