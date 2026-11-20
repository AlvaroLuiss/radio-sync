import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Rádio Sync',
    short_name: 'Rádio Sync',
    description: 'Sincronize a rádio com o jogo na TV.',
    start_url: '/',
    display: 'standalone',
    background_color: '#0c110e',
    theme_color: '#0c110e',
    lang: 'pt-BR',
  };
}
