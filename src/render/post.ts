// 後製(decisions/0016 方向 A):環境光遮蔽 → 泛光 → 色調映射與色彩空間 → 調色與暗角 → 反鋸齒。
// 每一段都可以單獨開關(setFx),關掉的段落直接跳過、不花效能。
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { Pass, FullScreenQuad } from 'three/examples/jsm/postprocessing/Pass.js';
import { CopyShader } from 'three/examples/jsm/shaders/CopyShader.js';
import { GTAOPass } from 'three/examples/jsm/postprocessing/GTAOPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { SMAAPass } from 'three/examples/jsm/postprocessing/SMAAPass.js';
import { LOOK_AO, LOOK_BLOOM, LOOK_GRADE, type FxName } from '../config/look';

/** 調色著色器(輸入已是畫面色彩空間 sRGB):飽和度、S 曲線對比、亮暖暗冷、暗角 */
export const GRADE_SHADER = {
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    uSat: { value: LOOK_GRADE.saturation },
    uContrast: { value: LOOK_GRADE.contrast },
    uWarm: { value: LOOK_GRADE.warm },
    uVignette: { value: LOOK_GRADE.vignette },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uSat, uContrast, uWarm, uVignette;
    varying vec2 vUv;
    void main() {
      vec4 t = texture2D(tDiffuse, vUv);
      vec3 c = t.rgb;
      float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
      c = mix(vec3(l), c, uSat);
      // S 曲線:以 0.5 為中心,uContrast = 0 不變
      c = mix(c, c * c * (3.0 - 2.0 * c), uContrast);
      // 亮部偏暖、暗部偏冷
      c += uWarm * (l - 0.5) * vec3(1.0, 0.25, -0.9);
      // 暗角:畫面四角變暗
      vec2 d = vUv - 0.5;
      c *= 1.0 - uVignette * smoothstep(0.25, 0.75, dot(d, d) * 2.0);
      gl_FragColor = vec4(clamp(c, 0.0, 1.0), t.a);
    }`,
};

/**
 * 場景只畫一次:畫進自己的 render target(帶深度貼圖),再複製到後製鏈。
 * 環境光遮蔽用這張深度貼圖重建法向量,不用再畫一次整個場景的法向量(GTAOPass 預設會,draw call 加倍,
 * 而且每種新材質第一次出現時要編譯法向量著色器,實測造成 100–250 ms 的卡頓;0016 §7)。
 */
class SceneDepthPass extends Pass {
  readonly target: THREE.WebGLRenderTarget;
  private copy = new FullScreenQuad(new THREE.ShaderMaterial(CopyShader));

  constructor(private scene: THREE.Scene, private camera: THREE.Camera) {
    super();
    this.needsSwap = false;
    this.target = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType });
    this.target.depthTexture = new THREE.DepthTexture(1, 1);
    this.target.depthTexture.type = THREE.UnsignedIntType;
  }

  setSize(w: number, h: number) {
    this.target.setSize(w, h);
  }

  render(renderer: THREE.WebGLRenderer, _write: THREE.WebGLRenderTarget, read: THREE.WebGLRenderTarget) {
    renderer.setRenderTarget(this.target);
    renderer.clear();
    renderer.render(this.scene, this.camera);
    (this.copy.material as THREE.ShaderMaterial).uniforms.tDiffuse.value = this.target.texture;
    renderer.setRenderTarget(this.renderToScreen ? null : read);
    this.copy.render(renderer);
  }
}

export class PostFx {
  readonly composer: EffectComposer;
  private gtao: GTAOPass;
  private bloom: UnrealBloomPass;
  private grade: ShaderPass;
  private smaa: SMAAPass;
  private enabled: Record<string, boolean> = {};
  private scenePass: SceneDepthPass;

  constructor(private renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.PerspectiveCamera) {
    const w = window.innerWidth, h = window.innerHeight;
    this.composer = new EffectComposer(renderer);
    this.scenePass = new SceneDepthPass(scene, camera);
    this.composer.addPass(this.scenePass);
    this.gtao = new GTAOPass(scene, camera, Math.round(w * LOOK_AO.scale), Math.round(h * LOOK_AO.scale));
    // three r186 的 GTAOPass:建構時就傳 depthTexture 會因為 normalRenderTarget 還沒建立而出錯;建好後再切成只用深度
    this.gtao.setGBuffer(this.scenePass.target.depthTexture!);
    // 遠處淡出(LOOK_AO.fadeNear–fadeFar):在 GTAO 著色器算完 ao 之後插一行
    const m = this.gtao.gtaoMaterial;
    const hook = 'ao = pow(ao, scale);';
    if (!m.fragmentShader.includes(hook)) throw new Error('GTAOShader 改版了,找不到插入距離淡出的位置');
    m.fragmentShader = m.fragmentShader.replace(hook, `${hook}\n      ao = mix(ao, 1., smoothstep(${LOOK_AO.fadeNear.toFixed(1)}, ${LOOK_AO.fadeFar.toFixed(1)}, -viewPos.z));`);
    m.needsUpdate = true;
    this.gtao.updateGtaoMaterial({ radius: LOOK_AO.radius, distanceExponent: LOOK_AO.distanceExponent, thickness: LOOK_AO.thickness, samples: LOOK_AO.samples });
    this.gtao.blendIntensity = LOOK_AO.intensity;
    this.composer.addPass(this.gtao);
    this.bloom = new UnrealBloomPass(new THREE.Vector2(w / 2, h / 2), LOOK_BLOOM.strength, LOOK_BLOOM.radius, LOOK_BLOOM.threshold);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
    this.grade = new ShaderPass(GRADE_SHADER);
    this.composer.addPass(this.grade);
    this.smaa = new SMAAPass();
    this.composer.addPass(this.smaa);
    this.setSize(w, h);
  }

  /** 開關個別效果(沒列到的維持原狀) */
  setFx(fx: Partial<Record<FxName, boolean>>) {
    Object.assign(this.enabled, fx);
    this.gtao.enabled = this.enabled.gtao !== false;
    this.bloom.enabled = this.enabled.bloom !== false;
    this.grade.enabled = this.enabled.grade !== false;
    this.smaa.enabled = this.enabled.smaa !== false;
  }

  isOn(name: FxName) {
    return this.enabled[name] !== false;
  }

  setSize(w: number, h: number) {
    const dpr = this.renderer.getPixelRatio();
    this.composer.setPixelRatio(dpr);
    this.composer.setSize(w, h);
    this.scenePass.setSize(Math.round(w * dpr), Math.round(h * dpr));
    // AO 用較低解析度(GTAOPass 的 setSize 會乘上 composer 的 pixelRatio)
    this.gtao.setSize(Math.round(w * LOOK_AO.scale), Math.round(h * LOOK_AO.scale));
  }

  render() {
    this.composer.render();
  }
}

/** 網址參數 ?fx=-gtao,-bloom(減號 = 關掉)或 ?fx=off(全部關掉,等同改版前) */
export function fxFromUrl(search: string, names: readonly FxName[]): Partial<Record<FxName, boolean>> {
  const v = new URLSearchParams(search).get('fx');
  if (!v) return {};
  if (v === 'off') return Object.fromEntries(names.map((n) => [n, false]));
  const out: Partial<Record<FxName, boolean>> = {};
  for (const t of v.split(',')) {
    const off = t.startsWith('-');
    const n = (off ? t.slice(1) : t) as FxName;
    if (names.includes(n)) out[n] = !off;
  }
  return out;
}
