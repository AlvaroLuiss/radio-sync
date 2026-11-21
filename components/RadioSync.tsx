'use client';

import { FormEvent, useCallback, useEffect, useRef, useState } from 'react';
import { PLAYER_STATE, PlayerLike, SyncEngine, SyncState } from '@/lib/sync-engine';
import { loadYouTubeApi, YT_ERRORS } from '@/lib/youtube';
import { parseSource } from '@/lib/sources';
import { HlsAudioPlayer } from '@/lib/hls-player';
import { useRecent } from '@/lib/use-recent';
import { recentLabel } from '@/lib/recent';
import { fmt, signed, storage } from '@/lib/storage';
import { useWakeLock } from '@/lib/use-wake-lock';
import { CalibrationSamples } from '@/lib/calibration';
import { round1 } from '@/lib/stats';

const STATUS_TEXT: Record<SyncState['status'], (s: SyncState) => [string, string]> = {
  idle: () => ['Pronto. Toque em ▶ para começar.', 'muted'],
  anchoring: () => ['Aguardando a reprodução estabilizar…', 'warn'],
  adjusting: () => ['Ajustando…', 'warn'],
  synced: (s) => [`Sincronizado (erro ${signed(s.error)} s)`, 'ok'],
  correcting: (s) => [`Corrigindo ${signed(s.error)} s…`, 'warn'],
  blocked: () => ['O iPhone bloqueou o play automático: toque em ▶ Tocar.', 'warn'],
};

type Mark = { radio?: number; tv?: number };
type Kind = 'youtube' | 'hls';

export default function RadioSync() {
  // YouTube: um único player, reaproveitado entre lives (cueVideoById).
  const playerEl = useRef<HTMLDivElement>(null);
  const yt = useRef<YT.Player | null>(null);
  const ytReady = useRef(false);
  const ytWanted = useRef<string | null>(null); // live a abrir quando o player ficar pronto
  // Rádio web: um player por stream.
  const hls = useRef<HlsAudioPlayer | null>(null);

  const active = useRef<PlayerLike | null>(null); // player que o motor está controlando
  const sourceKey = useRef<string | null>(null); // chave do atraso salvo: delay:<key>
  const loadSeq = useRef(0); // descarta carregamentos que ficaram para trás
  const engine = useRef<SyncEngine | null>(null);
  const calib = useRef(new CalibrationSamples());

  const [url, setUrl] = useState('');
  const [kind, setKind] = useState<Kind | null>(null);
  const [currentKey, setCurrentKey] = useState<string | null>(null);
  const [streamInfo, setStreamInfo] = useState<{ host: string; limited: boolean } | null>(null);
  const [ready, setReady] = useState(false);
  const [sync, setSync] = useState<SyncState | null>(null);
  const [notice, setNotice] = useState<[string, string]>([
    'Cole o link de uma live do YouTube ou de um stream .m3u8 e toque em Carregar.',
    'muted',
  ]);
  const [marks, setMarks] = useState<Mark>({});
  const [calibMsg, setCalibMsg] = useState('');
  const wake = useWakeLock();
  // Antes do efeito que recarrega a última fonte: a lista precisa estar carregada.
  const recent = useRecent();
  const { add: addRecent, setTitle: setRecentTitle } = recent;

  const onSync = useCallback((s: SyncState) => {
    setSync(s);
    if (sourceKey.current) storage.set(`delay:${sourceKey.current}`, s.delay);
  }, []);

  const newEngine = useCallback(
    (key: string, p: PlayerLike) => {
      engine.current?.destroy();
      calib.current.clear();
      active.current = p;
      sourceKey.current = key;
      const delay = storage.get(`delay:${key}`, 0);
      engine.current = new SyncEngine(p, delay, onSync);
      setSync({ delay, status: 'idle', error: 0 });
      setNotice(['', '']);
      setReady(true);
    },
    [onSync],
  );

  /** Para o que estiver tocando antes de trocar de fonte. */
  const stopCurrent = useCallback(() => {
    engine.current?.destroy();
    engine.current = null;
    active.current = null;
    hls.current?.destroy();
    hls.current = null;
    if (ytReady.current) yt.current?.pauseVideo();
    setReady(false);
  }, []);

  const loadStream = useCallback(
    async (streamUrl: string, key: string, seq: number) => {
      setNotice(['Carregando o stream…', 'muted']);
      let p: HlsAudioPlayer;
      try {
        p = await HlsAudioPlayer.create(streamUrl, {
          onState: (s) => {
            if (hls.current !== p) return;
            if (s === PLAYER_STATE.PLAYING) setNotice(['', '']); // limpa "reconectando"
            engine.current?.handleStateChange(s);
          },
          onError: (m) => {
            if (hls.current !== p) return;
            setReady(false);
            setNotice([m, 'err']);
          },
          onNotice: (m) => hls.current === p && setNotice([m, 'warn']),
        });
      } catch (e) {
        if (seq === loadSeq.current) setNotice([(e as Error).message, 'err']);
        return;
      }
      if (seq !== loadSeq.current) return p.destroy();
      hls.current = p;
      setStreamInfo({ host: new URL(streamUrl).hostname, limited: p.limited });
      newEngine(key, p);
    },
    [newEngine],
  );

  /** O título da live só fica disponível depois que o player carrega o vídeo. */
  const saveYouTubeTitle = useCallback(() => {
    const d = yt.current?.getVideoData?.();
    if (d?.title && d.video_id) setRecentTitle(d.video_id, d.title);
  }, [setRecentTitle]);

  const loadYouTube = useCallback(
    async (id: string, seq: number) => {
      ytWanted.current = id;
      const YTApi = await loadYouTubeApi();
      if (seq !== loadSeq.current) return;

      if (yt.current) {
        // Ainda inicializando: o onReady abre a live mais recente (ytWanted).
        if (!ytReady.current) return;
        yt.current.cueVideoById(id);
        newEngine(id, yt.current);
        return;
      }
      yt.current = new YTApi.Player(playerEl.current!, {
        videoId: id,
        playerVars: { playsinline: 1, rel: 0 },
        events: {
          onReady: () => {
            ytReady.current = true;
            const want = ytWanted.current;
            if (!want) return; // o usuário trocou para um stream enquanto o player carregava
            if (want !== id) yt.current!.cueVideoById(want);
            newEngine(want, yt.current!);
            saveYouTubeTitle();
          },
          onStateChange: (e) => {
            saveYouTubeTitle();
            if (active.current === yt.current) engine.current?.handleStateChange(e.data);
          },
          onError: (e) => setNotice([YT_ERRORS[e.data] ?? `Erro do YouTube (${e.data}).`, 'err']),
        },
      });
    },
    [newEngine, saveYouTubeTitle],
  );

  const load = useCallback(
    (input: string) => {
      const r = parseSource(input);
      if ('error' in r) return setNotice([r.error, 'err']);
      const src = r.source;
      storage.set('lastUrl', input.trim());
      addRecent({ key: src.key, input: input.trim(), kind: src.kind });
      const seq = ++loadSeq.current;
      stopCurrent();
      setKind(src.kind);
      setCurrentKey(src.key);
      if (src.kind === 'hls') {
        ytWanted.current = null;
        return loadStream(src.url, src.key, seq);
      }
      setStreamInfo(null);
      return loadYouTube(src.id, seq);
    },
    [stopCurrent, loadStream, loadYouTube, addRecent],
  );

  // Recarrega a última fonte usada
  useEffect(() => {
    const last = storage.get('lastUrl', '');
    if (last) {
      setUrl(last);
      load(last);
    }
    return () => {
      engine.current?.destroy();
      hls.current?.destroy();
      hls.current = null;
    };
  }, [load]);

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    load(url);
  };

  const openRecent = (input: string, key: string) => {
    if (key === currentKey) return; // já é a fonte atual: não interrompe o rádio
    setUrl(input);
    load(input);
  };

  const start = () => {
    active.current?.playVideo(); // precisa vir de um toque no iOS
    wake.request();
  };

  const resync = () => {
    calib.current.clear(); // nova âncora: as estimativas anteriores deixam de valer
    engine.current?.resync();
  };

  const mark = (kind: 'radio' | 'tv') => {
    const now = performance.now() / 1000;
    const next = { ...marks, [kind]: now };
    if (next.radio == null || next.tv == null) {
      setMarks(next);
      setCalibMsg('Agora toque no outro botão quando o mesmo lance aparecer.');
      return;
    }
    setMarks({});
    const eng = engine.current;
    if (!eng?.isStarted) return setCalibMsg('Comece a tocar o rádio antes de calibrar.');

    const diff = next.tv - next.radio; // > 0: rádio está na frente
    if (Math.abs(diff) > 60) return setCalibMsg('Diferença acima de 60 s. Tente de novo.');
    const target = round1(eng.currentDelay + diff);
    if (target < 0) {
      eng.changeDelay(-eng.currentDelay);
      return setCalibMsg(
        `O rádio parece estar ${fmt(-target)} s atrás da TV. Toque em Ressincronizar; se continuar, a TV é que precisaria atrasar.`,
      );
    }
    const { estimate, count } = calib.current.add(target, now);
    const applied = eng.changeDelay(estimate - eng.currentDelay);
    setCalibMsg(
      count === 1
        ? `Ajuste de ${signed(applied)} s aplicado. Repita em outro lance para conferir.`
        : `Ajuste de ${signed(applied)} s aplicado (mediana de ${count} lances).`,
    );
  };

  // Marcação de calibração expira em 60 s
  useEffect(() => {
    if (marks.radio == null && marks.tv == null) return;
    const t = setTimeout(() => setMarks({}), 60_000);
    return () => clearTimeout(t);
  }, [marks]);

  const [statusText, statusKind] = notice[0] ? notice : sync ? STATUS_TEXT[sync.status](sync) : notice;

  return (
    <main>
      <h1>
        Rádio <span>Sync</span>
      </h1>

      <form onSubmit={onSubmit}>
        <input
          type="url"
          inputMode="url"
          autoComplete="off"
          placeholder="Live do YouTube ou stream .m3u8 da rádio"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
        />
        <button type="submit">Carregar</button>
      </form>

      {recent.list.length > 0 && (
        <section className="card">
          <div className="label">Recentes</div>
          <div className="recent">
            {recent.list.map((r) => (
              <button
                key={r.key}
                className={`recent-item${r.key === currentKey ? ' on' : ''}`}
                onClick={() => openRecent(r.input, r.key)}
                aria-current={r.key === currentKey ? 'true' : undefined}
              >
                <span aria-hidden="true">{r.kind === 'youtube' ? '▶️' : '📻'}</span>
                <span className="recent-label">{recentLabel(r)}</span>
              </button>
            ))}
          </div>
        </section>
      )}

      {/* Fica montado mesmo com stream: o YouTube substitui esta div pelo iframe. */}
      <div className={`player${kind === 'hls' ? ' hidden' : ''}`}>
        <div ref={playerEl} />
      </div>

      {kind === 'hls' && (
        <section className="card">
          <div className="label">Rádio web</div>
          <div className="stream-host">📻 {streamInfo?.host ?? 'carregando…'}</div>
          {streamInfo?.limited && (
            <p className="warn" style={{ margin: '6px 0 0' }}>
              Neste aparelho o atraso pode não se manter durante pausas longas.
            </p>
          )}
        </section>
      )}

      <button className="primary wide" disabled={!ready} onClick={start}>
        ▶ Tocar e manter a tela ligada
      </button>
      <p className="muted">{wake.message}</p>

      <section className="card">
        <div className="label">Atraso aplicado ao rádio</div>
        <div className="big">{fmt(sync?.delay ?? 0)} s</div>
        <div className={statusKind}>{statusText}</div>
        <div className="grid4">
          {[-5, -0.5, 0.5, 5].map((d) => (
            <button key={d} onClick={() => engine.current?.changeDelay(d)}>
              {d > 0 ? '+' : '−'}
              {Math.abs(d) >= 1 ? `${Math.abs(d)} s` : fmt(Math.abs(d))}
            </button>
          ))}
        </div>
      </section>

      <section className="card">
        <div className="label">Calibrar por lance</div>
        <p className="muted" style={{ margin: '6px 0 0' }}>
          Escolha um lance claro (apito, chute, gol) e toque em cada botão no momento em que ele acontecer no rádio
          e na TV. Repita em dois ou três lances: o app usa a mediana e ignora um toque errado.
        </p>
        <div className="grid2">
          <button className={`mark${marks.radio != null ? ' on' : ''}`} onClick={() => mark('radio')}>
            📻 Ouvi no rádio
          </button>
          <button className={`mark${marks.tv != null ? ' on' : ''}`} onClick={() => mark('tv')}>
            📺 Vi na TV
          </button>
        </div>
        <div className="muted calib">{calibMsg}</div>
      </section>

      <button className="wide" onClick={resync}>
        ⟳ Ressincronizar com o ao vivo
      </button>
    </main>
  );
}
