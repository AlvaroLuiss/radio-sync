import { describe, expect, it } from 'vitest';
import { parseSource } from '@/lib/sources';

const GAUCHA = 'https://liverdgaupoa.rbsdirect.com.br/primary/gaucha_rbs.sdp/playlist.m3u8';

describe('parseSource', () => {
  it('reconhece live do YouTube e mantém o ID como chave', () => {
    expect(parseSource('https://www.youtube.com/watch?v=4ukVvs_e5Kk')).toEqual({
      source: { kind: 'youtube', id: '4ukVvs_e5Kk', key: '4ukVvs_e5Kk' },
    });
  });

  it('reconhece stream HLS https', () => {
    expect(parseSource(`  ${GAUCHA} `)).toEqual({ source: { kind: 'hls', url: GAUCHA, key: `hls:${GAUCHA}` } });
  });

  it('aceita .m3u8 com query string', () => {
    const r = parseSource('https://x.com/live/radio.M3U8?token=1');
    expect('source' in r && r.source.kind).toBe('hls');
  });

  it('stream com ?v= não é confundido com YouTube', () => {
    const r = parseSource('https://x.com/radio.m3u8?v=abcdefghijk');
    expect('source' in r && r.source.kind).toBe('hls');
  });

  it('recusa stream http://', () => {
    expect(parseSource('http://x.com/radio.m3u8')).toEqual({ error: expect.stringContaining('https://') });
  });

  it('recusa página de rádio e .mp3 com mensagem explicando', () => {
    for (const s of ['https://radiosaovivo.net/gaucha/', 'https://x.com/stream.mp3']) {
      expect(parseSource(s)).toEqual({ error: expect.stringContaining('.m3u8') });
    }
  });

  it('recusa texto que não é link', () => {
    expect(parseSource('gaucha')).toEqual({ error: expect.stringContaining('Não reconheci') });
  });
});
