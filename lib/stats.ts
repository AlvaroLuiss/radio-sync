/** Arredonda para 0,1 s, a mesma precisão do motor de sincronização. */
export const round1 = (n: number) => Math.round(n * 10) / 10;

/** Mediana; ignora um valor fora da curva (ex.: um toque errado na calibração). */
export function median(values: number[]): number {
  if (values.length === 0) throw new Error('median de lista vazia');
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}
