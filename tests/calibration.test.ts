import { describe, expect, it } from 'vitest';
import { CalibrationSamples } from '@/lib/calibration';

describe('calibração por vários lances', () => {
  it('com um lance usa o próprio valor', () => {
    const c = new CalibrationSamples();
    expect(c.add(7.3, 0)).toEqual({ estimate: 7.3, count: 1 });
  });

  it('usa a mediana e ignora um toque errado', () => {
    const c = new CalibrationSamples();
    c.add(7, 0);
    c.add(15, 60); // toque atrasado
    expect(c.add(7.4, 120)).toEqual({ estimate: 7.4, count: 3 });
  });

  it('descarta lances antigos', () => {
    const c = new CalibrationSamples(600);
    c.add(20, 0);
    expect(c.add(8, 700)).toEqual({ estimate: 8, count: 1 });
  });

  it('clear recomeça do zero', () => {
    const c = new CalibrationSamples();
    c.add(20, 0);
    c.clear();
    expect(c.add(8, 1).count).toBe(1);
  });
});
