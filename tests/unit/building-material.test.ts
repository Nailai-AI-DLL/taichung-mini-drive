// 夜景(decisions/0042):建築材質的夜景參數與「發光傢俱」代碼。
import { describe, expect, it } from 'vitest';
import { FRAGMENT, NIGHT_UNIFORMS, setBuildingNight } from '../../src/render/building-material';
import { GLOW_CODE, unpackBuildingCode } from '../../src/world/gen/mesh';
import { KIND, KIND_COUNT, SHOP_KINDS } from '../../src/config/buildings';
import { NIGHT } from '../../src/config/look';
import { decodeTreeKind } from '../../src/config/furniture';

describe('夜景', () => {
  it('發光代碼 = 低矮建築 + 店面:任何建築都不會是這個組合(低矮建築不開店)', () => {
    expect(unpackBuildingCode(GLOW_CODE)).toMatchObject({ kind: KIND.Low, shop: true });
    expect(SHOP_KINDS).not.toContain(KIND.Low);
  });

  it('著色器有夜景區塊;發光判斷和 GLOW_CODE 的細分類一致', () => {
    expect(FRAGMENT).toContain('uNight');
    expect(FRAGMENT).toContain(`kind == ${KIND.Low} && shop > 0.5`);
  });

  it('廟宇的柱廊夜裡不當店面發光(0042 驗收)', () => {
    expect(FRAGMENT).toContain(`kind == ${KIND.Temple} ? 0.0 : 1.0`);
  });

  it('每個細分類都有亮燈比例(0–1);廟宇、低矮建築不亮;窗燈顏色是混合', () => {
    expect(NIGHT.lit).toHaveLength(KIND_COUNT);
    for (const v of NIGHT.lit) expect(v >= 0 && v <= 1).toBe(true);
    expect(NIGHT.lit[KIND.Temple]).toBe(0);
    expect(NIGHT.lit[KIND.Low]).toBe(0);
    expect(NIGHT.warmShare > 0 && NIGHT.warmShare < 1).toBe(true);
  });

  it('setBuildingNight 切換共用參數(所有建築材質一起變)', () => {
    setBuildingNight(true);
    expect(NIGHT_UNIFORMS.uNight.value).toBe(1);
    setBuildingNight(false);
    expect(NIGHT_UNIFORMS.uNight.value).toBe(0);
  });

  it('(順帶)樹的編碼不會撞到 0–4 的舊樹形', () => {
    expect(decodeTreeKind(4).kind).toBe(4);
  });
});
