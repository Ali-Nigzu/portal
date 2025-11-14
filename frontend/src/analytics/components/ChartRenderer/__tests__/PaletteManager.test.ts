import { PaletteManager } from '../managers';

describe('PaletteManager', () => {
  it('assigns deterministic colors across instances', () => {
    const ids = ['series_a', 'series_b', 'series_c'];
    const first = new PaletteManager();
    const colorsFirst = ids.map((id) => first.getColor(id));

    const second = new PaletteManager();
    const colorsSecond = ids.map((id) => second.getColor(id));

    expect(colorsFirst).toEqual(colorsSecond);
  });

  it('keeps colors stable when requesting out of order', () => {
    const manager = new PaletteManager();
    const colorA = manager.getColor('series_a');
    manager.getColor('series_b');
    const repeatA = manager.getColor('series_a');

    expect(colorA).toEqual(repeatA);
  });
});
