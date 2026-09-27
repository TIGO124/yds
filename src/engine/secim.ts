import type { Soru } from '../types';
import { rastgeleSec, type Rng } from './rng';

/** Konu → çözülmemiş sorular. */
export function havuzOlustur(sorular: readonly Soru[], cozulmus: ReadonlySet<string>): Map<string, Soru[]> {
  const havuz = new Map<string, Soru[]>();
  for (const s of sorular) {
    if (cozulmus.has(s.id)) continue;
    const dizi = havuz.get(s.konu);
    if (dizi) dizi.push(s);
    else havuz.set(s.konu, [s]);
  }
  return havuz;
}

function uzaklik(zorluk: number, hedef: readonly number[]): number {
  return Math.min(...hedef.map((h) => Math.abs(h - zorluk)));
}

/**
 * Hedef zorluklardan rastgele bir soru seçer; yoksa en yakın (komşu) zorluğa geçer.
 * Seçilen soru havuzdan çıkarılır. Havuz boşsa null.
 */
export function soruCek(havuz: Soru[], hedef: readonly number[], rng: Rng): Soru | null {
  if (havuz.length === 0) return null;
  const enYakin = Math.min(...havuz.map((s) => uzaklik(s.zorluk, hedef)));
  const adaylar = havuz.filter((s) => uzaklik(s.zorluk, hedef) === enYakin);
  const secilen = rastgeleSec(adaylar, rng);
  havuz.splice(havuz.indexOf(secilen), 1);
  return secilen;
}
