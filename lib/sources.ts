/**
 * Reconhece o link colado: live do YouTube ou stream HLS (.m3u8) de rádio web.
 * `key` identifica a fonte no localStorage (`delay:<key>`); para o YouTube continua sendo o ID,
 * compatível com os atrasos salvos antes.
 */
import { parseYouTubeId } from './youtube';

export type Source =
  | { kind: 'youtube'; id: string; key: string }
  | { kind: 'hls'; url: string; key: string };

export type ParseResult = { source: Source } | { error: string };

function toUrl(s: string): URL | null {
  try {
    return new URL(s);
  } catch {
    return null;
  }
}

export function parseSource(input: string): ParseResult {
  const s = (input || '').trim();
  const u = toUrl(s);

  // Antes do YouTube: parseYouTubeId aceita qualquer link com ?v=.
  if (u?.pathname.toLowerCase().endsWith('.m3u8')) {
    // O app publicado é HTTPS e o navegador bloqueia áudio http:// dentro dele.
    if (u.protocol !== 'https:') return { error: 'O stream precisa começar com https://.' };
    return { source: { kind: 'hls', url: u.href, key: `hls:${u.href}` } };
  }

  const id = parseYouTubeId(s);
  if (id) return { source: { kind: 'youtube', id, key: id } };

  if (!u) return { error: 'Não reconheci esse link. Cole uma live do YouTube ou um stream .m3u8.' };
  return {
    error: 'Por enquanto só funcionam lives do YouTube e streams HLS (.m3u8). Link de página de rádio ou .mp3/.aac ainda não.',
  };
}
