'use client';

import { FormEvent, useCallback, useEffect, useRef, useState } from 'react';
import { SyncEngine, SyncState } from '@/lib/sync-engine';
import { loadYouTubeApi, parseYouTubeId, YT_ERRORS } from '@/lib/youtube';
import { fmt, signed, storage } from '@/lib/storage';
import { useWakeLock } from '@/lib/use-wake-lock';

const STATUS_TEXT: Record<SyncState['status'], (s: SyncState) => [string, string]> = {
  idle: () => ['Pronto. Toque em ▶ para começar.', 'muted'],
  anchoring: () => ['Aguardando a reprodução estabilizar…', 'warn'],
  adjusting: () => ['Ajustando…', 'warn'],
  synced: (s) => [`Sincronizado (erro ${signed(s.error)} s)`, 'ok'],
  correcting: (s) => [`Corrigindo ${signed(s.error)} s…`, 'warn'],
  blocked: () => ['O iPhone bloqueou o play automático: toque em ▶ no player.', 'warn'],
};

type Mark = { radio?: number; tv?: number };

export default function RadioSync() {
  const playerEl = useRef<HTMLDivElement>(null);
  const player = useRef<YT.Player | null>(null);
  const engine = useRef<SyncEngine | null>(null);
  const videoId = useRef<string | null>(null);

  const [url, setUrl] = useState('');
  const [ready, setReady] = useState(false);
  const [sync, setSync] = useState<SyncState | null>(null);
  const [notice, setNotice] = useState<[string, string]>(['Cole o link da live e toque em Carregar.', 'muted']);
  const [marks, setMarks] = useState<Mark>({});
  const [calibMsg, setCalibMsg] = useState('');
  const wake = useWakeLock();

  const onSync = useCallback((s: SyncState) => {
    setSync(s);
    if (videoId.current) storage.set(`delay:${videoId.current}`, s.delay);
  }, []);

  const newEngine = useCallback(
    (id: string) => {
      engine.current?.destroy();
      const delay = storage.get(`delay:${id}`, 0);
      engine.current = new SyncEngine(player.current!, delay, onSync);
      setSync({ delay, status: 'idle', error: 0 });
      setNotice(['', '']);
    },
    [onSync],
  );

  const load = useCallback(
    async (input: string) => {
      const id = parseYouTubeId(input);
      if (!id) return setNotice(['Não reconheci esse link do YouTube.', 'err']);
      storage.set('lastUrl', input.trim());
      videoId.current = id;
      const YTApi = await loadYouTubeApi();

      if (player.current) {
        player.current.cueVideoById(id);
        newEngine(id);
        return;
      }
      player.current = new YTApi.Player(playerEl.current!, {
        videoId: id,
        playerVars: { playsinline: 1, rel: 0 },
        events: {
          onReady: () => {
            setReady(true);
            newEngine(id);
          },
          onStateChange: (e) => engine.current?.handleStateChange(e.data),
          onError: (e) => setNotice([YT_ERRORS[e.data] ?? `Erro do YouTube (${e.data}).`, 'err']),
        },
      });
    },
    [newEngine],
  );

  // Recarrega a última live usada
  useEffect(() => {
    const last = storage.get('lastUrl', '');
    if (last) {
      setUrl(last);
      load(last);
    }
    return () => engine.current?.destroy();
  }, [load]);

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    load(url);
  };

  const start = () => {
    player.current?.playVideo(); // precisa vir de um toque no iOS
    wake.request();
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
    if (eng.currentDelay + diff < 0) {
      const behind = -(eng.currentDelay + diff);
      eng.changeDelay(-eng.currentDelay);
      return setCalibMsg(
        `O rádio parece estar ${fmt(behind)} s atrás da TV. Toque em Ressincronizar; se continuar, a TV é que precisaria atrasar.`,
      );
    }
    const applied = eng.changeDelay(diff);
    setCalibMsg(`Ajuste de ${signed(applied)} s aplicado. Repita em outro lance para conferir.`);
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
          placeholder="Link da live da rádio no YouTube"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
        />
        <button type="submit">Carregar</button>
      </form>

      <div className="player">
        <div ref={playerEl} />
      </div>

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
          e na TV. Repita uma ou duas vezes para afinar.
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

      <button className="wide" onClick={() => engine.current?.resync()}>
        ⟳ Ressincronizar com o ao vivo
      </button>
    </main>
  );
}
