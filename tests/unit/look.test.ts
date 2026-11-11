// 畫面質感(decisions/0016):效果開關的網址參數
import { describe, expect, it } from 'vitest';
import { fxFromUrl } from '../../src/render/post';
import { FX_NAMES } from '../../src/config/look';

describe('fxFromUrl', () => {
  it('沒有參數:全部照預設(不覆寫)', () => {
    expect(fxFromUrl('', FX_NAMES)).toEqual({});
  });
  it('off:全部關掉(等同改版前)', () => {
    const fx = fxFromUrl('?fx=off', FX_NAMES);
    for (const n of FX_NAMES) expect(fx[n]).toBe(false);
  });
  it('減號關、沒減號開;不認得的名稱忽略', () => {
    expect(fxFromUrl('?fx=-gtao,bloom,nope', FX_NAMES)).toEqual({ gtao: false, bloom: true });
  });
});

describe('hudTheme', () => {
  it('預設 c(Cooper 選定);?hud=a / b 切換;不認得的值回到 c', async () => {
    const { hudTheme } = await import('../../src/ui/hud');
    expect(hudTheme('')).toBe('c');
    expect(hudTheme('?hud=b')).toBe('b');
    expect(hudTheme('?hud=a&fx=off')).toBe('a');
    expect(hudTheme('?hud=z')).toBe('c');
  });
});
