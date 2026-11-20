'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

/** Mantém a tela ligada (Screen Wake Lock API). No iOS, Safari 16.4+. */
export function useWakeLock() {
  const lock = useRef<WakeLockSentinel | null>(null);
  const wanted = useRef(false);
  const [message, setMessage] = useState('');

  const request = useCallback(async () => {
    wanted.current = true;
    if (!('wakeLock' in navigator)) {
      setMessage(
        'Este navegador não mantém a tela ligada sozinho. Em Ajustes › Tela e Brilho › Bloqueio Automático, escolha "Nunca" durante o jogo.',
      );
      return;
    }
    try {
      lock.current = await navigator.wakeLock.request('screen');
      setMessage('🔆 A tela vai ficar ligada enquanto o app estiver aberto.');
      lock.current.addEventListener('release', () => {
        lock.current = null;
      });
    } catch {
      setMessage('Não consegui manter a tela ligada. Desative o Bloqueio Automático durante o jogo.');
    }
  }, []);

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible' && wanted.current && !lock.current) request();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [request]);

  return { request, message };
}
