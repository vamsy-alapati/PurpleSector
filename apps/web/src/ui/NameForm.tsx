import { useState } from 'react';

export type FormError = { error: string; offline: boolean } | null;

/**
 * Pick a driver name, or sign in on this device with a recovery code.
 * Used on the start screen and in the "pick a name to save this lap" popup.
 */
export function NameForm({
  submitLabel,
  onRegister,
  onRecover,
  onPlayOffline,
}: {
  submitLabel: string;
  onRegister: (name: string) => Promise<FormError>;
  onRecover: (code: string) => Promise<FormError>;
  /** Offered only when the server can't be reached. */
  onPlayOffline?: () => void;
}) {
  const [mode, setMode] = useState<'new' | 'recover'>('new');
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<FormError>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErr(mode === 'new' ? await onRegister(value) : await onRecover(value));
    setBusy(false);
  };

  const switchMode = (m: 'new' | 'recover') => {
    setMode(m);
    setValue('');
    setErr(null);
  };

  const ready = mode === 'new' ? value.trim().length >= 3 : value.replace(/[\s-]/g, '').length >= 12;

  return (
    <form onSubmit={submit} className="text-left">
      <div className="mb-2 grid grid-cols-2 gap-1 rounded-xl bg-white/5 p-1 text-xs font-bold">
        {(['new', 'recover'] as const).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => switchMode(m)}
            className={`rounded-lg py-1.5 transition ${mode === m ? 'bg-white/15 text-white' : 'text-white/50 hover:text-white/80'}`}
          >
            {m === 'new' ? 'New driver' : 'I already have a name'}
          </button>
        ))}
      </div>

      <label className="text-[10px] font-bold tracking-widest text-white/50" htmlFor="ps-name">
        {mode === 'new' ? 'PICK YOUR DRIVER NAME' : 'ENTER YOUR RECOVERY CODE'}
      </label>
      <input
        id="ps-name"
        key={mode}
        autoFocus
        autoComplete="off"
        autoCapitalize={mode === 'recover' ? 'characters' : 'off'}
        spellCheck={false}
        maxLength={mode === 'new' ? 16 : 20}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={mode === 'new' ? '3–16 letters or numbers' : 'XXXX-XXXX-XXXX'}
        className="mt-1 w-full rounded-xl border border-white/15 bg-white/5 px-4 py-3 text-lg font-bold outline-none placeholder:text-white/25 focus:border-fuchsia-400"
      />
      {err && <p className="mt-2 text-sm text-red-400">{err.error}</p>}
      <button
        type="submit"
        disabled={busy || !ready}
        className="mt-3 w-full rounded-xl bg-red-500 px-6 py-3 text-lg font-black tracking-wide text-white transition hover:bg-red-400 active:scale-[0.98] disabled:opacity-40"
      >
        {busy ? 'CHECKING…' : mode === 'new' ? submitLabel : 'USE MY NAME'}
      </button>
      {err?.offline && onPlayOffline && (
        <button
          type="button"
          onClick={onPlayOffline}
          className="mt-2 w-full rounded-xl bg-white/10 px-6 py-2 text-sm font-bold hover:bg-white/20"
        >
          Play offline (times won't be saved)
        </button>
      )}
      <p className="mt-2 text-xs text-white/40">
        {mode === 'new'
          ? 'No account needed. Your name is unique; get a recovery code later to use it on other devices.'
          : 'Got a code from another device? Enter it to race under the same name here.'}
      </p>
    </form>
  );
}
