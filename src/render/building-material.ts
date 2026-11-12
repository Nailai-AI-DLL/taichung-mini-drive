// 建築材質:頂點色 + 著色器畫的窗格、一樓店面、牆腳壓暗(decisions/0015 第三批)。不增加任何幾何、不用貼圖。
// 每個頂點帶 aWall = [沿牆距離 u(公尺), 建築代碼](src/world/gen/mesh.ts 的 packBuildingCode):
//   窗格 = 依細分類的橫向週期 × 層高 3.2 m 的格子,每扇窗的玻璃明暗由 (欄, 樓層, 建築種子) 雜湊決定;
//   窗台線、玻璃反光(0023,參考台中七期 FPS 專案的立面):住宅類窗下一條淺色線、每扇窗上方一段較亮;
//   店面 = 一樓 0–SHOP_HEIGHT 公尺的深色帶,每 SHOP_PILLAR_GAP 公尺一根牆色柱子(騎樓的樣子)。
// 遠處窗格小於幾個像素時,改畫「平均覆蓋率」的均勻色,避免摩爾紋。
import * as THREE from 'three';
import { PALETTE } from '../config/palette';
import { CODE_SEED, CODE_SHOP } from '../world/gen/mesh';
import {
  FACADE_DETAIL, SILL_DROP, SILL_H, SILL_LIGHTEN, SILL_OVERHANG, WINDOW_GLINT_FRAC, WINDOW_STYLE_OLD, type BuildingLook,
  FLOOR_HEIGHT, KIND_COUNT, SHOP_HEIGHT, SHOP_PILLAR_GAP, SHOP_PILLAR_W, WINDOW_FRAME_W, WINDOW_STYLE, WINDOW_TONE_MAX, WINDOW_TONE_MIN,
} from '../config/buildings';

export { FLOOR_HEIGHT };
/** 牆腳壓暗的高度範圍(公尺)與貼地處最多暗幾成(decisions/0015 第二批) */
export const AO_HEIGHT = 4;
export const AO_STRENGTH = 0.22;

/** 片段著色器(匯出給測試檢查拆代碼的寫法和 packBuildingCode 一致) */
export const FRAGMENT = /* glsl */ `
  #include <color_fragment>
  {
    float y = vBandY;
    float u = vWall.x;
    float code = floor(vWall.y + 0.5);
    int kind = int(mod(code, ${CODE_SHOP}.0));
    float shop = mod(floor(code / ${CODE_SHOP}.0), 2.0);
    float seed = floor(code / ${CODE_SEED}.0);
    vec4 st = uWinStyle[kind]; // 週期、窗寬、窗下緣、窗上緣
    vec2 det = uDetail[kind]; // 窗台線(0/1)、玻璃反光強度
    float vertical = 1.0 - smoothstep(0.2, 0.5, abs(vUp));
    float wy = max(fwidth(y), 1e-4);
    float wu = max(fwidth(u), 1e-4);

    // ---- 窗格 ----
    float fl = floor(y / uFloor);
    float fy = y - fl * uFloor;
    float col = floor(u / st.x);
    float fu = u - col * st.x;
    float m = (st.x - st.y) * 0.5;
    float inU = smoothstep(m - wu, m + wu, fu) - smoothstep(m + st.y - wu, m + st.y + wu, fu);
    float inY = smoothstep(st.z - wy, st.z + wy, fy) - smoothstep(st.w - wy, st.w + wy, fy);
    // 一個週期小於約 4 像素就改用平均覆蓋率
    float blurU = smoothstep(0.12, 0.3, wu / st.x);
    float blurY = smoothstep(0.12, 0.3, wy / uFloor);
    float glass = mix(inU, st.y / st.x, blurU) * mix(inY, (st.w - st.z) / uFloor, blurY) * step(0.001, st.y);
    // 窗框(方案丁,0016 §9):窗洞內縮 uFrameW 的內側是玻璃,外圈一圈是淺色窗框;uFrameW = 0 時沒有窗框
    float fw = uFrameW;
    float iU = smoothstep(m + fw - wu, m + fw + wu, fu) - smoothstep(m + st.y - fw - wu, m + st.y - fw + wu, fu);
    float iY = smoothstep(st.z + fw - wy, st.z + fw + wy, fy) - smoothstep(st.w - fw - wy, st.w - fw + wy, fy);
    float inner = mix(iU, max(st.y - 2.0 * fw, 0.0) / st.x, blurU) * mix(iY, max(st.w - st.z - 2.0 * fw, 0.0) / uFloor, blurY) * step(0.001, st.y);
    inner = fw > 0.0 ? inner : glass;
    float frame = max(glass - inner, 0.0);
    float tone = fract(sin(dot(vec3(col, fl, seed), vec3(12.9898, 78.233, 37.719))) * 43758.5453);
    tone = mix(mix(uToneMin, uToneMax, tone), 0.5 * (uToneMin + uToneMax), max(blurU, blurY));
    vec3 glassColor = mix(uGlassDark, uGlassLight, tone);
    // 玻璃反光(0023):窗洞上方 uGlintFrac 的部分往白色混;遠處用平均
    float gTop = st.w - fw - (st.w - st.z - 2.0 * fw) * uGlintFrac;
    float glint = mix(smoothstep(gTop - wy, gTop + wy, fy), uGlintFrac, max(blurU, blurY));
    glassColor = mix(glassColor, vec3(1.0), det.y * glint);

    // ---- 窗台線(0023):窗下緣往下一條淺色水平線,比窗洞左右各寬一點 ----
    float sU = smoothstep(m - uSill.z - wu, m - uSill.z + wu, fu) - smoothstep(m + st.y + uSill.z - wu, m + st.y + uSill.z + wu, fu);
    float s1 = st.z - uSill.x;
    float sY = smoothstep(s1 - uSill.y - wy, s1 - uSill.y + wy, fy) - smoothstep(s1 - wy, s1 + wy, fy);
    float sill = mix(sU, min((st.y + 2.0 * uSill.z) / st.x, 1.0), blurU) * mix(sY, uSill.y / uFloor, blurY);
    float sillOn = det.x * step(0.001, st.y);

    // ---- 一樓店面(騎樓):深色帶 + 柱子;這一層不畫窗 ----
    float shopBand = shop * (1.0 - smoothstep(uShopH - wy, uShopH + wy, y));
    float pu = mod(u, uPillarGap);
    float pillar = 1.0 - smoothstep(uPillarW - wu, uPillarW + wu, pu);
    pillar = mix(pillar, uPillarW / uPillarGap, smoothstep(0.12, 0.3, wu / uPillarGap));
    glass *= 1.0 - shop * step(y, uFloor);
    sill *= sillOn * (1.0 - shop * step(y, uFloor));

    // 遠處整體再淡一點,避免平均色讓遠景發灰
    float fade = 1.0 - 0.5 * smoothstep(0.3, 1.0, wy);
    diffuseColor.rgb = mix(diffuseColor.rgb, mix(diffuseColor.rgb, vec3(1.0), uSillLighten), sill * vertical * fade);
    diffuseColor.rgb = mix(diffuseColor.rgb, uFrameColor, frame * vertical * fade);
    diffuseColor.rgb = mix(diffuseColor.rgb, glassColor, uStrength * inner * vertical * fade);
    diffuseColor.rgb = mix(diffuseColor.rgb, uShopColor, shopBand * (1.0 - pillar) * vertical * fade);
    // 牆腳壓暗(假的環境光遮蔽):貼地處最暗,往上 AO_HEIGHT 公尺內漸亮,建築才像「站」在地上
    diffuseColor.rgb *= mix(1.0 - uAoStrength, 1.0, smoothstep(0.0, uAoHeight, y) * vertical + (1.0 - vertical));
  }`;

/** look = 'old' 時用 0023 之前的窗格、不畫窗台線與反光(網址 ?bld=old) */
export function createBuildingMaterial(look: BuildingLook = 'fps'): THREE.MeshLambertMaterial {
  const old = look === 'old';
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true });
  const color = (hex: string) => new THREE.Color(hex);
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, {
      uFloor: { value: FLOOR_HEIGHT },
      uAoHeight: { value: AO_HEIGHT },
      uAoStrength: { value: AO_STRENGTH },
      uWinStyle: { value: (old ? WINDOW_STYLE_OLD : WINDOW_STYLE).map((s) => new THREE.Vector4(...s)) },
      uDetail: { value: FACADE_DETAIL.map(([a, b]) => (old ? new THREE.Vector2(0, 0) : new THREE.Vector2(a, b))) },
      uGlintFrac: { value: WINDOW_GLINT_FRAC },
      uSill: { value: new THREE.Vector3(SILL_DROP, SILL_H, SILL_OVERHANG) },
      uSillLighten: { value: SILL_LIGHTEN },
      uToneMin: { value: WINDOW_TONE_MIN },
      uToneMax: { value: WINDOW_TONE_MAX },
      uStrength: { value: PALETTE.windowStrength },
      uFrameW: { value: PALETTE.windowFrame ? WINDOW_FRAME_W : 0 },
      uFrameColor: { value: color(PALETTE.windowFrame ?? '#ffffff') },
      uGlassDark: { value: color(PALETTE.glassDark) },
      uGlassLight: { value: color(PALETTE.glassLight) },
      uShopColor: { value: color(PALETTE.shopfront) },
      uShopH: { value: SHOP_HEIGHT },
      uPillarW: { value: SHOP_PILLAR_W },
      uPillarGap: { value: SHOP_PILLAR_GAP },
    });
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec2 aWall;\nvarying vec2 vWall;\nvarying float vBandY;\nvarying float vUp;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvWall = aWall;\nvBandY = position.y;\nvUp = normal.y;');
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        varying vec2 vWall;
        varying float vBandY;
        varying float vUp;
        uniform float uFloor, uAoHeight, uAoStrength, uToneMin, uToneMax, uStrength, uShopH, uPillarW, uPillarGap, uFrameW;
        uniform vec3 uFrameColor;
        uniform vec4 uWinStyle[${KIND_COUNT}];
        uniform vec2 uDetail[${KIND_COUNT}];
        uniform float uGlintFrac, uSillLighten;
        uniform vec3 uSill;
        uniform vec3 uGlassDark, uGlassLight, uShopColor;`,
      )
      .replace('#include <color_fragment>', FRAGMENT);
  };
  return mat;
}
