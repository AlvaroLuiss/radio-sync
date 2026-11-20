/** Extrai o ID de 11 caracteres de um link do YouTube (watch, youtu.be, /live/, /embed/, /shorts/). */
export function parseYouTubeId(input: string): string | null {
  const s = (input || '').trim();
  if (/^[\w-]{11}$/.test(s)) return s;
  try {
    const u = new URL(s);
    if (u.hostname.includes('youtu.be')) return u.pathname.slice(1, 12) || null;
    const v = u.searchParams.get('v');
    if (v) return v;
    const m = u.pathname.match(/\/(live|embed|shorts)\/([\w-]{11})/);
    if (m) return m[2];
  } catch {
    // não é URL
  }
  return null;
}

let apiPromise: Promise<typeof YT> | null = null;

/** Carrega a IFrame Player API uma única vez. */
export function loadYouTubeApi(): Promise<typeof YT> {
  if (typeof window === 'undefined') return Promise.reject(new Error('SSR'));
  if (window.YT?.Player) return Promise.resolve(window.YT);
  if (apiPromise) return apiPromise;
  apiPromise = new Promise((resolve) => {
    const prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      prev?.();
      resolve(window.YT);
    };
    const tag = document.createElement('script');
    tag.src = 'https://www.youtube.com/iframe_api';
    document.head.appendChild(tag);
  });
  return apiPromise;
}

export const YT_ERRORS: Record<number, string> = {
  2: 'Link inválido.',
  5: 'Erro no player. Recarregue a página.',
  100: 'Vídeo não encontrado ou privado.',
  101: 'Essa live não permite tocar fora do YouTube. Tente outra transmissão da rádio.',
  150: 'Essa live não permite tocar fora do YouTube. Tente outra transmissão da rádio.',
};

declare global {
  interface Window {
    onYouTubeIframeAPIReady?: () => void;
  }
}
