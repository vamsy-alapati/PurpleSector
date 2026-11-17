import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { decodeInputs, generateTrackDef, ghostFromInputs, utcDateKey } from '@purple-sector/sim';
import { DEFAULT_INSETS, Game, INITIAL_HUD, type HudState } from './game/Game';
import { api, ApiError, forgetPlayer, loadPlayer, savePlayer, type Player } from './lib/api';
import { Hud } from './ui/Hud';
import { LeaderboardPanel } from './ui/LeaderboardPanel';
import { PauseMenu, StartMenu } from './ui/Menus';
import { NameForm, type FormError } from './ui/NameForm';
import { NamePopup, RecoveryPanel } from './ui/RecoveryPanel';
import { ResultsPopup, type Submission } from './ui/Results';
import { enterMobileFullscreen, TouchControls, useTouchDevice, useViewport } from './ui/TouchControls';

/** The last completed attempt's recording, so it can still be submitted after picking a name. */
interface Attempt {
  day: string;
  inputs: string;
}

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gameRef = useRef<Game | null>(null);
  const [hud, setHud] = useState<HudState>(INITIAL_HUD);
  const [player, setPlayer] = useState<Player | null>(loadPlayer);
  const [offline, setOffline] = useState(false);
  const [showBoard, setShowBoard] = useState(false);
  const [showRecovery, setShowRecovery] = useState(false);
  /** Name popup shown mid-game: to save the lap just driven, or before racing a chosen ghost. */
  const [namePopup, setNamePopup] = useState<null | 'save-lap' | 'race-ghost'>(null);
  const [submission, setSubmission] = useState<Submission>({ state: 'idle' });

  // Callbacks created once with the Game read the latest values through refs
  const playerRef = useRef(player);
  playerRef.current = player;
  const lastAttempt = useRef<Attempt | null>(null);

  // Today's track (UTC date → seed → track). Optional ?seed=anything for testing other tracks.
  const { def, day, dateLabel, practice } = useMemo(() => {
    const now = new Date();
    const seedParam = new URLSearchParams(window.location.search).get('seed');
    const day = utcDateKey(now);
    const label = now.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
    return { def: generateTrackDef(seedParam ?? day), day, dateLabel: label, practice: seedParam !== null };
  }, []);

  const submit = useCallback((p: Player, attempt: Attempt) => {
    setSubmission({ state: 'sending' });
    api
      .submitLap(p, attempt.day, attempt.inputs)
      .then((r) => setSubmission({ state: 'done', rank: r.rank ?? 0, total: r.total ?? 0, improved: r.improved, best: r.best }))
      .catch((e: ApiError) => setSubmission({ state: 'error', message: e.message }));
  }, []);

  useEffect(() => {
    const game = new Game(canvasRef.current!, def, setHud, ({ day: lapDay, inputs }) => {
      lastAttempt.current = { day: lapDay, inputs };
      const p = playerRef.current;
      if (!p || practice) setSubmission({ state: 'offline' });
      else submit(p, lastAttempt.current);
    });
    gameRef.current = game;
    return () => {
      game.destroy();
      gameRef.current = null;
    };
  }, [def, practice, submit]);

  // Refresh our identity from the server (picks up a name transfer; drops a deleted player)
  useEffect(() => {
    const p = playerRef.current;
    if (!p) return;
    api
      .me(p)
      .then((me) => {
        if (me.id !== p.id || me.name !== p.name) {
          const updated = { ...p, id: me.id, name: me.name };
          savePlayer(updated);
          setPlayer(updated);
        }
      })
      .catch((e: ApiError) => {
        if (e.status === 401) {
          forgetPlayer();
          setPlayer(null);
        }
      });
  }, []);

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
    const g = gameRef.current;
    if (!g) return;
    if (hud.phase === 'ready') g.start();
    else g.restart();
  }, [touch, hud.phase]);

  // Game hotkeys are off while typing a name or a menu panel is open
  const overlayOpen = showBoard || showRecovery || namePopup !== null;
  useEffect(() => {
    gameRef.current?.setKeysEnabled(!overlayOpen && !(needsName && hud.phase === 'ready'));
  }, [overlayOpen, needsName, hud.phase]);

  const openBoard = useCallback(() => {
    gameRef.current?.pause();
    setShowBoard(true);
  }, []);

  // "L" opens the leaderboard from anywhere (the panel itself handles closing)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el?.tagName === 'INPUT') return;
      if (e.code === 'KeyL' && !overlayOpen) openBoard();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [overlayOpen, openBoard]);

  // ---------- identity ----------

  const toFormError = (e: unknown): FormError => {
    const err = e as ApiError;
    return { error: err.message, offline: err.status === 0 || err.status >= 500 };
  };

  /** Signed in (new name or recovery code) → continue whatever the player was doing. */
  const signedIn = (p: Player, context: 'start' | 'save-lap' | 'race-ghost') => {
    savePlayer(p);
    setPlayer(p);
    playerRef.current = p;
    setNamePopup(null);
    gameRef.current?.setKeysEnabled(true);
    if (context === 'save-lap') {
      if (lastAttempt.current && !practice) submit(p, lastAttempt.current);
    } else {
      startGame();
    }
  };

  const register = (context: 'start' | 'save-lap' | 'race-ghost') => async (name: string) => {
    try {
      signedIn(await api.register(name), context);
      return null;
    } catch (e) {
      return toFormError(e);
    }
  };

  const recover = (context: 'start' | 'save-lap' | 'race-ghost') => async (code: string) => {
    try {
      signedIn(await api.recover(code), context);
      return null;
    } catch (e) {
      return toFormError(e);
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
    // A name is required before driving: the start screen (or a popup) asks first, then the race begins
    if (!playerRef.current && !offline) {
      if (hud.phase !== 'ready') setNamePopup('race-ghost');
      return;
    }
    startGame();
  };

  return (
    <div className="fixed inset-0 overflow-hidden bg-[#0b0f0d] text-white">
      <canvas ref={canvasRef} className="absolute inset-0 block h-full w-full" />
      {touch && (hud.phase === 'running' || hud.phase === 'countdown') && !overlayOpen && (
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
      {hud.phase === 'ready' && !overlayOpen && (
        <StartMenu
          trackName={hud.trackName + (practice ? ' (practice)' : '')}
          dateLabel={dateLabel}
          best={hud.bestLap}
          playerName={needsName ? null : (player?.name ?? 'Offline')}
          touch={touch}
          onStart={startGame}
          onRegister={register('start')}
          onRecover={recover('start')}
          onPlayOffline={() => {
            setOffline(true);
            gameRef.current?.setKeysEnabled(true);
            startGame();
          }}
          onLeaderboard={openBoard}
          onOtherDevice={player ? () => setShowRecovery(true) : null}
        />
      )}
      {hud.phase === 'paused' && !overlayOpen && (
        <PauseMenu
          playerName={player?.name ?? null}
          onResume={() => gameRef.current?.togglePause()}
          onRestart={() => gameRef.current?.restart()}
          onMainMenu={() => gameRef.current?.toMenu()}
          onOtherDevice={player ? () => setShowRecovery(true) : null}
        />
      )}
      {hud.phase === 'finished' && hud.result && !overlayOpen && (
        <ResultsPopup
          result={hud.result}
          trackName={hud.trackName}
          dateLabel={dateLabel}
          submission={submission}
          onRetry={() => gameRef.current?.restart()}
          onLeaderboard={openBoard}
          onSaveLap={!player && !practice ? () => setNamePopup('save-lap') : null}
          onMainMenu={() => gameRef.current?.toMenu()}
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
      {showRecovery && player && <RecoveryPanel player={player} onClose={() => setShowRecovery(false)} />}
      {namePopup && (
        <NamePopup onClose={() => setNamePopup(null)}>
          <NameForm
            submitLabel={namePopup === 'save-lap' ? 'SAVE MY LAP' : 'START ENGINE'}
            onRegister={register(namePopup)}
            onRecover={recover(namePopup)}
          />
        </NamePopup>
      )}
    </div>
  );
}
