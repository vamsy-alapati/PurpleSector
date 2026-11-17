import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { decodeInputs, generateTrackDef, ghostFromInputs, utcDateKey } from '@purple-sector/sim';
import { DEFAULT_INSETS, Game, INITIAL_HUD, type HudState } from './game/Game';
import { api, ApiError, loadPlayer, savePlayer, type Player } from './lib/api';
import { Hud } from './ui/Hud';
import { LeaderboardPanel } from './ui/LeaderboardPanel';
import { PauseMenu, StartMenu } from './ui/Menus';
import { ResultsPopup, type Submission } from './ui/Results';
import { enterMobileFullscreen, TouchControls, useTouchDevice, useViewport } from './ui/TouchControls';

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gameRef = useRef<Game | null>(null);
  const [hud, setHud] = useState<HudState>(INITIAL_HUD);
  const [player, setPlayer] = useState<Player | null>(loadPlayer);
  const [offline, setOffline] = useState(false);
  const [showBoard, setShowBoard] = useState(false);
  const [submission, setSubmission] = useState<Submission>({ state: 'idle' });

  // The submit callback is created once with the Game, so read the latest player via a ref
  const playerRef = useRef(player);
  playerRef.current = player;

  // Today's track (UTC date → seed → track). Optional ?seed=anything for testing other tracks.
  const { def, day, dateLabel, practice } = useMemo(() => {
    const now = new Date();
    const seedParam = new URLSearchParams(window.location.search).get('seed');
    const day = utcDateKey(now);
    const label = now.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
    return { def: generateTrackDef(seedParam ?? day), day, dateLabel: label, practice: seedParam !== null };
  }, []);

  useEffect(() => {
    const game = new Game(canvasRef.current!, def, setHud, ({ day: lapDay, inputs }) => {
      const p = playerRef.current;
      if (!p || practice) {
        setSubmission({ state: 'offline' });
        return;
      }
      setSubmission({ state: 'sending' });
      api
        .submitLap(p, lapDay, inputs)
        .then((r) =>
          setSubmission({ state: 'done', rank: r.rank ?? 0, total: r.total ?? 0, improved: r.improved, best: r.best }),
        )
        .catch((e: ApiError) => setSubmission({ state: 'error', message: e.message }));
    });
    gameRef.current = game;
    return () => {
      game.destroy();
      gameRef.current = null;
    };
  }, [def, practice]);

  // New attempt → clear the previous submission status
  useEffect(() => {
    if (hud.phase !== 'finished') setSubmission({ state: 'idle' });
  }, [hud.phase]);

  const needsName = player === null && !offline;

  // ---------- touch devices ----------
  const touch = useTouchDevice();
  const vp = useViewport();
  const landscape = vp.w > vp.h;
  const onTouchBits = useCallback((bits: number) => gameRef.current?.setTouchInput(bits), []);

  // Keep the full-track view clear of the on-screen controls
  useEffect(() => {
    const g = gameRef.current;
    if (!g) return;
    if (!touch) g.setInsets(DEFAULT_INSETS);
    else if (landscape) g.setInsets({ top: 52, bottom: 8, left: Math.min(170, vp.w * 0.2), right: Math.min(170, vp.w * 0.2) });
    else g.setInsets({ top: 120, bottom: 150, left: 8, right: 8 });
  }, [touch, landscape, vp.w]);

  /** Start driving (on phones: also try fullscreen + landscape — needs this tap/click). */
  const startGame = useCallback(() => {
    if (touch) void enterMobileFullscreen();
    gameRef.current?.start();
  }, [touch]);

  // Game hotkeys are off while typing a name or browsing the leaderboard
  useEffect(() => {
    gameRef.current?.setKeysEnabled(!showBoard && !(needsName && hud.phase === 'ready'));
  }, [showBoard, needsName, hud.phase]);

  const openBoard = useCallback(() => {
    gameRef.current?.pause();
    setShowBoard(true);
  }, []);

  // "L" opens the leaderboard from anywhere (the panel itself handles closing)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el?.tagName === 'INPUT') return;
      if (e.code === 'KeyL' && !showBoard) openBoard();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [showBoard, openBoard]);

  const register = async (name: string) => {
    try {
      const p = await api.register(name);
      savePlayer(p);
      setPlayer(p);
      gameRef.current?.setKeysEnabled(true);
      startGame();
      return null;
    } catch (e) {
      const err = e as ApiError;
      return { error: err.message, offline: err.status === 0 || err.status >= 500 };
    }
  };

  const raceGhost = async (playerId: string, name: string) => {
    const game = gameRef.current;
    if (!game) return;
    const lap = await api.ghost(day, playerId);
    const frames = ghostFromInputs(game.trackRef, decodeInputs(lap.inputs));
    if (frames.length < 8) throw new Error("Couldn't rebuild that lap");
    game.setGhost(frames, name);
    setShowBoard(false);
    if (hud.phase === 'ready') game.start();
    else game.restart();
  };

  return (
    <div className="fixed inset-0 overflow-hidden bg-[#0b0f0d] text-white">
      <canvas ref={canvasRef} className="absolute inset-0 block h-full w-full" />
      {touch && (hud.phase === 'running' || hud.phase === 'countdown') && !showBoard && (
        <TouchControls landscape={landscape} onChange={onTouchBits} />
      )}
      <Hud
        hud={hud}
        touch={touch}
        onToggleView={() => gameRef.current?.toggleView()}
        onToggleGhost={() => gameRef.current?.toggleGhost()}
        onToggleSound={() => gameRef.current?.toggleSound()}
        onLeaderboard={openBoard}
        onRestart={() => gameRef.current?.restart()}
        onPause={() => gameRef.current?.pause()}
      />
      {hud.phase === 'ready' && !showBoard && (
        <StartMenu
          trackName={hud.trackName + (practice ? ' (practice)' : '')}
          dateLabel={dateLabel}
          best={hud.bestLap}
          playerName={needsName ? null : (player?.name ?? 'Offline')}
          touch={touch}
          onStart={startGame}
          onRegister={register}
          onPlayOffline={() => {
            setOffline(true);
            gameRef.current?.setKeysEnabled(true);
            startGame();
          }}
          onLeaderboard={openBoard}
        />
      )}
      {hud.phase === 'paused' && !showBoard && (
        <PauseMenu onResume={() => gameRef.current?.togglePause()} onRestart={() => gameRef.current?.restart()} />
      )}
      {hud.phase === 'finished' && hud.result && !showBoard && (
        <ResultsPopup
          result={hud.result}
          trackName={hud.trackName}
          dateLabel={dateLabel}
          submission={submission}
          onRetry={() => gameRef.current?.restart()}
          onLeaderboard={openBoard}
        />
      )}
      {showBoard && (
        <LeaderboardPanel
          day={day}
          trackName={hud.trackName}
          player={player}
          onClose={() => setShowBoard(false)}
          onRaceGhost={raceGhost}
        />
      )}
    </div>
  );
}
