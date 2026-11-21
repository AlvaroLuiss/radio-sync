import { describe, expect, it } from 'vitest';
import { pushRecent, recentLabel, RecentItem, setRecentTitle } from '@/lib/recent';

const yt = (id: string, title?: string): RecentItem => ({
  key: id,
  input: `https://youtu.be/${id}`,
  kind: 'youtube',
  title,
});
const GAUCHA: RecentItem = {
  key: 'hls:https://liverdgaupoa.rbsdirect.com.br/primary/gaucha_rbs.sdp/playlist.m3u8',
  input: 'https://liverdgaupoa.rbsdirect.com.br/primary/gaucha_rbs.sdp/playlist.m3u8',
  kind: 'hls',
};

describe('links recentes', () => {
  it('guarda só os 3 últimos, do mais recente para o mais antigo', () => {
    const list = ['aaaaaaaaaaa', 'bbbbbbbbbbb', 'ccccccccccc', 'ddddddddddd'].reduce<RecentItem[]>(
      (l, id) => pushRecent(l, yt(id)),
      [],
    );
    expect(list.map((r) => r.key)).toEqual(['ddddddddddd', 'ccccccccccc', 'bbbbbbbbbbb']);
  });

  it('usar de novo leva para o topo sem duplicar e mantém o título', () => {
    let list = pushRecent([], yt('aaaaaaaaaaa', 'Gre-Nal ao vivo'));
    list = pushRecent(list, GAUCHA);
    list = pushRecent(list, yt('aaaaaaaaaaa'));
    expect(list).toHaveLength(2);
    expect(list[0]).toMatchObject({ key: 'aaaaaaaaaaa', title: 'Gre-Nal ao vivo' });
  });

  it('atualiza o título quando o player informa', () => {
    const list = setRecentTitle([yt('aaaaaaaaaaa'), GAUCHA], 'aaaaaaaaaaa', 'Rádio Guaíba AO VIVO');
    expect(list[0].title).toBe('Rádio Guaíba AO VIVO');
    expect(list[1]).toBe(GAUCHA);
  });

  it('rótulo: título, ou domínio do stream, ou ID da live', () => {
    expect(recentLabel(yt('aaaaaaaaaaa', 'Gre-Nal'))).toBe('Gre-Nal');
    expect(recentLabel(GAUCHA)).toBe('liverdgaupoa.rbsdirect.com.br');
    expect(recentLabel(yt('aaaaaaaaaaa'))).toBe('Live do YouTube (aaaaaaaaaaa)');
  });
});
