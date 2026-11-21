'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { pushRecent, RecentItem, setRecentTitle } from './recent';
import { storage } from './storage';

/** Estado e persistência dos links recentes. Funções estáveis (leem de uma ref). */
export function useRecent() {
  const ref = useRef<RecentItem[]>([]);
  const [list, setList] = useState<RecentItem[]>([]);

  const commit = useCallback((next: RecentItem[]) => {
    if (next === ref.current) return;
    ref.current = next;
    setList(next);
    storage.set('recent', next);
  }, []);

  useEffect(() => {
    // Carregado num efeito para não divergir do HTML gerado no servidor.
    const saved = storage.get<RecentItem[]>('recent', []);
    ref.current = saved;
    setList(saved);
  }, []);

  const add = useCallback((item: RecentItem) => commit(pushRecent(ref.current, item)), [commit]);

  const setTitle = useCallback(
    (key: string, title: string) => {
      const next = setRecentTitle(ref.current, key, title);
      if (next.some((r, i) => r !== ref.current[i])) commit(next);
    },
    [commit],
  );

  return { list, add, setTitle };
}
