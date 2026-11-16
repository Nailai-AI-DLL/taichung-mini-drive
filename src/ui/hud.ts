import { DEFAULT_PARAMS } from '../vehicle/params';
// HUD:路名牌、速度表(數字 + 速度條)、操作說明(按鍵小方塊)、資料來源標示、FPS(除錯)。小地圖在 minimap.ts。
// 版面與外觀由主題決定(decisions/0016 §10):#hud 上的 class hud-a / hud-b / hud-c,樣式在 src/style.css;網址 ?hud=b 切換。
export class Hud {
  private sign = el('div', 'road-sign');
  private signText = el('span', 'road-sign-text');
  private speed = el('div', 'speed');
  private speedNum = el('span', 'speed-num');
  private speedFill = el('div', 'speed-fill');
  private fps = el('div', 'fps');
  private toast = el('div', 'toast');
  private toastTimer = 0;

  constructor(root: HTMLElement) {
    this.sign.append(this.signText);
    this.speedNum.textContent = '0';
    const bar = el('div', 'speed-bar');
    bar.append(this.speedFill);
    const row = el('div', 'speed-row');
    row.append(this.speedNum, Object.assign(el('span', 'speed-unit'), { textContent: 'km/h' }));
    this.speed.append(row, bar);
    const help = el('div', 'help');
    const keys: [string, string][] = [['WASD', '開車'], ['空白', '甩尾'], ['R', '回到路面'], ['C', '視角'], ['M', '地圖'], ['Esc', '暫停']];
    help.innerHTML = keys.map(([k, t]) => `<span class="key"><kbd>${k}</kbd>${t}</span>`).join('');
    root.classList.add(`hud-${hudTheme(location.search)}`);
    const credit = el('div', 'credit');
    credit.innerHTML =
      '地圖資料 © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap contributors</a>' +
      '、<a href="https://data.gov.tw/dataset/158889" target="_blank" rel="noopener">臺中市政府</a>(道路寬度、建物;政府資料開放授權條款第 1 版)';
    root.append(this.sign, this.speed, help, credit, this.fps, this.toast);
  }

  setRoadName(name: string) {
    if (!name) {
      this.sign.classList.remove('show');
      return;
    }
    this.signText.textContent = name;
    // 重新觸發滑入動畫
    this.sign.classList.remove('show');
    void this.sign.offsetWidth;
    this.sign.classList.add('show');
  }

  setSpeed(kmh: number) {
    const v = Math.round(Math.abs(kmh));
    this.speedNum.textContent = String(v);
    this.speedFill.style.width = `${Math.min(100, (v / SPEED_BAR_MAX) * 100)}%`;
  }

  setFps(fps: number, visible: boolean) {
    this.fps.style.display = visible ? 'block' : 'none';
    this.fps.textContent = `${fps.toFixed(0)} fps`;
  }

  showToast(text: string) {
    this.toast.textContent = text;
    this.toast.classList.add('show');
    clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => this.toast.classList.remove('show'), 1400);
  }
}

/** 速度條滿格的時速 */
// 速度條滿格 = 極速(2026-11-12 極速改 60 km/h,原本固定 160)
const SPEED_BAR_MAX = DEFAULT_PARAMS.maxSpeedKmh;

/** 介面主題(0016 §10):a 深色面板(照參考圖《Six Stars》)、b 明亮毛玻璃、c Q 版賽車;預設 c(Cooper 2026-11-11 選定) */
export function hudTheme(search: string): 'a' | 'b' | 'c' {
  const v = new URLSearchParams(search).get('hud');
  return v === 'a' || v === 'b' ? v : 'c';
}

function el(tag: string, cls: string) {
  const e = document.createElement(tag);
  e.className = cls;
  return e;
}
