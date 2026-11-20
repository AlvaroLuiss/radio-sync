/**
 * Motor de sincronização: mantém o áudio do player X segundos atrás do "ao vivo".
 *
 * Modelo: ao começar (ou ao ressincronizar) guardamos uma âncora { media, wall }.
 * A posição esperada do player a qualquer momento é `media + (agora - wall)`.
 * A cada tick comparamos com a posição real:
 *   erro > 0  → o rádio adiantou (ex.: o YouTube pulou para o ao vivo) → pausa pelo tempo do erro
 *   erro < 0  → o rádio atrasou (ex.: travou carregando)               → avança no vídeo
 * Mudar o atraso é só mover a âncora; o próximo tick faz a correção.
 *
 * Não depende do React nem do objeto global `YT`, para poder ser testado com um player falso.
 */

export interface PlayerLike {
  getCurrentTime(): number;
  getDuration(): number;
  getPlayerState(): number;
  playVideo(): void;
  pauseVideo(): void;
  seekTo(seconds: number, allowSeekAhead: boolean): void;
}

export type SyncStatus =
  | 'idle'        // ainda não tocou
  | 'anchoring'   // esperando a reprodução estabilizar
  | 'adjusting'   // pausando/avançando
  | 'synced'
  | 'correcting'
  | 'blocked';    // o iOS não deixou dar play sozinho

export interface SyncState {
  delay: number;
  status: SyncStatus;
  error: number;
}

export const PLAYER_STATE = { PLAYING: 1, PAUSED: 2 } as const;

export interface SyncOptions {
  tolerance?: number;       // erro aceito (s)
  seekOvershoot?: number;   // ao avançar, passa do ponto e corrige com pausa (pausa é mais precisa)
  anchorWaitMs?: number;
  tickMs?: number;
  now?: () => number;       // relógio em segundos (injetável nos testes)
}

export class SyncEngine {
  private anchor: { media: number; wall: number } | null = null;
  private busy = false;
  private anchoring = false;
  private started = false;
  private blocked = false;
  private lastErr = 0;
  private timer: ReturnType<typeof setInterval> | null = null;

  private readonly tol: number;
  private readonly overshoot: number;
  private readonly anchorWaitMs: number;
  private readonly tickMs: number;
  private readonly now: () => number;

  constructor(
    private readonly player: PlayerLike,
    private delay: number,
    private readonly onChange: (s: SyncState) => void,
    opts: SyncOptions = {},
  ) {
    this.tol = opts.tolerance ?? 0.4;
    this.overshoot = opts.seekOvershoot ?? 0.6;
    this.anchorWaitMs = opts.anchorWaitMs ?? 1500;
    this.tickMs = opts.tickMs ?? 1000;
    this.now = opts.now ?? (() => performance.now() / 1000);
  }

  get currentDelay() {
    return this.delay;
  }

  get isStarted() {
    return this.started;
  }

  /** Repasse aqui os eventos onStateChange do player. */
  handleStateChange(state: number) {
    if (state === PLAYER_STATE.PLAYING) {
      this.started = true;
      this.blocked = false;
      if (!this.timer) this.timer = setInterval(() => this.tick(), this.tickMs);
      if (!this.anchor && !this.anchoring) this.scheduleAnchor();
    }
    this.emit();
  }

  /** Soma `d` segundos ao atraso (nunca abaixo de 0). Retorna quanto foi aplicado de fato. */
  changeDelay(d: number): number {
    const next = Math.max(0, Math.round((this.delay + d) * 10) / 10);
    const applied = next - this.delay;
    this.delay = next;
    if (this.anchor) this.anchor.media -= applied;
    this.tick();
    return applied;
  }

  /** Volta para a borda ao vivo e reaplica o atraso atual. */
  resync() {
    if (!this.started) return;
    this.anchor = null;
    this.busy = false;
    this.lastErr = 0;
    this.player.seekTo(this.player.getDuration(), true);
    this.player.playVideo();
    setTimeout(() => {
      if (!this.anchor && !this.anchoring) this.scheduleAnchor();
    }, 500);
    this.emit();
  }

  destroy() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  tick() {
    if (!this.anchor || this.busy) return this.emit();
    if (this.player.getPlayerState() !== PLAYER_STATE.PLAYING) return this.emit();
    this.lastErr = this.player.getCurrentTime() - this.expected();
    if (this.lastErr > this.tol) this.holdFor(this.lastErr);
    else if (this.lastErr < -this.tol) this.seekForward(-this.lastErr);
    this.emit();
  }

  private expected() {
    return this.anchor!.media + (this.now() - this.anchor!.wall);
  }

  private scheduleAnchor() {
    this.anchoring = true;
    this.emit();
    setTimeout(() => {
      this.anchoring = false;
      if (this.player.getPlayerState() !== PLAYER_STATE.PLAYING) return; // tenta no próximo PLAYING
      this.anchor = { media: this.player.getCurrentTime() - this.delay, wall: this.now() };
      this.tick();
    }, this.anchorWaitMs);
  }

  private holdFor(sec: number) {
    this.busy = true;
    this.player.pauseVideo();
    setTimeout(() => {
      this.player.playVideo();
      setTimeout(() => {
        this.busy = false;
        if (this.player.getPlayerState() === PLAYER_STATE.PAUSED) this.blocked = true;
        this.emit();
      }, 1200);
    }, sec * 1000);
  }

  private seekForward(sec: number) {
    this.busy = true;
    this.player.seekTo(this.player.getCurrentTime() + sec + this.overshoot, true);
    setTimeout(() => {
      this.busy = false;
      this.emit();
    }, 2000);
  }

  private status(): SyncStatus {
    if (!this.started) return 'idle';
    if (this.blocked) return 'blocked';
    if (this.busy) return 'adjusting';
    if (!this.anchor) return 'anchoring';
    return Math.abs(this.lastErr) <= this.tol ? 'synced' : 'correcting';
  }

  private emit() {
    this.onChange({ delay: this.delay, status: this.status(), error: this.lastErr });
  }
}
