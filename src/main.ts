// 遊戲進入點:載入雲端/本機地圖 → 組裝物理、場景與子系統 → 固定時間步主迴圈。
import * as THREE from 'three';
import R from '@dimforge/rapier3d-compat';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { fetchWorld } from './map/load';
import { RoadIndex, RoadNameTracker } from './map/road-index';
import { createPhysicsWorld, FIXED_DT } from './physics/world';
import { WorldSurface } from './world/surface';
import { WorldChunkManager } from './world/chunk-manager';
import { Vehicle, headingOf, type DriveInput } from './vehicle/vehicle';
import { Keyboard } from './input/keyboard';
import { ChaseCamera, type Smoothing } from './camera/chase-camera';
import { PoseInterpolator } from './core/pose-interpolator';
import { PerfTracker } from './core/perf-tracker';
import { CarMesh, createRenderer, createScene, followSun, isNight, propLayer, setLook, setNight } from './render/scene';
import { fxFromUrl, PostFx } from './render/post';
import { createMiniCar } from './render/mini-car';
import { toonifyCar } from './render/car-style';
import { createFpHood } from './render/fp-hood';
import { createMountains, followMountains, loadSkyline } from './render/mountains';
import { setCloudsNight } from './render/clouds';
import { FX_NAMES, NIGHT, type FxName } from './config/look';
import { propsModeFromSearch, setPropsMode } from './config/props';
import { furnitureShowFromSearch, setFurnitureShow } from './config/furniture';
import { Hud } from './ui/hud';
import { Minimap } from './ui/minimap';
import { prepareMapData } from './ui/minimap-core';
import { BigMap } from './ui/bigmap';
import { createTuningPanel } from './debug/tuning-panel';
import { TrafficSystem } from './traffic/traffic-system';
import { PickupSession } from './game/pickup-session';

const params = new URLSearchParams(location.search);
const AREA = params.get('area') ?? 'range-a';

function loadPlayerCar(car: CarMesh, renderer: THREE.WebGLRenderer, onLoaded: () => void) {
  if (params.get('car') === 'gen') {
    car.useModel(createMiniCar(renderer));
    onLoaded();
    return;
  }
  const pmrem = new THREE.PMREMGenerator(renderer);
  const carEnv = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  pmrem.dispose();
  car
    .loadModel(`${import.meta.env.BASE_URL}models/mini_ai3_body.glb`, null)
    .then(() => {
      onLoaded();
      if (params.get('carstyle') !== 'pbr') {
        toonifyCar(car.group);
      } else {
        car.group.traverse((o) => {
          const m = (o as THREE.Mesh).material as THREE.MeshStandardMaterial | undefined;
          if (m?.isMeshStandardMaterial && !m.envMap) {
            m.envMap = carEnv;
            m.needsUpdate = true;
          }
        });
      }
    })
    .catch((e) => console.warn('MINI 模型載入失敗,改用方塊車', e));
}

async function boot() {
  setPropsMode(propsModeFromSearch(location.search));
  setFurnitureShow(furnitureShowFromSearch(location.search));
  const status = document.getElementById('status')!;
  const overlay = document.getElementById('overlay')!;
  const hudRoot = document.getElementById('hud')!;

  const [world, skyline] = await Promise.all([
    fetchWorld(AREA, { onStatus: (t) => (status.textContent = t) }),
    loadSkyline(AREA),
    R.init(),
  ]);

  const hasTerrain = !!world.elevation;
  const pw = createPhysicsWorld(R, world.json.meta.bounds, hasTerrain);
  const roadIndex = new RoadIndex(world.roads);
  const surface = new WorldSurface(world, roadIndex, world.elevation);
  const spawn = world.json.spawn;
  const spawnY = surface.terrainY(spawn.x, spawn.z);
  const vehicle = new Vehicle(pw, spawn.x, spawn.z, spawn.headingDeg, undefined, spawnY);
  const tracker = new RoadNameTracker(0.5);
  const perf = new PerfTracker();

  const renderer = createRenderer(document.getElementById('game') as HTMLCanvasElement);
  const world3d = createScene(world.json.meta.bounds, surface.sunkHoles(), hasTerrain);
  const { scene, sun } = world3d;
  const mountains = skyline ? createMountains(skyline) : null;
  if (mountains) scene.add(mountains);

  const chunks = new WorldChunkManager(world, scene, pw, perf.work);
  chunks.loadAll(spawn.x, spawn.z);

  const car = new CarMesh(vehicle.params);
  scene.add(car.group);
  let carModelLoaded = false;
  loadPlayerCar(car, renderer, () => (carModelLoaded = true));

  const cam = new ChaseCamera(window.innerWidth / window.innerHeight);
  const fpHood = createFpHood();
  scene.add(fpHood);

  const hud = new Hud(hudRoot);
  const mapData = prepareMapData(world.json, world.roads);
  const minimap = new Minimap(mapData);
  hudRoot.append(minimap.el);
  const bigMap = new BigMap(mapData, world.json.meta.bounds);
  document.body.append(bigMap.el);
  let minimapMaxRedrawMs = 0;

  const keyboard = new Keyboard();
  const gui = createTuningPanel(vehicle);

  const trafficSys = new TrafficSystem(
    world.roads,
    scene,
    pw,
    params.get('traffic') !== 'off',
    hasTerrain ? (x, z) => surface.terrainY(x, z) : undefined,
  );
  const pickupSys = new PickupSession(surface, scene, hudRoot, hud, minimap, bigMap, params.get('mode') !== 'free');

  let paused = false;
  let backToTitle = () => {};
  let started = false;
  let showFps = params.has('fps');
  let autoInput: DriveInput | null = null;
  let inspectView: { x: number; y: number; z: number; lx: number; lz: number; ly?: number } | null = null;

  const pose = new PoseInterpolator();
  const teleport = (x: number, z: number, headingDeg: number, surfaceY?: number) => {
    let y = surfaceY;
    let isElevated = false;
    if (y === undefined) {
      const hits = roadIndex.near(x, z, 8).filter((h) => h.distance <= h.way.width / 2 + 0.5);
      // hits 已按中心線距離由近到遠排序;若最近命中的車道為高架/匝道(h.y > 0.1),疊加到地表高程之上
      const relY = hits.length > 0 && hits[0].y > 0.1 ? hits[0].y : 0;
      isElevated = relY > 0.1;
      y = surface.terrainY(x, z) + relY;
    }
    if (isElevated) chunks.loadAll(x, z);
    vehicle.reset(x, z, headingDeg, y);
    pickupSys.resetImpact();
    pose.snap(vehicle.position(), vehicle.body.rotation());
    cam.snap();
  };
  pose.snap(vehicle.position(), vehicle.body.rotation());

  const resetToRoad = () => {
    const vp = vehicle.position();
    const snap = surface.snapToRoad({ x: vp.x, y: vp.y - surface.terrainY(vp.x, vp.z), z: vp.z }, vehicle.heading());
    teleport(snap.x, snap.z, snap.headingDeg, snap.y);
    if (snap.onRoad) hud.showToast('回到路面');
  };

  // 大地圖快速移動:將點擊／懸停座標吸附到最近可駕駛路面,並預載目標區域後再整車瞬移
  let pendingTravel: { x: number; z: number; headingDeg: number; surfaceY: number; label: string; startedAt: number } | null = null;
  const cancelFastTravel = () => {
    if (!pendingTravel) return;
    pendingTravel = null;
    bigMap.setLoading(null);
  };
  const nearestGroundHit = (wx: number, wz: number, radius = 300) => {
    const hits = roadIndex.near(wx, wz, radius);
    if (!hits.length) return null;
    const bestDist = hits[0].distance;
    const ground = hits.find((h) => h.y <= 0.1 && h.distance <= bestDist + 20);
    return ground ?? hits[0];
  };
  bigMap.describePoint = (wx, wz, hitRadiusM) => {
    let bestPlace: { x: number; z: number; label: string; d: number } | null = null;
    for (const pl of world.json.places ?? []) {
      const d = Math.hypot(pl.x - wx, pl.z - wz);
      if (d <= hitRadiusM && (!bestPlace || d < bestPlace.d)) {
        const hit = nearestGroundHit(pl.px, pl.pz, 120);
        bestPlace = { x: hit?.x ?? pl.px, z: hit?.z ?? pl.pz, label: pl.name, d };
      }
    }
    if (bestPlace) return { x: bestPlace.x, z: bestPlace.z, label: bestPlace.label };
    let bestLm: { x: number; z: number; label: string; d: number } | null = null;
    for (const lm of world.json.landmarks) {
      const d = Math.hypot(lm.x - wx, lm.z - wz);
      if (d <= hitRadiusM && (!bestLm || d < bestLm.d)) {
        const hit = nearestGroundHit(lm.x, lm.z, 200);
        if (hit) bestLm = { x: hit.x, z: hit.z, label: lm.name, d };
      }
    }
    if (bestLm) return { x: bestLm.x, z: bestLm.z, label: bestLm.label };
    const hit = nearestGroundHit(wx, wz, 300);
    if (!hit) return null;
    return { x: hit.x, z: hit.z, label: hit.way.name || '道路' };
  };
  const finishFastTravel = (t: NonNullable<typeof pendingTravel>) => {
    pendingTravel = null;
    bigMap.setLoading(null);
    bigMap.setOpen(false);
    teleport(t.x, t.z, t.headingDeg, t.surfaceY);
    hud.showToast(t.label ? `已抵達：${t.label}` : '已快速移動');
  };
  const startFastTravel = (info: { x: number; z: number; label: string }) => {
    const snap = surface.snapToRoad({ x: info.x, y: 0, z: info.z }, [0, -1]);
    const travel = { x: snap.x, z: snap.z, headingDeg: snap.headingDeg, surfaceY: snap.y, label: info.label, startedAt: performance.now() };
    if (chunks.isAreaReady(travel.x, travel.z, 350)) {
      finishFastTravel(travel);
      return;
    }
    pendingTravel = travel;
    bigMap.setLoading({ x: travel.x, z: travel.z, label: travel.label });
  };
  bigMap.onFastTravel = startFastTravel;

  renderer.info.autoReset = false;
  const post = new PostFx(renderer, scene, cam.camera);
  const setFx = (fx: Partial<Record<FxName, boolean>>) => {
    post.setFx(fx);
    if (fx.light !== undefined) setLook(world3d, fx.light);
    if (fx.clouds !== undefined) world3d.clouds.visible = fx.clouds;
    if (fx.mountains !== undefined && mountains) mountains.visible = fx.mountains;
  };
  setFx(fxFromUrl(location.search, FX_NAMES));

  const setNightMode = (on: boolean) => {
    setNight(world3d, on);
    post.setNight(on);
    setCloudsNight(world3d.clouds, on ? NIGHT.clouds : 1);
    if (mountains) setCloudsNight(mountains, on ? NIGHT.mountains : 1);
    car.setHeadlights(on);
    trafficSys.setNight(on);
  };
  if (params.get('night') === '1') setNightMode(true);

  // 預先編譯隱藏物件(慈慈、光柱)的著色器,避免首次出現時卡頓
  {
    const hidden = pickupSys.hiddenObjects().filter((o) => !o.visible);
    for (const o of hidden) o.visible = true;
    renderer.compile(scene, cam.camera);
    for (const o of hidden) o.visible = false;
  }

  const onAction = (a: string) => {
    if (a === 'reset') {
      resetToRoad();
      pickupSys.onPlayerReset(started);
    }
    if (a === 'camera') {
      cam.next();
      hud.showToast(`視角:${cam.modeName}`);
    }
    if (a === 'pause' && bigMap.open) {
      cancelFastTravel();
      bigMap.setOpen(false);
      return;
    }
    if (a === 'pause' && started) {
      paused = !paused;
      overlay.dataset.mode = 'pause';
      overlay.classList.toggle('hidden', !paused);
    }
    if (a === 'title' && started) backToTitle();
    if (a === 'map' && started) {
      if (bigMap.open) cancelFastTravel();
      bigMap.toggle();
    }
    if (a === 'night') setNightMode(!isNight());
    if (a === 'debug') {
      gui._hidden ? gui.show() : gui.hide();
      showFps = !gui._hidden || showFps;
    }
  };
  keyboard.onAction(onAction);
  for (const b of overlay.querySelectorAll<HTMLButtonElement>('.pause-menu button')) {
    b.addEventListener('click', () => {
      const a = b.dataset.action!;
      if (paused) onAction('pause');
      if (a !== 'pause') onAction(a);
    });
  }

  // 開始畫面兩顆按鈕選玩法(decisions/0056):自由探索可用大地圖快速移動;接送慈慈不能快速移動
  type PlayMode = 'free' | 'pickup';
  const defaultMode: PlayMode = params.get('mode') === 'free' ? 'free' : 'pickup';
  const modeButtons = overlay.querySelectorAll<HTMLButtonElement>('.mode-buttons button');
  const start = (mode: PlayMode = defaultMode) => {
    if (started) return;
    started = true;
    overlay.classList.add('hidden');
    overlay.dataset.mode = 'pause';
    bigMap.setTravelEnabled(mode === 'free');
    const p = vehicle.position();
    pickupSys.start({ x: p.x, z: p.z }, mode === 'pickup');
    hud.showToast(mode === 'free' ? '自由探索:按 M 開地圖可快速移動' : '接送慈慈:跟著箭頭去接她');
  };
  for (const b of modeButtons) {
    b.disabled = false;
    b.addEventListener('click', () => start(b.dataset.play as PlayMode));
  }
  // 暫停選單「回到標題」:結束目前玩法，車子停在原地附近的路面，重新選玩法
  backToTitle = () => {
    cancelFastTravel();
    bigMap.setOpen(false);
    pickupSys.stop();
    autoInput = null;
    resetToRoad();
    paused = false;
    started = false;
    overlay.dataset.mode = 'title';
    overlay.classList.remove('hidden');
  };
  const onTitleKey = (e: KeyboardEvent) => {
    if (started) return;
    if (e.key === '1') start('free');
    if (e.key === '2') start('pickup');
  };
  window.addEventListener('keydown', onTitleKey);
  status.textContent = '選擇玩法';

  window.addEventListener('resize', () => {
    renderer.setSize(window.innerWidth, window.innerHeight);
    post.setSize(window.innerWidth, window.innerHeight);
    cam.camera.aspect = window.innerWidth / window.innerHeight;
    cam.camera.updateProjectionMatrix();
    bigMap.relayout();
  });

  let acc = 0;
  const carPos = new THREE.Vector3();
  const fwd = new THREE.Vector2();

  const loop = (now: number) => {
    const dt = perf.beginFrame(now);

    const tPhys = performance.now();
    if (started && !paused && !bigMap.open) {
      acc += dt;
      let steps = 0;
      const input = autoInput ?? keyboard.read();
      while (acc >= FIXED_DT && steps < 5) {
        const autoRight = vehicle.autoRightCount;
        vehicle.update(input, FIXED_DT);
        const vp = vehicle.position();
        trafficSys.stepPhysics(FIXED_DT, vp);
        pw.world.step();
        if (vehicle.autoRightCount !== autoRight) {
          pose.snap(vehicle.position(), vehicle.body.rotation());
          pickupSys.resetImpact();
        } else {
          pose.push(vehicle.position(), vehicle.body.rotation());
        }
        pickupSys.stepPhysics(FIXED_DT, vehicle.position(), vehicle.body.linvel(), vehicle.speedKmh(), trafficSys);
        acc -= FIXED_DT;
        steps++;
      }
      if (steps === 5) acc = 0;
    }
    perf.work.physics = performance.now() - tPhys;

    const { position: p, rotation: q } = pose.sample(acc / FIXED_DT);
    const [hx, hz] = headingOf(q);
    carPos.copy(p);
    fwd.set(hx, hz);
    car.sync(p, q, [0, 1, 2, 3].map((i) => vehicle.wheelState(i)));
    trafficSys.syncRender();
    pickupSys.syncRender(dt, p, hx, hz);

    cam.update(dt, carPos, fwd, vehicle.speedKmh());
    car.group.visible = !cam.isFirstPerson || !!inspectView;
    fpHood.visible = !car.group.visible;
    if (fpHood.visible) {
      fpHood.position.copy(p);
      fpHood.quaternion.set(q.x, q.y, q.z, q.w);
    }

    if (pendingTravel) {
      // 快速移動預載期間車子停在原地,提高分塊生成預算以加速目標區域就緒
      chunks.update(pendingTravel.x, pendingTravel.z, 24);
      if (chunks.isAreaReady(pendingTravel.x, pendingTravel.z, 350) || performance.now() - pendingTravel.startedAt > 5000) {
        finishFastTravel(pendingTravel);
      }
    } else if (inspectView) {
      const v = inspectView;
      cam.camera.position.set(v.x, v.y, v.z);
      cam.camera.lookAt(v.lx, v.ly ?? surface.terrainY(v.lx, v.lz), v.lz);
      followSun(sun, v.lx, v.lz, v.ly ?? surface.terrainY(v.lx, v.lz));
      chunks.update(v.lx, v.lz);
    } else {
      followSun(sun, p.x, p.z, p.y);
      chunks.update(p.x, p.z);
    }

    const hit = roadIndex.current(p.x, p.z, hx, hz, p.y - surface.terrainY(p.x, p.z));
    if (tracker.update(hit?.way.name ?? '', dt)) hud.setRoadName(tracker.shown);
    hud.setSpeed(vehicle.speedKmh());

    const redraws = minimap.redraws;
    const tMap = performance.now();
    minimap.update(p.x, p.z, hx, hz, perf.work.build > 2);
    bigMap.update(p.x, p.z, hx, hz);
    perf.work.minimap = performance.now() - tMap;
    if (minimap.redraws !== redraws) minimapMaxRedrawMs = Math.max(minimapMaxRedrawMs, minimap.redrawMs);
    hud.setFps(perf.fps, showFps);

    const tRender = performance.now();
    renderer.info.reset();
    if (mountains) followMountains(mountains, cam.camera);
    post.render();
    perf.work.render = performance.now() - tRender;
    perf.endFrame();
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);

  // 自動測試掛勾(tests/e2e 與 tools/shots 使用)
  (window as unknown as { __game: unknown }).__game = {
    start,
    setInput: (i: DriveInput | null) => (autoInput = i),
    reset: resetToRoad,
    teleport,
    setCamera: (i: number) => cam.setMode(i),
    setFx,
    setNight: setNightMode,
    setCameraSmoothing: (s: Smoothing) => cam.setSmoothing(s),
    inspect: (v: typeof inspectView) => (inspectView = v),
    perf: () => perf.reportWorst(),
    setBigMap: (on: boolean) => bigMap.setOpen(on),
    trafficCars: () => trafficSys.cars.map((c) => ({ x: c.x, y: c.y ?? 0, z: c.z, heading: c.heading, kind: c.kind, color: c.color })),
    setMinimapLabels: (on: boolean) => (minimap.showLabels = on),
    state: () => {
      const p = vehicle.position();
      return {
        x: p.x,
        y: p.y,
        z: p.z,
        speedKmh: vehicle.speedKmh(),
        headingDeg: vehicle.headingDeg(),
        roadName: tracker.shown,
        frames: perf.frames,
        fps: perf.fps,
        avgFps: perf.avgFps(),
        p1LowFps: perf.p1LowFps(),
        drawCalls: renderer.info.render.calls,
        triangles: renderer.info.render.triangles,
        autoRight: vehicle.autoRightCount,
        carModelLoaded,
        area: AREA,
        trafficCars: trafficSys.cars.length,
        pickup: pickupSys.state(),
        chunksLoaded: chunks.loadedCount,
        chunksTotal: chunks.totalCount,
        chunkMaxMs: chunks.maxChunkMs,
        tilesLoaded: chunks.tilesLoaded,
        tilesTotal: chunks.tilesTotal,
        cameraSmoothing: cam.smoothing,
        cameraPos: cam.camera.position.toArray(),
        minimapMode: minimap.mode,
        bigMapOpen: bigMap.open,
        minimapRedraws: minimap.redraws,
        propCounts: propLayer()?.counts() ?? [],
        minimapMaxRedrawMs,
        maxFrameMs: perf.consumeMaxFrameMs(),
      };
    },
  };
}

boot().catch((e) => {
  console.error(e);
  const s = document.getElementById('status');
  if (s) s.textContent = `載入失敗:${e instanceof Error ? e.message : e}`;
});
