/**
 * On-screen controls for phones/tablets.
 * Left thumb: steer ◀ ▶ (slide between them without lifting). Right thumb: brake + gas.
 * One layer tracks every finger and hit-tests it against the buttons, so multi-touch
 * and sliding work naturally.
 */
import { INPUT } from '@purple-sector/sim';
import { useEffect, useRef, useState } from 'react';

const HIT_PAD = 16; // px of forgiveness around each button

export function TouchControls({ landscape, onChange }: { landscape: boolean; onChange: (bits: number) => void }) {
  const left = useRef<HTMLDivElement>(null);
  const right = useRef<HTMLDivElement>(null);
  const brake = useRef<HTMLDivElement>(null);
  const gas = useRef<HTMLDivElement>(null);
  const fingers = useRef(new Map<number, number>());
  const [pressed, setPressed] = useState(0);
  const pressedRef = useRef(0);

  // Release everything if the controls disappear mid-press
  useEffect(() => () => onChange(0), [onChange]);

  const zoneAt = (x: number, y: number): number => {
    const zones: [React.RefObject<HTMLDivElement | null>, number][] = [
      [left, INPUT.LEFT],
      [right, INPUT.RIGHT],
      [brake, INPUT.BRAKE],
      [gas, INPUT.THROTTLE],
    ];
    for (const [ref, bit] of zones) {
      const r = ref.current?.getBoundingClientRect();
      if (r && x >= r.left - HIT_PAD && x <= r.right + HIT_PAD && y >= r.top - HIT_PAD && y <= r.bottom + HIT_PAD) {
        return bit;
      }
    }
    return 0;
  };

  const sync = () => {
    let bits = 0;
    fingers.current.forEach((b) => (bits |= b));
    if (bits !== pressedRef.current) {
      pressedRef.current = bits;
      setPressed(bits);
      onChange(bits);
    }
  };

  const down = (e: React.PointerEvent) => {
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    fingers.current.set(e.pointerId, zoneAt(e.clientX, e.clientY));
    sync();
  };
  const move = (e: React.PointerEvent) => {
    if (!fingers.current.has(e.pointerId)) return;
    fingers.current.set(e.pointerId, zoneAt(e.clientX, e.clientY));
    sync();
  };
  const up = (e: React.PointerEvent) => {
    fingers.current.delete(e.pointerId);
    sync();
  };

  const size = landscape ? 'h-[84px] w-[84px]' : 'h-[76px] w-[76px]';
  const on = (bit: number) => (pressed & bit) !== 0;

  return (
    <div
      className="absolute inset-0 touch-none select-none [-webkit-touch-callout:none]"
      onPointerDown={down}
      onPointerMove={move}
      onPointerUp={up}
      onPointerCancel={up}
      onContextMenu={(e) => e.preventDefault()}
    >
      <div
        className="pointer-events-none absolute left-4 flex gap-2.5"
        style={{ bottom: 'calc(1rem + env(safe-area-inset-bottom, 0px))' }}
      >
        <Pad ref={left} className={size} active={on(INPUT.LEFT)}>
          ◀
        </Pad>
        <Pad ref={right} className={size} active={on(INPUT.RIGHT)}>
          ▶
        </Pad>
      </div>
      <div
        className="pointer-events-none absolute right-4 flex items-end gap-2.5"
        style={{ bottom: 'calc(1rem + env(safe-area-inset-bottom, 0px))' }}
      >
        <Pad ref={brake} className={size} active={on(INPUT.BRAKE)} tone="brake">
          <span className="text-xs font-black tracking-wider">BRAKE</span>
        </Pad>
        <Pad
          ref={gas}
          className={landscape ? 'h-[120px] w-[92px]' : 'h-[110px] w-[84px]'}
          active={on(INPUT.THROTTLE)}
          tone="gas"
        >
          <span className="text-sm font-black tracking-wider">GAS</span>
        </Pad>
      </div>
    </div>
  );
}

function Pad({
  ref,
  className,
  active,
  tone = 'steer',
  children,
}: {
  ref: React.Ref<HTMLDivElement>;
  className: string;
  active: boolean;
  tone?: 'steer' | 'brake' | 'gas';
  children: React.ReactNode;
}) {
  const colours = {
    steer: active ? 'bg-white/45 border-white' : 'bg-white/12 border-white/35',
    brake: active ? 'bg-red-500/70 border-red-300' : 'bg-red-500/20 border-red-400/50',
    gas: active ? 'bg-emerald-500/70 border-emerald-300' : 'bg-emerald-500/20 border-emerald-400/50',
  }[tone];
  return (
    <div
      ref={ref}
      className={`flex items-center justify-center rounded-2xl border-2 text-2xl font-bold text-white backdrop-blur-[2px] transition-colors duration-75 ${colours} ${className}`}
    >
      {children}
    </div>
  );
}

/** True on phones/tablets (coarse pointer), or as soon as the screen is touched. */
export function useTouchDevice(): boolean {
  const [touch, setTouch] = useState(
    () => typeof window !== 'undefined' && (window.matchMedia?.('(pointer: coarse)').matches ?? false),
  );
  useEffect(() => {
    if (touch) return;
    const onTouch = () => setTouch(true);
    window.addEventListener('touchstart', onTouch, { once: true, passive: true });
    return () => window.removeEventListener('touchstart', onTouch);
  }, [touch]);
  return touch;
}

/** Tracks the viewport size so layouts can react to rotation. */
export function useViewport(): { w: number; h: number } {
  const [vp, setVp] = useState(() => ({ w: window.innerWidth, h: window.innerHeight }));
  useEffect(() => {
    const on = () => setVp({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener('resize', on);
    window.addEventListener('orientationchange', on);
    return () => {
      window.removeEventListener('resize', on);
      window.removeEventListener('orientationchange', on);
    };
  }, []);
  return vp;
}

/** Android: go fullscreen + landscape when the race starts. iPhone Safari doesn't allow it (no-op). */
export async function enterMobileFullscreen(): Promise<void> {
  try {
    const el = document.documentElement;
    if (!document.fullscreenElement && el.requestFullscreen) await el.requestFullscreen({ navigationUI: 'hide' });
    const orientation = screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> };
    await orientation.lock?.('landscape');
  } catch {
    /* not supported / denied — fine, the game works in any orientation */
  }
}
