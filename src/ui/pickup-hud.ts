// 「接送慈慈」的 HUD(decisions/0029):左上角面板(方塊頭像、不耐煩值條、尊敬、目標與距離、方向箭頭)、台詞泡泡、結算橫幅。
// 樣式在 src/style.css 的 .cici-*。
import { PICKUP } from '../config/pickup';
import type { Phase } from '../game/pickup';

const el = (tag: string, cls: string, text = '') => {
  const e = document.createElement(tag);
  e.className = cls;
  if (text) e.textContent = text;
  return e;
};

export class PickupHud {
  private root = el('div', 'cici');
  private face = el('div', 'cici-face');
  private fill = el('div', 'cici-fill');
  private pct = el('span', 'cici-pct', '0%');
  private respect = el('span', 'cici-respect');
  private goal = el('div', 'cici-goal');
  private arrow = el('span', 'cici-arrow', '➤');
  private goalText = el('span', 'cici-goal-text');
  private bubble = el('div', 'cici-bubble');
  private banner = el('div', 'cici-banner');
  private bubbleTimer = 0;
  /** 上次寫進畫面的值:只有變了才寫(每幀都改 DOM 會讓瀏覽器每幀重新排版,2026-11-13 e2e 量到掉幀) */
  private last: Record<string, string> = {};
  private put(key: string, value: string, write: (v: string) => void) {
    if (this.last[key] === value) return;
    this.last[key] = value;
    write(value);
  }

  constructor(parent: HTMLElement) {
    this.face.innerHTML = '<i class="hair"></i><i class="eye l"></i><i class="eye r"></i><i class="mouth"></i>';
    const head = el('div', 'cici-head');
    const title = el('div', 'cici-title');
    title.append(el('b', '', PICKUP.name), this.respect);
    const barRow = el('div', 'cici-bar-row');
    const bar = el('div', 'cici-bar');
    bar.append(this.fill);
    barRow.append(el('span', 'cici-bar-label', '不耐煩'), bar, this.pct);
    const info = el('div', 'cici-info');
    info.append(title, barRow);
    head.append(this.face, info);
    this.goal.append(this.arrow, this.goalText);
    this.root.append(head, this.goal, this.bubble);
    parent.append(this.root, this.banner);
  }

  /** 每幀:不耐煩值(0–100)、階段、目標名稱與距離、目標相對車頭的角度(弧度,0 = 正前方,正值 = 右邊) */
  update(impatience: number, phase: Phase, label: string, dist: number, bearing: number, respect: number) {
    const v = Math.max(0, Math.min(100, impatience));
    this.put('w', (Math.round(v * 2) / 2).toFixed(1), (x) => (this.fill.style.width = `${x}%`));
    this.put('pct', `${Math.round(v)}%`, (x) => (this.pct.textContent = x));
    const mood = v >= 80 ? 'angry' : v >= 50 ? 'annoyed' : 'calm';
    this.put('mood', phase === 'success' ? 'happy' : phase === 'failed' ? 'angry' : mood, (x) => (this.root.dataset.mood = x));
    this.put('respect', `尊敬 ${respect}`, (x) => (this.respect.textContent = x));
    const active = phase === 'pickup' || phase === 'dropoff';
    this.put('vis', active ? 'visible' : 'hidden', (x) => (this.goal.style.visibility = x));
    if (active) {
      // 距離取 5 m 一格(遠的時候不用每公尺跳)、箭頭 3° 一格
      const d = dist > 50 ? Math.round(dist / 5) * 5 : Math.round(dist);
      this.put('goal', `${phase === 'pickup' ? '去接' + PICKUP.name : '載她到'}:${label} · ${d} m`, (x) => (this.goalText.textContent = x));
      this.put('phase', phase, (x) => (this.goal.dataset.phase = x));
      // 箭頭字元預設朝右(➤),正前方要朝上 → 先轉 −90°
      const deg = Math.round(((bearing - Math.PI / 2) * 180) / Math.PI / 3) * 3;
      this.put('arrow', String(deg), (x) => (this.arrow.style.transform = `rotate(${x}deg)`));
    }
  }

  say(text: string, seconds = 5) {
    this.bubble.textContent = text;
    this.bubble.classList.add('show');
    clearTimeout(this.bubbleTimer);
    this.bubbleTimer = window.setTimeout(() => this.bubble.classList.remove('show'), seconds * 1000);
  }

  showBanner(kind: 'win' | 'lose', title: string, sub: string, seconds: number) {
    this.banner.dataset.kind = kind;
    this.banner.innerHTML = '';
    this.banner.append(el('b', '', title), el('span', '', sub));
    this.banner.classList.add('show');
    window.setTimeout(() => this.banner.classList.remove('show'), seconds * 1000);
  }

  setVisible(v: boolean) {
    this.root.style.display = v ? '' : 'none';
  }
}
