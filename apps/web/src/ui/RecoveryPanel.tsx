import { useEffect, useState } from 'react';
import { api, type Player } from '../lib/api';
import { copyToClipboard } from '../lib/share';

/** Shows a recovery code so the player can use their name on another device. */
export function RecoveryPanel({ player, onClose }: { player: Player; onClose: () => void }) {
  const [code, setCode] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.code === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const generate = async () => {
    setBusy(true);
    setErr(null);
    try {
      setCode((await api.recoveryCode(player)).code);
    } catch (e) {
      setErr((e as Error).message);
    }
    setBusy(false);
  };

  return (
    <div className="absolute inset-0 z-30 flex touch-pan-y justify-center overflow-y-auto bg-black/65 p-4 backdrop-blur-[2px]" onClick={onClose}>
      <div
        className="my-auto w-full max-w-sm rounded-2xl border border-white/10 bg-neutral-950/95 p-6 text-center text-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="text-[11px] font-black tracking-[0.4em] text-fuchsia-400">USE ON ANOTHER DEVICE</div>
        <p className="mt-3 text-sm text-white/70">
          Get a recovery code for <span className="font-bold text-white">{player.name}</span>, then on the other device choose{' '}
          <span className="font-bold text-white">“I already have a name”</span> and enter it.
        </p>

        {code ? (
          <>
            <div className="tabular mt-4 select-all rounded-xl border border-fuchsia-400/40 bg-fuchsia-500/10 py-3 font-mono text-2xl font-black tracking-widest">
              {code}
            </div>
            <button
              onClick={async () => {
                if (await copyToClipboard(code)) {
                  setCopied(true);
                  setTimeout(() => setCopied(false), 2000);
                }
              }}
              className="mt-3 w-full rounded-xl bg-fuchsia-500 px-4 py-2.5 font-black text-white hover:bg-fuchsia-400"
            >
              {copied ? 'Copied!' : 'Copy code'}
            </button>
            <p className="mt-3 text-xs text-white/45">
              Keep it private: anyone with this code can race as you. Getting a new code makes this one stop working.
            </p>
          </>
        ) : (
          <button
            onClick={generate}
            disabled={busy}
            className="mt-4 w-full rounded-xl bg-fuchsia-500 px-4 py-3 font-black text-white hover:bg-fuchsia-400 disabled:opacity-50"
          >
            {busy ? 'Generating…' : 'Get my recovery code'}
          </button>
        )}
        {err && <p className="mt-2 text-sm text-red-400">{err}</p>}
        {code && (
          <button onClick={generate} disabled={busy} className="mt-2 text-xs text-white/50 underline hover:text-white/80">
            Generate a new code instead (old one stops working)
          </button>
        )}

        <button onClick={onClose} className="mt-5 w-full rounded-xl bg-white/10 px-4 py-2.5 font-bold hover:bg-white/20">
          Done
        </button>
      </div>
    </div>
  );
}

/** "Pick a name to save this lap": the name form in a popup (for laps driven without a name). */
export function NamePopup({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="absolute inset-0 z-30 flex touch-pan-y justify-center overflow-y-auto bg-black/65 p-4 backdrop-blur-[2px]" onClick={onClose}>
      <div
        className="my-auto w-full max-w-sm rounded-2xl border border-white/10 bg-neutral-950/95 p-6 text-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 text-center text-[11px] font-black tracking-[0.4em] text-fuchsia-400">SAVE THIS LAP</div>
        {children}
        <button onClick={onClose} className="mt-3 w-full text-xs text-white/50 underline hover:text-white/80">
          Not now
        </button>
      </div>
    </div>
  );
}
