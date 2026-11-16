// 鍵盤輸入(production-plan.md §3.2;不設 Boost 鍵,Q8)
import type { DriveInput } from '../vehicle/vehicle';

const THROTTLE = ['KeyW', 'ArrowUp'];
const BRAKE = ['KeyS', 'ArrowDown'];
const LEFT = ['KeyA', 'ArrowLeft'];
const RIGHT = ['KeyD', 'ArrowRight'];
const HANDBRAKE = ['Space'];
const PREVENT = new Set([...THROTTLE, ...BRAKE, ...LEFT, ...RIGHT, ...HANDBRAKE]);

export type ActionKey = 'reset' | 'camera' | 'pause' | 'debug' | 'map' | 'horn' | 'night';
const ACTIONS: Record<string, ActionKey> = {
  KeyR: 'reset',
  KeyC: 'camera',
  Escape: 'pause',
  Backquote: 'debug',
  KeyM: 'map',
  KeyH: 'horn',
  // 夜景開關(decisions/0042;Cooper:「先用按鍵做切換，方便我確認效果」)
  KeyN: 'night',
};

export class Keyboard {
  private down = new Set<string>();
  private listeners: ((a: ActionKey) => void)[] = [];
  anyKeyPressed = false;

  constructor(target: Window = window) {
    target.addEventListener('keydown', (e) => {
      if (PREVENT.has(e.code)) e.preventDefault();
      this.anyKeyPressed = true;
      if (!e.repeat && ACTIONS[e.code]) this.listeners.forEach((l) => l(ACTIONS[e.code]));
      this.down.add(e.code);
    });
    target.addEventListener('keyup', (e) => this.down.delete(e.code));
    // 視窗失焦時放開所有按鍵,避免車子自己一直開
    target.addEventListener('blur', () => this.down.clear());
  }

  onAction(fn: (a: ActionKey) => void) {
    this.listeners.push(fn);
  }

  private any(codes: string[]) {
    return codes.some((c) => this.down.has(c));
  }

  read(): DriveInput {
    return {
      throttle: this.any(THROTTLE) ? 1 : 0,
      brake: this.any(BRAKE) ? 1 : 0,
      steer: (this.any(RIGHT) ? 1 : 0) - (this.any(LEFT) ? 1 : 0),
      handbrake: this.any(HANDBRAKE),
    };
  }
}
