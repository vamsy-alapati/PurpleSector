import type { HudState, SectorStatus } from '../game/Game';
import { formatSector, formatTime } from '../lib/format';

const SECTOR_STYLE: Record<SectorStatus, string> = {
  best: 'bg-fuchsia-500 text-white',
  pb: 'bg-emerald-500 text-black',
  slower: 'bg-amber-400 text-black',
  invalid: 'bg-neutral-600 text-white/70',
};

const FLASH_STYLE = {
  best: 'text-fuchsia-300',
  good: 'text-emerald-300',
  bad: 'text-amber-300',
} as const;

export interface HudActions {
  onToggleView: () => void;
  onToggleGhost: () => void;
  onToggleSound: () => void;
  onLeaderboard: () => void;
  onRestart: () => void;
  onPause: () => void;
}

export function Hud({ hud, touch, ...a }: { hud: HudState; touch: boolean } & HudActions) {
  const driving = hud.phase !== 'ready';
  return (
    <div className="pointer-events-none absolute inset-0 font-sans text-white">
      {/* Top-left: brand + track (hidden on narrow phones to make room) */}
      <div className="absolute left-4 top-4 hidden rounded-lg bg-black/45 px-3 py-2 backdrop-blur-sm sm:block">
        <div className="text-[10px] font-black tracking-[0.35em] text-fuchsia-400">PURPLE SECTOR</div>
        <div className="text-sm font-semibold">{hud.trackName}</div>
        {driving && (
          <div className="text-xs text-white/60">{hud.lapNumber > 0 ? `LAP ${hud.lapNumber}` : 'OUT LAP'}</div>
        )}
      </div>

      {/* Lap timer: top-left on narrow phones, top-centre otherwise */}
      {driving && (
        <div className="absolute left-3 top-3 text-left sm:left-1/2 sm:top-4 sm:-translate-x-1/2 sm:text-center">
          <div
            className={`tabular inline-block rounded-lg bg-black/55 px-3 py-1 font-mono text-2xl font-bold sm:px-4 sm:text-4xl ${
              hud.lapValid ? '' : 'text-red-400 line-through decoration-2'
            }`}
          >
            {formatTime(hud.lapTime)}
          </div>
          {touch && (
            <div className="tabular mt-1 font-mono text-sm font-bold text-white/80 drop-shadow">
              {hud.speedKmh} <span className="text-[10px] text-white/50">KM/H</span>
              {hud.offTrack && <span className="ml-2 text-amber-300">OFF TRACK</span>}
            </div>
          )}
          {hud.flash && (
            <div
              key={hud.flash.id}
              className={`tabular mt-1 font-mono text-base font-bold drop-shadow sm:mt-2 sm:text-lg ${FLASH_STYLE[hud.flash.tone]}`}
            >
              {hud.flash.text}
            </div>
          )}
        </div>
      )}

      {/* Top-right: best / last / sectors (+ icon buttons on touch devices) */}
      <div className="absolute right-3 top-3 flex flex-col items-end gap-2 sm:right-4 sm:top-4">
        <div className="min-w-36 rounded-lg bg-black/45 px-2.5 py-1.5 text-xs backdrop-blur-sm sm:min-w-44 sm:px-3 sm:py-2 sm:text-sm">
          <Row label="BEST" value={formatTime(hud.bestLap)} accent="text-fuchsia-300" />
          <Row
            label="LAST"
            value={hud.lastLap ? formatTime(hud.lastLap.time) : formatTime(null)}
            accent={hud.lastLap && !hud.lastLap.valid ? 'text-red-400 line-through' : ''}
          />
          <div className="mt-1.5 grid grid-cols-3 gap-1">
            {[0, 1, 2].map((i) => {
              const st = hud.sectors[i];
              return (
                <div
                  key={i}
                  className={`tabular rounded px-1 py-0.5 text-center font-mono text-[10px] sm:text-[11px] ${
                    st ? SECTOR_STYLE[st] : 'bg-white/10 text-white/50'
                  }`}
                >
                  {st ? formatSector(hud.sectorTimes[i]) : `S${i + 1}`}
                </div>
              );
            })}
          </div>
        </div>
        {touch && driving && (
          <div className="pointer-events-auto flex flex-wrap justify-end gap-1.5">
            <IconButton label="Pause" onClick={a.onPause}>⏸</IconButton>
            <IconButton label="Restart" onClick={a.onRestart}>↻</IconButton>
            <IconButton label="Camera" onClick={a.onToggleView}>{hud.view === 'overview' ? '🗺️' : '🎥'}</IconButton>
            <IconButton label="Ghost" onClick={a.onToggleGhost} dim={!hud.ghostOn}>👻</IconButton>
            <IconButton label="Sound" onClick={a.onToggleSound} dim={!hud.soundOn}>{hud.soundOn ? '🔊' : '🔇'}</IconButton>
            <IconButton label="Leaderboard" onClick={a.onLeaderboard}>🏆</IconButton>
          </div>
        )}
      </div>

      {/* Bottom-centre: speed (keyboard layout; on touch it sits under the timer) */}
      {driving && !touch && (
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 text-center">
          <div className="tabular font-mono text-5xl font-black leading-none drop-shadow-lg">{hud.speedKmh}</div>
          <div className="text-[10px] font-bold tracking-[0.3em] text-white/60">KM/H</div>
          {hud.offTrack && <div className="mt-1 text-xs font-bold text-amber-300">OFF TRACK</div>}
        </div>
      )}

      {/* Bottom-left: toggles + controls hint (keyboard layout) */}
      {driving && !touch && (
        <div className="absolute bottom-4 left-4 flex flex-col items-start gap-2">
          <div className="pointer-events-auto flex max-w-[calc(100vw-2rem)] flex-wrap gap-2">
            <ToggleButton onClick={a.onToggleView} hotkey="C">
              {hud.view === 'overview' ? 'Full track' : 'Chase cam'}
            </ToggleButton>
            <ToggleButton onClick={a.onToggleGhost} hotkey="G" dim={!hud.ghostOn}>
              {hud.ghostOn && hud.ghostLabel ? `Ghost: ${hud.ghostLabel}` : `Ghost ${hud.ghostOn ? 'on' : 'off'}`}
            </ToggleButton>
            <ToggleButton onClick={a.onToggleSound} hotkey="M" dim={!hud.soundOn}>
              Sound {hud.soundOn ? 'on' : 'off'}
            </ToggleButton>
            <ToggleButton onClick={a.onLeaderboard} hotkey="L">
              🏆 Leaderboard
            </ToggleButton>
          </div>
          <div className="hidden text-[11px] leading-relaxed text-white/40 md:block">
            ↑ W throttle · ↓ S Space brake · ← → A D steer · R restart · Esc pause
          </div>
        </div>
      )}

      {/* Start lights */}
      {(hud.phase === 'countdown' || hud.showGo) && (
        <div className="absolute left-1/2 top-1/3 flex -translate-x-1/2 gap-3 rounded-2xl bg-black/70 px-5 py-4">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className={`h-10 w-10 rounded-full border-2 border-black transition-colors duration-75 ${
                hud.showGo ? 'bg-emerald-400' : i < hud.lights ? 'bg-red-500 shadow-[0_0_20px_#ef4444]' : 'bg-neutral-800'
              }`}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function IconButton({
  label,
  onClick,
  dim = false,
  children,
}: {
  label: string;
  onClick: () => void;
  dim?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      aria-label={label}
      title={label}
      onClick={onClick}
      className={`flex h-9 w-9 items-center justify-center rounded-lg bg-black/55 text-base backdrop-blur-sm active:bg-black/80 ${
        dim ? 'opacity-45' : ''
      }`}
    >
      {children}
    </button>
  );
}

function ToggleButton({
  onClick,
  hotkey,
  dim = false,
  children,
}: {
  onClick: () => void;
  hotkey: string;
  dim?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={(e) => {
        onClick();
        e.currentTarget.blur(); // keep Space/Enter for the game, not the button
      }}
      className={`rounded-lg bg-black/55 px-3 py-1.5 text-xs font-bold backdrop-blur-sm transition hover:bg-black/75 ${
        dim ? 'text-white/45' : 'text-white'
      }`}
    >
      {children} <span className="ml-1 font-mono text-[10px] text-red-400">{hotkey}</span>
    </button>
  );
}

function Row({ label, value, accent = '' }: { label: string; value: string; accent?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <span className="text-[10px] font-bold tracking-widest text-white/50">{label}</span>
      <span className={`tabular font-mono font-semibold ${accent}`}>{value}</span>
    </div>
  );
}
