'use client';

import { PLAYER_STATE, PlayerLike } from './sync-engine';

/**
 * Player de rádio web (HLS) com a mesma interface que o SyncEngine usa para o YouTube.
 *
 * Como o atraso funciona aqui: streams de rádio costumam não ter DVR (a playlist da Gaúcha só
 * guarda ~20 s), então não dá para "voltar no tempo". Em vez disso o hls.js continua baixando
 * enquanto o áudio está pausado, até `maxBufferLength`. Pausar X segundos deixa o rádio X segundos
 * atrás, e diminuir o atraso é só avançar dentro do que já foi baixado. O motor de sincronização
 * é o mesmo do YouTube.
 *
 * O hls.js é carregado sob demanda para não pesar para quem só usa o YouTube.
 */

const BUFFERING = 3;
/** Quanto áudio guardar à frente da posição atual. É o atraso máximo possível. */
export const MAX_DELAY_S = 300;

export interface HlsHandlers {
  onState: (state: number) => void;
  /** Erro definitivo: o stream não vai tocar. */
  onError: (message: string) => void;
  /** Aviso passageiro (ex.: reconectando). */
  onNotice: (message: string) => void;
}

export class HlsAudioPlayer implements PlayerLike {
  private hls: import('hls.js').default | null = null;
  private readonly listeners: [string, () => void][] = [];
  /** true quando o aparelho usa HLS nativo e o app não controla o buffer. */
  limited = false;

  private constructor(
    private readonly audio: HTMLAudioElement,
    private readonly handlers: HlsHandlers,
  ) {}

  /**
   * Cada player tem o próprio <audio> (fora do DOM): destruir um carregamento antigo não
   * interfere no novo. Lança erro se o navegador não toca HLS.
   */
  static async create(url: string, handlers: HlsHandlers): Promise<HlsAudioPlayer> {
    const { default: Hls } = await import('hls.js');
    const audio = new Audio();
    const p = new HlsAudioPlayer(audio, handlers);
    p.listen('playing', PLAYER_STATE.PLAYING);
    p.listen('pause', PLAYER_STATE.PAUSED);
    p.listen('waiting', BUFFERING);
    // Exigido pelo ManagedMediaSource do iOS (17.1+) para tocar sem fonte alternativa de AirPlay.
    audio.disableRemotePlayback = true;

    if (Hls.isSupported()) {
      const hls = new Hls({
        lowLatencyMode: false,
        liveSyncDurationCount: 2, // começa 2 segmentos atrás do ao vivo: menos latência, ainda estável
        maxBufferLength: MAX_DELAY_S,
        maxMaxBufferLength: MAX_DELAY_S,
        backBufferLength: 60,
      });
      p.hls = hls;
      hls.on(Hls.Events.ERROR, (_e, data) => {
        if (!data.fatal) return;
        const manifest = [
          Hls.ErrorDetails.MANIFEST_LOAD_ERROR,
          Hls.ErrorDetails.MANIFEST_LOAD_TIMEOUT,
          Hls.ErrorDetails.MANIFEST_PARSING_ERROR,
        ] as string[];
        if (manifest.includes(data.details)) {
          handlers.onError('Não consegui abrir esse stream. Confira o link; a rádio também pode bloquear outros sites.');
          p.destroy();
        } else if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
          handlers.onNotice('Conexão instável, tentando de novo…');
          hls.startLoad();
        } else if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
          hls.recoverMediaError();
        } else {
          handlers.onError('Erro ao tocar o stream. Recarregue a página.');
          p.destroy();
        }
      });
      hls.loadSource(url);
      hls.attachMedia(audio);
    } else if (audio.canPlayType('application/vnd.apple.mpegurl')) {
      // iPhone antigo (sem ManagedMediaSource): HLS nativo, sem controle do buffer.
      audio.src = url;
      p.limited = true;
    } else {
      p.destroy();
      throw new Error('Este navegador não toca streams HLS.');
    }
    return p;
  }

  private listen(event: string, state: number) {
    const fn = () => this.handlers.onState(state);
    this.audio.addEventListener(event, fn);
    this.listeners.push([event, fn]);
  }

  private bufferedEnd() {
    const b = this.audio.buffered;
    return b.length ? b.end(b.length - 1) : this.audio.currentTime;
  }

  getCurrentTime() {
    return this.audio.currentTime;
  }

  /** "Ao vivo" para o motor: o ponto de sincronia do hls.js ou o fim do que já foi baixado. */
  getDuration() {
    return this.hls?.liveSyncPosition ?? this.bufferedEnd();
  }

  getPlayerState() {
    if (this.audio.paused) return PLAYER_STATE.PAUSED;
    return this.audio.readyState < HTMLMediaElement.HAVE_FUTURE_DATA ? BUFFERING : PLAYER_STATE.PLAYING;
  }

  playVideo() {
    // Se o navegador recusar (sem toque do usuário), continua pausado e o motor mostra "bloqueado".
    this.audio.play().catch(() => {});
  }

  pauseVideo() {
    this.audio.pause();
  }

  /** Não passa do que já foi baixado, para não travar esperando dados. */
  seekTo(seconds: number) {
    this.audio.currentTime = Math.min(seconds, Math.max(this.audio.currentTime, this.bufferedEnd() - 0.5));
  }

  destroy() {
    for (const [event, fn] of this.listeners) this.audio.removeEventListener(event, fn);
    this.listeners.length = 0;
    this.hls?.destroy();
    this.hls = null;
    this.audio.pause();
    this.audio.removeAttribute('src');
    this.audio.load();
  }
}
