import { INPUT } from '@purple-sector/sim';

const THROTTLE = ['ArrowUp', 'KeyW'];
const BRAKE = ['ArrowDown', 'KeyS'];
const LEFT = ['ArrowLeft', 'KeyA'];
const RIGHT = ['ArrowRight', 'KeyD'];
const BLOCK_DEFAULT = new Set([...THROTTLE, ...BRAKE, ...LEFT, ...RIGHT, 'Space']);

/** Tracks held keys and reports one-off key presses. */
export class Keyboard {
  private down = new Set<string>();

  constructor(private readonly onPress: (code: string) => void) {
    window.addEventListener('keydown', this.handleDown);
    window.addEventListener('keyup', this.handleUp);
    window.addEventListener('blur', this.clear);
  }

  bits(): number {
    const any = (codes: string[]) => codes.some((c) => this.down.has(c));
    let b = 0;
    if (any(THROTTLE)) b |= INPUT.THROTTLE;
    if (any(BRAKE)) b |= INPUT.BRAKE;
    if (any(LEFT)) b |= INPUT.LEFT;
    if (any(RIGHT)) b |= INPUT.RIGHT;
    return b;
  }

  dispose(): void {
    window.removeEventListener('keydown', this.handleDown);
    window.removeEventListener('keyup', this.handleUp);
    window.removeEventListener('blur', this.clear);
  }

  /** When false (e.g. a menu has focus), keys are ignored entirely. */
  enabled = true;

  private handleDown = (e: KeyboardEvent) => {
    // Never steal keys from text fields (username box etc.)
    const el = e.target as HTMLElement | null;
    if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)) return;
    if (!this.enabled) return;
    if (BLOCK_DEFAULT.has(e.code)) e.preventDefault();
    this.down.add(e.code);
    if (!e.repeat) this.onPress(e.code);
  };

  private handleUp = (e: KeyboardEvent) => {
    this.down.delete(e.code);
  };

  private clear = () => {
    this.down.clear();
  };
}
