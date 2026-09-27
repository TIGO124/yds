import type { Soru } from '../types';
import { CONFIG } from './config';
import { rastgeleSec, type Rng } from './rng';

/** Yeni sorular bitince eski soruları yeniden kullanmak için gereken bilgi. */
export interface EskiSorular {
  /** Soru → en son cevaplandığı an (ms) */
  sonGorulme: ReadonlyMap<string, number>;
  /** Yeniden kullanılmayacak sorular (ör. aralıklı tekrarda olanlar) */
  haric: ReadonlySet<string>;
  simdi: number;
}

/** Soru → en son cevaplandığı an. */
export function sonGorulmeler(cevaplar: readonly { soru_id: string; tarih: number }[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const c of cevaplar) m.set(c.soru_id, Math.max(m.get(c.soru_id) ?? 0, c.tarih));
  return m;
}

/**
 * Yeniden kullanılabilecek çözülmüş sorular: son YENIDEN_MIN_GUN içinde görülmemiş ve hariç tutulmamış,
 * en uzun süredir görülmeyen önce.
 */
export function eskiAdaylar(sorular: readonly Soru[], eski: EskiSorular): Soru[] {
  const sinir = eski.simdi - CONFIG.YENIDEN_MIN_GUN * 86_400_000;
  const an = (s: Soru) => eski.sonGorulme.get(s.id) ?? 0;
  return sorular.filter((s) => eski.sonGorulme.has(s.id) && !eski.haric.has(s.id) && an(s) <= sinir).sort((a, b) => an(a) - an(b));
}

/**
 * Konu → çözülmemiş sorular. Eski bilgisi verilirse yeni sorusu kalmayan konuda, en uzun süredir
 * görülmeyen çözülmüş soruların eski yarısı (en az YENIDEN_MIN_ADAY) havuza girer.
 */
export function havuzOlustur(sorular: readonly Soru[], cozulmus: ReadonlySet<string>, eski?: EskiSorular): Map<string, Soru[]> {
  const havuz = new Map<string, Soru[]>();
  const cozulenler = new Map<string, Soru[]>();
  for (const s of sorular) {
    const hedef = !cozulmus.has(s.id) ? havuz : eski ? cozulenler : null;
    if (!hedef) continue;
    const dizi = hedef.get(s.konu);
    if (dizi) dizi.push(s);
    else hedef.set(s.konu, [s]);
  }
  if (eski) {
    for (const [konu, liste] of cozulenler) {
      if (havuz.get(konu)?.length) continue;
      const adaylar = eskiAdaylar(liste, eski);
      if (adaylar.length) havuz.set(konu, adaylar.slice(0, Math.max(CONFIG.YENIDEN_MIN_ADAY, Math.ceil(adaylar.length / 2))));
    }
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
