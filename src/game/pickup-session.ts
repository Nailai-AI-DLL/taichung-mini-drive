// 「接送慈慈」遊戲階段協調器(decisions/0029、0031):整合 PickupGame 狀態機、撞擊偵測、3D 人形與光柱(含地形高程)、知名地點招牌、HUD 與小地圖/大地圖標記。
import type * as THREE from 'three';
import { PICKUP } from '../config/pickup';
import { TRAFFIC } from '../config/traffic';
import { Beacon, createCici, MARKER_COLORS } from '../render/pickup-markers';
import { createPlaceSign } from '../render/place-signs';
import type { TrafficSystem } from '../traffic/traffic-system';
import type { BigMap } from '../ui/bigmap';
import type { Hud } from '../ui/hud';
import type { Minimap } from '../ui/minimap';
import { PickupHud } from '../ui/pickup-hud';
import type { WorldSurface } from '../world/surface';
import { ImpactDetector, PickupGame, pickPlace, pickSpotWithFallback, type PickupEvent } from './pickup';

const RESPECT_STORAGE_KEY = 'cici-respect';

function loadRespect(): number {
  try {
    return Number(localStorage.getItem(RESPECT_STORAGE_KEY)) || 0;
  } catch {
    return 0;
  }
}

function saveRespect(v: number) {
  try {
    localStorage.setItem(RESPECT_STORAGE_KEY, String(v));
  } catch {
    /* 無痕模式等存不了就算了 */
  }
}

export class PickupSession {
  readonly game: PickupGame;
  readonly impact = new ImpactDetector();
  readonly pickupHud: PickupHud;
  readonly cici: THREE.Group;
  readonly beacon: Beacon;

  constructor(
    private readonly surface: WorldSurface,
    scene: THREE.Scene,
    hudRoot: HTMLElement,
    private readonly hud: Hud,
    private readonly minimap: Minimap,
    private readonly bigMap: BigMap,
    readonly enabled = true,
  ) {
    const { world } = surface;
    const landmarkSpots = (world.json.landmarks ?? []).map((l) => ({ name: l.name, x: l.x, z: l.z }));
    const places = world.json.places ?? [];
    const spotValid = (x: number, z: number) => surface.isSpotValid(x, z);

    this.game = new PickupGame(
      (from) =>
        (Math.random() < PICKUP.placeShare ? pickPlace(places, from, Math.random) : null) ??
        pickSpotWithFallback(world.roads, from, Math.random, landmarkSpots, PICKUP, spotValid) ??
        pickPlace(places, from, Math.random, [PICKUP.range[0] * 0.5, PICKUP.range[1] * 3]),
      Math.random,
      loadRespect(),
    );

    // 建立全區知名地點招牌(樓頂或路邊,高度跟隨 WorldSurface)
    for (const spec of surface.placeSignSpecs()) {
      scene.add(createPlaceSign(spec));
    }
    // 已是地標的地點,小地圖圖示由地標那一層畫
    this.minimap.places = this.bigMap.places = places
      .filter((pl) => !pl.landmark)
      .map((pl) => ({ x: pl.x, z: pl.z, glyph: pl.glyph, color: pl.color }));

    this.pickupHud = new PickupHud(hudRoot);
    this.pickupHud.setVisible(enabled);
    this.cici = createCici();
    this.cici.visible = false;
    this.beacon = new Beacon(PICKUP.arriveDist);
    scene.add(this.cici, this.beacon.group);
  }

  /** 開場預先編譯著色器用的隱藏物件清單(避免第一次出現時卡一幀) */
  hiddenObjects(): THREE.Object3D[] {
    return [this.cici, this.beacon.group];
  }

  /** 開始第一局接送 */
  start(pos: { x: number; z: number }) {
    if (!this.enabled) return;
    this.handleEvents(this.game.start(pos));
  }

  /** 瞬移或自動扶正時重設撞擊速度紀錄 */
  resetImpact() {
    this.impact.reset();
  }

  /** 玩家手動按 R 回到路面時視為危險駕駛 */
  onPlayerReset(started: boolean) {
    if (this.enabled && started) {
      this.handleEvents(this.game.hit('reset'));
    }
  }

  /** 固定物理時間步:檢查撞車/撞牆與接送距離 */
  stepPhysics(
    dt: number,
    pos: { x: number; y: number; z: number },
    linvel: { x: number; z: number },
    speedKmh: number,
    trafficSys: TrafficSystem,
  ) {
    if (!this.enabled) return;
    if (this.impact.step(linvel.x, linvel.z)) {
      const edgeRange = PICKUP.hitCarRange - TRAFFIC.body[0] / 2;
      const nearCar = trafficSys.hasCarNear(pos.x, pos.z, edgeRange, pos.y);
      this.handleEvents(this.game.hit(nearCar ? 'car' : 'wall'));
    }
    this.handleEvents(this.game.update(dt, { x: pos.x, z: pos.z, speedKmh }));
  }

  /** 渲染幀:轉動光柱、讓慈慈面向車子並更新接送 HUD 方向箭頭 */
  syncRender(dt: number, carPos: { x: number; z: number }, hx: number, hz: number) {
    if (!this.enabled) return;
    this.beacon.update(dt);
    const tg = this.game.target;
    if (tg) {
      if (this.cici.visible) this.cici.rotation.y = -Math.atan2(carPos.z - tg.z, carPos.x - tg.x);
      const tx = tg.x - carPos.x;
      const tz = tg.z - carPos.z;
      this.pickupHud.update(
        this.game.impatience,
        this.game.phase,
        tg.label,
        Math.hypot(tx, tz),
        Math.atan2(tx * -hz + tz * hx, tx * hx + tz * hz),
        this.game.respect,
      );
    }
  }

  /** 回傳供 window.__game.state().pickup 使用的狀態 */
  state() {
    return {
      on: this.enabled,
      phase: this.game.phase,
      impatience: this.game.impatience,
      respect: this.game.respect,
      rate: this.game.rate,
      target: this.game.target,
      line: this.game.line,
    };
  }

  private handleEvents(events: PickupEvent[]) {
    for (const e of events) {
      if (e.type === 'round') {
        const spotY = this.surface.terrainY(e.spot.x, e.spot.z);
        this.cici.position.set(e.spot.x, spotY, e.spot.z);
        this.cici.visible = true;
        this.beacon.set(e.spot.x, e.spot.z, 'pickup');
        this.beacon.group.position.y = spotY;
        this.minimap.target = this.bigMap.target = { x: e.spot.x, z: e.spot.z, color: MARKER_COLORS.pickup };
      } else if (e.type === 'picked') {
        const spotY = this.surface.terrainY(e.spot.x, e.spot.z);
        this.cici.visible = false;
        this.beacon.set(e.spot.x, e.spot.z, 'dropoff');
        this.beacon.group.position.y = spotY;
        this.minimap.target = this.bigMap.target = { x: e.spot.x, z: e.spot.z, color: MARKER_COLORS.dropoff };
      } else if (e.type === 'delivered' || e.type === 'failed') {
        this.cici.visible = false;
        this.beacon.hide();
        this.minimap.target = this.bigMap.target = null;
        saveRespect(e.respect);
        if (e.type === 'delivered') {
          this.pickupHud.showBanner(
            'win',
            '接送成功',
            `尊敬 +${PICKUP.respectWin}(目前 ${e.respect});下一局${PICKUP.name}會比較有耐心`,
            PICKUP.resultSeconds,
          );
        } else {
          this.pickupHud.showBanner(
            'lose',
            '接送失敗',
            `${PICKUP.name}等到不耐煩了;尊敬 ${e.respect}。重新來一局`,
            PICKUP.resultSeconds,
          );
        }
      } else if (e.type === 'hit') {
        this.hud.showToast(`${e.kind === 'car' ? '撞到車' : e.kind === 'wall' ? '撞到東西' : '危險駕駛'}!不耐煩 +${e.add}%`);
      } else if (e.type === 'say') {
        this.pickupHud.say(e.text);
      }
    }
  }
}
