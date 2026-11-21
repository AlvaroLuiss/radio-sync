/**
 * Junta as calibrações por lance de uma sessão.
 *
 * Cada lance dá uma estimativa absoluta do atraso ideal (atraso atual + diferença TV − rádio).
 * Usamos a mediana das estimativas recentes, então um toque errado não estraga o ajuste.
 * Estimativas antigas expiram: a TV pode ter mudado de atraso (ex.: o app de streaming reabriu).
 */
import { median, round1 } from './stats';

const MAX_SAMPLES = 5;

export class CalibrationSamples {
  private samples: { target: number; at: number }[] = [];

  constructor(private readonly windowS = 15 * 60) {}

  /** `at` em segundos. Retorna o atraso estimado e quantos lances entraram na conta. */
  add(target: number, at: number): { estimate: number; count: number } {
    this.samples = [...this.samples.filter((s) => at - s.at <= this.windowS), { target, at }].slice(-MAX_SAMPLES);
    return { estimate: round1(median(this.samples.map((s) => s.target))), count: this.samples.length };
  }

  clear() {
    this.samples = [];
  }
}
