import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PLAYER_STATE, PlayerLike, SyncEngine } from '@/lib/sync-engine';

/** Player falso de live: o "ao vivo" anda com o relógio; a posição só anda quando está tocando. */
function fakeLivePlayer(clock: () => number, onState: (s: number) => void) {
  let pos = 100;
  let state = -1;
  let last = clock();
  const advance = () => {
    const t = clock();
    if (state === PLAYER_STATE.PLAYING) pos += t - last;
    last = t;
  };
  const live = () => 100 + clock();
  const player: PlayerLike & { jump(d: number): void; stall(d: number): void; lag(): number } = {
    getCurrentTime: () => (advance(), pos),
    getDuration: () => (advance(), live()),
    getPlayerState: () => state,
    playVideo: () => { advance(); state = PLAYER_STATE.PLAYING; onState(state); },
    pauseVideo: () => { advance(); state = PLAYER_STATE.PAUSED; onState(state); },
    seekTo: (s) => { advance(); pos = Math.min(s, live()) + 0.25; }, // seek impreciso
    jump: (d) => { advance(); pos += d; },
    stall: (d) => { advance(); pos -= d; },
    lag: () => (advance(), live() - pos),
  };
  return player;
}

describe('SyncEngine', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  const clock = () => Date.now() / 1000;

  function setup(initialDelay = 0) {
    let engine!: SyncEngine;
    const player = fakeLivePlayer(clock, (s) => engine.handleStateChange(s));
    engine = new SyncEngine(player, initialDelay, () => {}, { now: clock });
    player.playVideo();
    const baseline = player.lag(); // atraso de referência: o ponto onde o play começou
    vi.advanceTimersByTime(3000);
    return { engine, player, added: () => player.lag() - baseline };
  }

  it('aplica o atraso salvo ao começar', () => {
    const { added } = setup(6);
    vi.advanceTimersByTime(10_000);
    expect(added()).toBeCloseTo(6, 0);
  });

  it('aplica a diferença da calibração', () => {
    const { engine, added } = setup();
    engine.changeDelay(7.3);
    vi.advanceTimersByTime(15_000);
    expect(Math.abs(added() - 7.3)).toBeLessThan(0.5);
  });

  it('reaplica o atraso quando o YouTube pula para o ao vivo', () => {
    const { engine, player, added } = setup();
    engine.changeDelay(8);
    vi.advanceTimersByTime(15_000);
    player.jump(5);
    vi.advanceTimersByTime(10_000);
    expect(Math.abs(added() - 8)).toBeLessThan(0.5);
  });

  it('recupera o atraso depois de uma travada', () => {
    const { engine, player, added } = setup();
    engine.changeDelay(8);
    vi.advanceTimersByTime(15_000);
    player.stall(4);
    vi.advanceTimersByTime(10_000);
    expect(Math.abs(added() - 8)).toBeLessThan(0.5);
  });

  it('não deixa o atraso negativo', () => {
    const { engine } = setup();
    expect(engine.changeDelay(-5)).toBe(0);
    expect(engine.currentDelay).toBe(0);
  });
});
