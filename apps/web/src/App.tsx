import { useEffect, useMemo, useRef, useState } from 'react';
import { generateTrackDef, utcDateKey } from '@purple-sector/sim';
import { Game, INITIAL_HUD, type HudState } from './game/Game';
import { Hud } from './ui/Hud';
import { PauseMenu, StartMenu } from './ui/Menus';

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gameRef = useRef<Game | null>(null);
  const [hud, setHud] = useState<HudState>(INITIAL_HUD);

  // Today's track (UTC date → seed → track). Optional ?seed=anything for testing other tracks.
  const { def, dateLabel } = useMemo(() => {
    const now = new Date();
    const seed = new URLSearchParams(window.location.search).get('seed') ?? utcDateKey(now);
    const label = now.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
    return { def: generateTrackDef(seed), dateLabel: label };
  }, []);

  useEffect(() => {
    const game = new Game(canvasRef.current!, def, setHud);
    gameRef.current = game;
    return () => {
      game.destroy();
      gameRef.current = null;
    };
  }, [def]);

  return (
    <div className="fixed inset-0 overflow-hidden bg-[#0b0f0d] text-white">
      <canvas ref={canvasRef} className="absolute inset-0 block h-full w-full" />
      <Hud
        hud={hud}
        onToggleView={() => gameRef.current?.toggleView()}
        onToggleGhost={() => gameRef.current?.toggleGhost()}
        onToggleSound={() => gameRef.current?.toggleSound()}
      />
      {hud.phase === 'ready' && (
        <StartMenu
          trackName={hud.trackName}
          dateLabel={dateLabel}
          best={hud.bestLap}
          onStart={() => gameRef.current?.start()}
        />
      )}
      {hud.phase === 'paused' && (
        <PauseMenu onResume={() => gameRef.current?.togglePause()} onRestart={() => gameRef.current?.restart()} />
      )}
    </div>
  );
}
