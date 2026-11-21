/**
 * Últimos links usados (YouTube ou rádio web), do mais recente para o mais antigo.
 * Funções puras, sem React nem localStorage.
 */
import type { Source } from './sources';

export const MAX_RECENT = 3;

export interface RecentItem {
  key: string; // mesma chave da fonte (Source.key): identifica repetidos
  input: string; // link como foi colado, para carregar de novo
  kind: Source['kind'];
  title?: string; // título da live do YouTube, quando o player informa
}

/** Coloca o link no topo, sem repetir, mantendo o título já conhecido. */
export function pushRecent(list: RecentItem[], item: RecentItem): RecentItem[] {
  const prev = list.find((r) => r.key === item.key);
  const next = { ...item, title: item.title ?? prev?.title };
  return [next, ...list.filter((r) => r.key !== item.key)].slice(0, MAX_RECENT);
}

export function setRecentTitle(list: RecentItem[], key: string, title: string): RecentItem[] {
  return list.map((r) => (r.key === key && r.title !== title ? { ...r, title } : r));
}

/** Texto do cartão: título da live, ou o domínio do stream. */
export function recentLabel(r: RecentItem): string {
  if (r.title) return r.title;
  if (r.kind === 'youtube') return `Live do YouTube (${r.key})`;
  try {
    return new URL(r.input).hostname;
  } catch {
    return r.input;
  }
}
