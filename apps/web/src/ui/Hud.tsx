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

export function Hud({
  hud,
  onToggleView,
  onToggleGhost,
  onToggleSound,
}: {
  hud: HudState;
  onToggleView: () => void;
  onToggleGhost: () => void;
  onToggleSound: () => void;
}) {
  const driving = hud.phase !== 'ready';
  return (
    <div className="pointer-events-none absolute inset-0 font-sans text-white">
      {/* Top-left: brand + track */}
      <div className="absolute left-4 top-4 rounded-lg bg-black/45 px-3 py-2 backdrop-blur-sm">
        <div className="text-[10px] font-black tracking-[0.35em] text-fuchsia-400">PURPLE SECTOR</div>
        <div className="text-sm font-semibold">{hud.trackName}</div>
        {driving && (
          <div className="text-xs text-white/60">{hud.lapNumber > 0 ? `LAP ${hud.lapNumber}` : 'OUT LAP'}</div>
        )}
      </div>

      {/* Top-centre: lap timer */}
      {driving && (
        <div className="absolute left-1/2 top-4 -translate-x-1/2 text-center">
          <div
            className={`tabular rounded-lg bg-black/55 px-4 py-1 font-mono text-3xl font-bold sm:text-4xl ${
              hud.lapValid ? '' : 'text-red-400 line-through decoration-2'
            }`}
          >
            {formatTime(hud.lapTime)}
          </div>
          {hud.flash && (
            <div
              key={hud.flash.id}
              className={`tabular mt-2 font-mono text-lg font-bold drop-shadow ${FLASH_STYLE[hud.flash.tone]}`}
            >
              {hud.flash.text}
            </div>
          )}
        </div>
      )}

      {/* Top-right: best / last / sectors */}
      <div className="absolute right-4 top-4 min-w-44 rounded-lg bg-black/45 px-3 py-2 text-sm backdrop-blur-sm">
        <Row label="BEST" value={formatTime(hud.bestLap)} accent="text-fuchsia-300" />
        <Row
          label="LAST"
          value={hud.lastLap ? formatTime(hud.lastLap.time) : formatTime(null)}
          accent={hud.lastLap && !hud.lastLap.valid ? 'text-red-400 line-through' : ''}
        />
        <div className="mt-2 grid grid-cols-3 gap-1">
          {[0, 1, 2].map((i) => {
            const st = hud.sectors[i];
            return (
              <div
                key={i}
                className={`tabular rounded px-1 py-0.5 text-center font-mono text-[11px] ${
                  st ? SECTOR_STYLE[st] : 'bg-white/10 text-white/50'
                }`}
              >
                {st ? formatSector(hud.sectorTimes[i]) : `S${i + 1}`}
              </div>
            );
          })}
        </div>
      </div>

      {/* Bottom-centre: speed */}
      {driving && (
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 text-center">
          <div className="tabular font-mono text-5xl font-black leading-none drop-shadow-lg">{hud.speedKmh}</div>
          <div className="text-[10px] font-bold tracking-[0.3em] text-white/60">KM/H</div>
          {hud.offTrack && <div className="mt-1 text-xs font-bold text-amber-300">OFF TRACK</div>}
        </div>
      )}

      {/* Bottom-left: view / ghost toggles + controls hint */}
      {driving && (
        <div className="absolute bottom-4 left-4 flex flex-col items-start gap-2">
          <div className="pointer-events-auto flex gap-2">
            <ToggleButton onClick={onToggleView} hotkey="C">
              {hud.view === 'overview' ? 'Full track' : 'Chase cam'}
            </ToggleButton>
            <ToggleButton onClick={onToggleGhost} hotkey="G" dim={!hud.ghostOn}>
              Ghost {hud.ghostOn ? 'on' : 'off'}
            </ToggleButton>
            <ToggleButton onClick={onToggleSound} hotkey="M" dim={!hud.soundOn}>
              Sound {hud.soundOn ? 'on' : 'off'}
            </ToggleButton>
          </div>
          <div className="hidden text-[11px] leading-relaxed text-white/40 md:block">
            ↑ W throttle · ↓ S brake · ← → A D steer · R restart · Esc pause
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
