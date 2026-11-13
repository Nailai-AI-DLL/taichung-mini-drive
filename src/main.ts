// 遊戲進入點:載入地圖 → 建立物理與場景 → 固定時間步主迴圈。
import * as THREE from 'three';
import R from '@dimforge/rapier3d-compat';
import { fetchWorld } from './map/load';
import { RoadIndex, RoadNameTracker } from './map/road-index';
import { addStaticFurniture, addStaticTrimesh, createPhysicsWorld, FIXED_DT, removeBody } from './physics/world';
import { ChunkStreamer } from './world/streamer';
import { chunkKey, colliderMeshes, furnitureCollision } from './world/chunks';
import { Vehicle, headingOf, type DriveInput } from './vehicle/vehicle';
import { Keyboard } from './input/keyboard';
import { ChaseCamera, type Smoothing } from './camera/chase-camera';
import { PoseInterpolator } from './core/pose-interpolator';
import { addChunkFurniture, addChunkMeshes, addLandmark, CarMesh, createRenderer, createScene, followSun, removeChunkMeshes, setLook } from './render/scene';
import { fxFromUrl, PostFx } from './render/post';
import { createMiniCar } from './render/mini-car';
import { toonifyCar } from './render/car-style';
import { createFpHood } from './render/fp-hood';
import { createMountains, followMountains, loadSkyline } from './render/mountains';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { FX_NAMES, type FxName } from './config/look';
import { Hud } from './ui/hud';
import { Minimap } from './ui/minimap';
import { MINIMAP_MODE_NAME, prepareMapData, type MinimapMode } from './ui/minimap-core';
import { createTuningPanel } from './debug/tuning-panel';
import { propsModeFromSearch, setPropsMode } from './config/props';
import { furnitureShowFromSearch, setFurnitureShow } from './config/furniture';
import { Traffic } from './traffic/traffic';
import { TrafficLayer } from './render/traffic';
import { TRAFFIC } from './config/traffic';
import { ImpactDetector, PickupGame, pickSpotWithFallback, type PickupEvent } from './game/pickup';
import { pointInPolygon } from './world/gen/geom';
import { PICKUP } from './config/pickup';
import { PickupHud } from './ui/pickup-hud';
import { Beacon, createCici, MARKER_COLORS } from './render/pickup-markers';

// 地圖區域:預設範圍 A;?area=m0 可切回 M0 小區域(測試用)
const AREA = new URLSearchParams(location.search).get('area') ?? 'range-a';

async function boot() {
  // 行道樹、路燈:預設 Tripo 模型,?props=gen 換回程式生成(decisions/0020);要在第一格生成前設好
  setPropsMode(propsModeFromSearch(location.search));
  setFurnitureShow(furnitureShowFromSearch(location.search));
  const status = document.getElementById('status')!;
  const overlay = document.getElementById('overlay')!;
  const [world, skyline] = await Promise.all([fetchWorld(AREA), loadSkyline(AREA), R.init()]);

  const pw = createPhysicsWorld(R, world.json.meta.bounds);
  const spawn = world.json.spawn;
  const vehicle = new Vehicle(pw, spawn.x, spawn.z, spawn.headingDeg);
  const roadIndex = new RoadIndex(world.roads);
  const tracker = new RoadNameTracker(0.5);

  const canvas = document.getElementById('game') as HTMLCanvasElement;
  const renderer = createRenderer(canvas);
  const world3d = createScene(world.json.meta.bounds);
  const { scene, sun } = world3d;
  // 遠景山脈(decisions/0019):依實際地形;沒有 skyline.json 的區域(m0)就不畫;?fx=mountains:0 可關
  const mountains = skyline ? createMountains(skyline) : null;
  if (mountains) scene.add(mountains);
  // 分塊:車子周圍的格子才生成網格與碰撞體
  const live = new Map<string, { objects: THREE.Object3D[][]; bodies: ReturnType<typeof addStaticTrimesh>[] }>();
  /** 單幀耗時分項(毫秒),找偶發卡頓用:__game.perf() 回傳最慢的幾幀與它們「前一幀」做了什麼 */
  const frameWork = { physics: 0, stream: 0, build: 0, meshes: 0, colliders: 0, minimap: 0, render: 0, chunks: 0 };
  const streamer = new ChunkStreamer(world, {
    onLoad: (src, m) => {
      const t0 = performance.now();
      const objects = [addChunkMeshes(scene, m), ...src.landmarks.map((lm, i) => addLandmark(scene, lm, m.landmarkSolids[i]))];
      const t1 = performance.now();
      const bodies = colliderMeshes(m).map((a) => addStaticTrimesh(pw, a.position, a.index));
      frameWork.meshes += t1 - t0;
      frameWork.colliders += performance.now() - t1;
      frameWork.chunks++;
      live.set(src.key, { objects, bodies });
    },
    // 兩段生成(0015 §11.10):街道傢俱晚一幀以上才生成,接到這一格的建築網格與物理
    onFurniture: (src, f) => {
      const l = live.get(src.key);
      if (!l) return;
      const t0 = performance.now();
      addChunkFurniture(scene, l.objects[0], f);
      const t1 = performance.now();
      l.bodies.push(addStaticFurniture(pw, furnitureCollision(src)));
      frameWork.meshes += t1 - t0;
      frameWork.colliders += performance.now() - t1;
    },
    onUnload: (src) => {
      const l = live.get(src.key);
      if (!l) return;
      for (const o of l.objects) removeChunkMeshes(scene, o);
      for (const b of l.bodies) removeBody(pw, b);
      live.delete(src.key);
    },
  });
  streamer.loadAll(spawn.x, spawn.z);
  const car = new CarMesh(vehicle.params);
  scene.add(car.group);
  let carModelLoaded = false;
  // 車子外觀:預設是 Tripo 多視角 AI 版 + 卡通造型(0016 §15.4,Cooper 2026-11-11 拍板)。
  // 來源 mini60/ai/tripo_convert_b16a1a3a…glb,用 tools/models/ai_car_normalize.py(KEEP_WHEELS=1)轉成 mini_ai3_body.glb。
  // ?car=gen 程式生成版(§12,對照用);?carstyle=pbr 換回寫實材質。
  // 其他舊版(mini_q、mini_f55、mini_ai、mini_ai2)2026-11-11 Cooper 同意移除。
  const params = new URLSearchParams(location.search);
  if (params.get('car') === 'gen') {
    car.useModel(createMiniCar(renderer));
    carModelLoaded = true;
  } else {
    car
      // 輪子留在車身上、不另外轉(§15.6)
      .loadModel(`${import.meta.env.BASE_URL}models/mini_ai3_body.glb`, null)
      .then(() => {
        carModelLoaded = true;
        if (params.get('carstyle') !== 'pbr') toonifyCar(car.group);
        else applyCarEnv();
      })
      .catch((e) => console.warn('MINI 模型載入失敗,改用方塊車', e));
  }
  // 亮面車漆、玻璃的反射用環境貼圖,只給車子的材質。不能設 scene.environment:three 新版連 Lambert 材質也會吃環境光,
  // 整個城市會變白、褪色(2026-11-11 實測)
  const pmrem = new THREE.PMREMGenerator(renderer);
  const carEnv = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  pmrem.dispose();
  const applyCarEnv = () =>
    car.group.traverse((o) => {
      const m = (o as THREE.Mesh).material as THREE.MeshStandardMaterial | undefined;
      if (m?.isMeshStandardMaterial && !m.envMap) {
        m.envMap = carEnv;
        m.needsUpdate = true;
      }
    });
  const cam = new ChaseCamera(window.innerWidth / window.innerHeight);
  // 第一人稱用的簡單引擎蓋(decisions/0018),跟著車子姿態
  const fpHood = createFpHood();
  scene.add(fpHood);
  // 第一人稱時整台車藏起來:AI 模型只有外殼,從車內看引擎蓋是破洞、後照鏡背面一團、描邊(背面外擴殼)亂線(2026-11-12 樣張,decisions/0017)
  const hud = new Hud(document.getElementById('hud')!);
  const minimap = new Minimap(prepareMapData(world.json, world.roads));
  document.getElementById('hud')!.append(minimap.el);
  let minimapMaxRedrawMs = 0;
  const keyboard = new Keyboard();
  const gui = createTuningPanel(vehicle);

  // 其他車輛(decisions/0028):邏輯在 Traffic,畫面是 TrafficLayer,碰撞是每台一個運動學剛體(玩家撞得到、推不動它)
  // 網址 ?traffic=off 關掉
  const trafficOn = new URLSearchParams(location.search).get('traffic') !== 'off';
  const traffic = new Traffic(world.roads);
  const trafficLayer = new TrafficLayer(scene);
  const trafficBodies = new Map<number, R.RigidBody>();
  const stepTraffic = (px: number, pz: number) => {
    if (!trafficOn) return;
    for (const id of traffic.update(FIXED_DT, { x: px, z: pz })) {
      const b = trafficBodies.get(id);
      if (b) pw.world.removeRigidBody(b);
      trafficBodies.delete(id);
    }
    const [bl, bh, bw] = TRAFFIC.body;
    const y = TRAFFIC.clearance + (bh + TRAFFIC.cabin[1]) / 2;
    for (const c of traffic.cars) {
      let b = trafficBodies.get(c.id);
      const rot = { x: 0, y: Math.sin(-c.heading / 2), z: 0, w: Math.cos(-c.heading / 2) };
      if (!b) {
        b = pw.world.createRigidBody(R.RigidBodyDesc.kinematicPositionBased().setTranslation(c.x, y, c.z).setRotation(rot));
        pw.world.createCollider(R.ColliderDesc.cuboid(bl / 2, (bh + TRAFFIC.cabin[1]) / 2, bw / 2).setFriction(0.4).setRestitution(0.2), b);
        trafficBodies.set(c.id, b);
      } else {
        b.setNextKinematicTranslation({ x: c.x, y, z: c.z });
        b.setNextKinematicRotation(rot);
      }
    }
  };

  // 「接送慈慈」(decisions/0029):邏輯在 PickupGame;這裡接畫面(人形、光柱、HUD、小地圖標記)與撞擊判定。
  // 網址 ?mode=free = 自由兜風(不玩接送)。尊敬存在瀏覽器(localStorage),下次開還在。
  const pickupOn = new URLSearchParams(location.search).get('mode') !== 'free';
  const loadRespect = () => {
    try {
      return Number(localStorage.getItem('cici-respect')) || 0;
    } catch {
      return 0;
    }
  };
  const saveRespect = (v: number) => {
    try {
      localStorage.setItem('cici-respect', String(v));
    } catch {
      /* 無痕模式等存不了就算了 */
    }
  };
  const landmarkSpots = (world.json.landmarks ?? []).map((l) => ({ name: l.name, x: l.x, z: l.z }));
  // 接送點要站得了人:在地圖內(離邊界 20 m)、不在任何道路的路面上、不在建築裡(驗收量到沒檢查時 24% 在路面、3.5% 在建築內)
  const [bx0, bz0, bx1, bz1] = world.json.meta.bounds;
  const spotValid = (x: number, z: number) => {
    if (x < bx0 + 20 || z < bz0 + 20 || x > bx1 - 20 || z > bz1 - 20) return false;
    if (roadIndex.near(x, z, 40).some((h) => h.distance < h.way.width / 2 + 0.3)) return false;
    const size = world.json.meta.chunkSize;
    // 建築依形心分格,大建築可能掛在隔壁格 → 往外多看 80 m
    for (let gx = Math.floor((x - 80) / size); gx <= Math.floor((x + 80) / size); gx++)
      for (let gz = Math.floor((z - 80) / size); gz <= Math.floor((z + 80) / size); gz++)
        for (const b of world.chunks.get(chunkKey(gx, gz))?.buildings ?? []) if (pointInPolygon([x, z], b.rings[0])) return false;
    return true;
  };
  const game = new PickupGame((from) => pickSpotWithFallback(world.roads, from, Math.random, landmarkSpots, PICKUP, spotValid), Math.random, loadRespect());
  const impact = new ImpactDetector();
  const pickupHud = new PickupHud(document.getElementById('hud')!);
  pickupHud.setVisible(pickupOn);
  const cici = createCici();
  cici.visible = false;
  const beacon = new Beacon(PICKUP.arriveDist);
  scene.add(cici, beacon.group);
  const onPickupEvents = (events: PickupEvent[]) => {
    for (const e of events) {
      if (e.type === 'round') {
        cici.position.set(e.spot.x, 0, e.spot.z);
        cici.visible = true;
        beacon.set(e.spot.x, e.spot.z, 'pickup');
        minimap.target = { x: e.spot.x, z: e.spot.z, color: MARKER_COLORS.pickup };
      } else if (e.type === 'picked') {
        cici.visible = false;
        beacon.set(e.spot.x, e.spot.z, 'dropoff');
        minimap.target = { x: e.spot.x, z: e.spot.z, color: MARKER_COLORS.dropoff };
      } else if (e.type === 'delivered' || e.type === 'failed') {
        cici.visible = false;
        beacon.hide();
        minimap.target = null;
        saveRespect(e.respect);
        if (e.type === 'delivered') pickupHud.showBanner('win', '接送成功', `尊敬 +${PICKUP.respectWin}(目前 ${e.respect});下一局${PICKUP.name}會比較有耐心`, PICKUP.resultSeconds);
        else pickupHud.showBanner('lose', '接送失敗', `${PICKUP.name}等到不耐煩了;尊敬 ${e.respect}。重新來一局`, PICKUP.resultSeconds);
      } else if (e.type === 'hit') hud.showToast(`${e.kind === 'car' ? '撞到車' : e.kind === 'wall' ? '撞到東西' : '危險駕駛'}!不耐煩 +${e.add}%`);
      else if (e.type === 'say') pickupHud.say(e.text);
    }
  };

  let paused = false;
  let started = false;
  let showFps = new URLSearchParams(location.search).has('fps');
  /** 自動測試用:設定後取代鍵盤輸入 */
  let autoInput: DriveInput | null = null;

  const pose = new PoseInterpolator();
  /** 瞬間移動車子:物理、畫面插值、鏡頭一起重設 */
  const teleport = (x: number, z: number, headingDeg: number) => {
    vehicle.reset(x, z, headingDeg);
    impact.reset();
    pose.snap(vehicle.position(), vehicle.body.rotation());
    cam.snap();
  };
  pose.snap(vehicle.position(), vehicle.body.rotation());

  const resetToRoad = () => {
    const p = vehicle.position();
    const hit = roadIndex.nearest(p.x, p.z);
    if (!hit) return teleport(spawn.x, spawn.z, spawn.headingDeg);
    // 單行道依行車方向;雙向道路取與目前車頭較接近的方向
    const [hx, hz] = vehicle.heading();
    const flip = !hit.way.oneway && hit.dirX * hx + hit.dirZ * hz < 0 ? -1 : 1;
    const dx = hit.dirX * flip;
    const dz = hit.dirZ * flip;
    teleport(hit.x, hit.z, ((Math.atan2(dx, -dz) * 180) / Math.PI + 360) % 360);
    hud.showToast('回到路面');
  };

  const onAction = (a: string) => {
    if (a === 'reset') {
      resetToRoad();
      // 玩家自己按 R(或選單的回到路面)才算危險駕駛;自動測試用的 __game.reset / teleport 不算
      if (pickupOn && started) onPickupEvents(game.hit('reset'));
    }
    if (a === 'camera') {
      cam.next();
      hud.showToast(`視角:${cam.modeName}`);
    }
    if (a === 'pause' && started) {
      paused = !paused;
      overlay.dataset.mode = 'pause';
      overlay.classList.toggle('hidden', !paused);
    }
    if (a === 'map') {
      minimap.toggleMode();
      hud.showToast(`小地圖:${MINIMAP_MODE_NAME[minimap.mode]}`);
    }
    if (a === 'debug') {
      gui._hidden ? gui.show() : gui.hide();
      showFps = !gui._hidden || showFps;
    }
  };
  keyboard.onAction(onAction);
  // 暫停選單的按鈕(decisions/0016 §11):和鍵盤同一組動作;回到路面、換視角後順便關掉選單
  for (const b of overlay.querySelectorAll<HTMLButtonElement>('.pause-menu button')) {
    b.addEventListener('click', () => {
      const a = b.dataset.action!;
      if (a !== 'pause') onAction(a);
      if (paused) onAction('pause');
    });
  }

  status.textContent = '按任意鍵開始';
  const start = () => {
    if (started) return;
    started = true;
    overlay.classList.add('hidden');
    if (pickupOn) {
      const p = vehicle.position();
      onPickupEvents(game.start({ x: p.x, z: p.z }));
    }
  };
  window.addEventListener('keydown', start, { once: true });
  window.addEventListener('pointerdown', start, { once: true });

  // 畫面質感(decisions/0016):後製與新光照;?fx=off 或 __game.setFx 可關掉個別效果做前後對照
  // 後製一幀會呼叫多次 renderer.render;draw call 統計改成每幀手動歸零,才是整幀的總數(e2e 的 draw call 門檻要用)
  renderer.info.autoReset = false;
  const post = new PostFx(renderer, scene, cam.camera);
  const setFx = (fx: Partial<Record<FxName, boolean>>) => {
    post.setFx(fx);
    if (fx.light !== undefined) setLook(world3d, fx.light);
    if (fx.clouds !== undefined) world3d.clouds.visible = fx.clouds;
    if (fx.mountains !== undefined && mountains) mountains.visible = fx.mountains;
  };
  setFx(fxFromUrl(location.search, FX_NAMES));
  // 先把「之後才出現」的物件(慈慈、光柱、其他車輛)的著色器編譯好;不然第一次出現的那一幀會卡(2026-11-13 e2e 量到 99 ms)
  {
    const hidden = [cici, beacon.group].filter((o) => !o.visible);
    for (const o of hidden) o.visible = true;
    renderer.compile(scene, cam.camera);
    for (const o of hidden) o.visible = false;
  }

  window.addEventListener('resize', () => {
    renderer.setSize(window.innerWidth, window.innerHeight);
    post.setSize(window.innerWidth, window.innerHeight);
    cam.camera.aspect = window.innerWidth / window.innerHeight;
    cam.camera.updateProjectionMatrix();
  });

  // 效能統計
  let frames = 0;
  let fpsAcc = 0;
  let fpsFrames = 0;
  let fps = 0;
  const frameTimes: number[] = [];
  /** 兩次讀取之間的最長單幀(ms),讀取後歸零 */
  let maxFrameMs = 0;

  let acc = 0;
  let last = performance.now();
  const worstFrames: { ms: number; at: number; prev: typeof frameWork }[] = [];
  let prevWork = { ...frameWork };
  const carPos = new THREE.Vector3();
  const fwd = new THREE.Vector2();
  /** 檢視鏡頭(自動測試、前後對照截圖用):從 (x, y, z) 看向 (lx, 0, lz);地圖載入與陰影改跟著看的點 */
  let inspectView: { x: number; y: number; z: number; lx: number; lz: number; ly?: number } | null = null;

  const loop = (now: number) => {
    const rawDt = (now - last) / 1000;
    maxFrameMs = Math.max(maxFrameMs, rawDt * 1000);
    // 這一幀的間隔反映的是上一幀做的事:記下上一幀的分項
    if (frames > 60 && (worstFrames.length < 5 || rawDt * 1000 > worstFrames[worstFrames.length - 1].ms)) {
      worstFrames.push({ ms: rawDt * 1000, at: frames, prev: prevWork });
      worstFrames.sort((a, b) => b.ms - a.ms).splice(5);
    }
    for (const k of Object.keys(frameWork) as (keyof typeof frameWork)[]) frameWork[k] = 0;
    const dt = Math.min(0.1, rawDt);
    last = now;
    frames++;
    fpsAcc += dt;
    fpsFrames++;
    frameTimes.push(dt);
    if (frameTimes.length > 600) frameTimes.shift();
    if (fpsAcc >= 0.5) {
      fps = fpsFrames / fpsAcc;
      fpsAcc = 0;
      fpsFrames = 0;
    }

    const tPhys = performance.now();
    if (started && !paused) {
      acc += dt;
      let steps = 0;
      const input = autoInput ?? keyboard.read();
      while (acc >= FIXED_DT && steps < 5) {
        const autoRight = vehicle.autoRightCount;
        vehicle.update(input, FIXED_DT);
        const vp = vehicle.position();
        stepTraffic(vp.x, vp.z);
        pw.world.step();
        // 自動扶正是瞬間移動,不要在翻車與扶正兩個姿態之間插值
        if (vehicle.autoRightCount !== autoRight) {
          pose.snap(vehicle.position(), vehicle.body.rotation());
          impact.reset();
        } else pose.push(vehicle.position(), vehicle.body.rotation());
        if (pickupOn) {
          const np = vehicle.position();
          const lv = vehicle.body.linvel();
          if (impact.step(lv.x, lv.z)) {
            const nearCar = traffic.cars.some((c) => Math.hypot(c.x - np.x, c.z - np.z) < PICKUP.hitCarRange);
            onPickupEvents(game.hit(nearCar ? 'car' : 'wall'));
          }
          onPickupEvents(game.update(FIXED_DT, { x: np.x, z: np.z, speedKmh: vehicle.speedKmh() }));
        }
        acc -= FIXED_DT;
        steps++;
      }
      if (steps === 5) acc = 0;
    }
    frameWork.physics = performance.now() - tPhys;

    // 畫面用插值後的姿態;路名、太陽等邏輯也跟著畫面走
    const { position: p, rotation: q } = pose.sample(acc / FIXED_DT);
    const [hx, hz] = headingOf(q);
    carPos.copy(p);
    fwd.set(hx, hz);
    car.sync(p, q, [0, 1, 2, 3].map((i) => vehicle.wheelState(i)));
    trafficLayer.sync(traffic.cars);
    if (pickupOn) {
      beacon.update(dt);
      const tg = game.target;
      if (tg) {
        // 人形面向車子
        if (cici.visible) cici.rotation.y = -Math.atan2(p.z - tg.z, p.x - tg.x);
        const tx = tg.x - p.x, tz = tg.z - p.z;
        pickupHud.update(game.impatience, game.phase, tg.label, Math.hypot(tx, tz), Math.atan2(tx * -hz + tz * hx, tx * hx + tz * hz), game.respect);
      }
    }
    cam.update(dt, carPos, fwd, vehicle.speedKmh());
    car.group.visible = !cam.isFirstPerson || !!inspectView;
    fpHood.visible = !car.group.visible;
    if (fpHood.visible) {
      fpHood.position.copy(p);
      fpHood.quaternion.set(q.x, q.y, q.z, q.w);
    }
    const tStream = performance.now();
    const built = streamer.totalBuildMs;
    if (inspectView) {
      const v = inspectView;
      cam.camera.position.set(v.x, v.y, v.z);
      cam.camera.lookAt(v.lx, v.ly ?? 0, v.lz);
      followSun(sun, v.lx, v.lz);
      streamer.update(v.lx, v.lz);
    } else {
      followSun(sun, p.x, p.z);
      streamer.update(p.x, p.z);
    }
    frameWork.stream = performance.now() - tStream;
    frameWork.build = streamer.totalBuildMs - built;

    const hit = roadIndex.current(p.x, p.z, hx, hz);
    // 離開道路(15 m 內沒有路段)時收起路名牌
    if (tracker.update(hit?.way.name ?? '', dt)) hud.setRoadName(tracker.shown);
    hud.setSpeed(vehicle.speedKmh());
    const redraws = minimap.redraws;
    const tMap = performance.now();
    minimap.update(p.x, p.z, hx, hz, frameWork.build > 2);
    frameWork.minimap = performance.now() - tMap;
    if (minimap.redraws !== redraws) minimapMaxRedrawMs = Math.max(minimapMaxRedrawMs, minimap.redrawMs);
    hud.setFps(fps, showFps);

    const tRender = performance.now();
    renderer.info.reset();
    if (mountains) followMountains(mountains, cam.camera);
    post.render();
    frameWork.render = performance.now() - tRender;
    prevWork = { ...frameWork };
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);

  // 自動測試掛勾(tests/e2e 使用)
  (window as unknown as { __game: unknown }).__game = {
    start,
    setInput: (i: DriveInput | null) => (autoInput = i),
    reset: resetToRoad,
    teleport,
    setCamera: (i: number) => cam.setMode(i),
    setFx,
    setCameraSmoothing: (s: Smoothing) => cam.setSmoothing(s),
    inspect: (v: typeof inspectView) => (inspectView = v),
    perf: () => worstFrames.map((f) => ({ ms: +f.ms.toFixed(1), at: f.at, prev: Object.fromEntries(Object.entries(f.prev).map(([k, v]) => [k, +v.toFixed(1)])) })),
    setMinimapMode: (m: MinimapMode) => minimap.setMode(m),
    setMinimapLabels: (on: boolean) => (minimap.showLabels = on),
    state: () => {
      const p = vehicle.position();
      const sorted = [...frameTimes].sort((a, b) => a - b);
      return {
        x: p.x,
        y: p.y,
        z: p.z,
        speedKmh: vehicle.speedKmh(),
        headingDeg: vehicle.headingDeg(),
        roadName: tracker.shown,
        frames,
        fps,
        avgFps: frameTimes.length / frameTimes.reduce((a, b) => a + b, 0),
        p1LowFps: 1 / (sorted[Math.floor(sorted.length * 0.99)] ?? 1),
        drawCalls: renderer.info.render.calls,
        triangles: renderer.info.render.triangles,
        autoRight: vehicle.autoRightCount,
        carModelLoaded,
        area: AREA,
        trafficCars: traffic.cars.length,
        pickup: { on: pickupOn, phase: game.phase, impatience: game.impatience, respect: game.respect, rate: game.rate, target: game.target, line: game.line },
        chunksLoaded: streamer.loaded.size,
        chunksTotal: world.chunks.size,
        chunkMaxMs: streamer.maxChunkMs,
        cameraSmoothing: cam.smoothing,
        cameraPos: cam.camera.position.toArray(),
        minimapMode: minimap.mode,
        minimapRedraws: minimap.redraws,
        minimapMaxRedrawMs,
        maxFrameMs: (() => {
          const m = maxFrameMs;
          maxFrameMs = 0;
          return m;
        })(),
      };
    },
  };
}

boot().catch((e) => {
  console.error(e);
  const s = document.getElementById('status');
  if (s) s.textContent = `載入失敗:${e instanceof Error ? e.message : e}`;
});
