import type { Soru } from '../types';
import { karistir, type Rng } from './rng';

/** Gerçek YDS düzeni: 80 soru, bölümler sınavdaki sırayla. */
export const DENEME_DAGILIMI: readonly { bolum: string; adet: number }[] = [
  { bolum: 'kel', adet: 6 },
  { bolum: 'gr', adet: 10 },
  { bolum: 'cloze', adet: 10 },
  { bolum: 'tamamlama', adet: 10 },
  { bolum: 'ceviri_et', adet: 3 },
  { bolum: 'ceviri_te', adet: 3 },
  { bolum: 'okuma', adet: 20 },
  { bolum: 'diyalog', adet: 5 },
  { bolum: 'yakin_anlam', adet: 4 },
  { bolum: 'paragraf', adet: 4 },
  { bolum: 'bozan', adet: 5 },
];

export const DENEME_SORU = DENEME_DAGILIMI.reduce((t, b) => t + b.adet, 0);
export const DENEME_DAKIKA = 180;

export interface DenemeUretimi {
  soru_idleri: string[];
  /** Yeni sorusu yetmeyen bölümler */
  eksik: { bolum: string; istenen: number; bulunan: number }[];
}

/** Ortak parçalı soruları grup olarak, diğerlerini konulara yayarak seçer. */
function bolumSec(havuz: Soru[], adet: number, rng: Rng): Soru[] {
  const gruplar = new Map<string, Soru[]>();
  const tekler: Soru[] = [];
  for (const s of havuz) {
    if (s.paragraf_id) {
      const g = gruplar.get(s.paragraf_id);
      if (g) g.push(s);
      else gruplar.set(s.paragraf_id, [s]);
    } else tekler.push(s);
  }

  const secilen: Soru[] = [];
  if (gruplar.size > 0) {
    // Önce tam gruplar (en çok sorusu kalan parçalar), parça içinde yazım sırası korunur.
    const siraliGruplar = karistir([...gruplar.values()], rng).sort((a, b) => b.length - a.length);
    for (const g of siraliGruplar) {
      if (secilen.length >= adet) break;
      g.sort((a, b) => a.id.localeCompare(b.id));
      secilen.push(...g.slice(0, adet - secilen.length));
    }
  }

  // Tekil sorular: konular arasında sırayla dağıt (aynı konu art arda yığılmasın).
  const konular = new Map<string, Soru[]>();
  for (const s of karistir(tekler, rng)) {
    const k = konular.get(s.konu);
    if (k) k.push(s);
    else konular.set(s.konu, [s]);
  }
  const konuSirasi = karistir([...konular.values()], rng);
  let bosTur = false;
  while (secilen.length < adet && !bosTur) {
    bosTur = true;
    for (const k of konuSirasi) {
      if (secilen.length >= adet) break;
      const s = k.pop();
      if (s) {
        secilen.push(s);
        bosTur = false;
      }
    }
  }
  return secilen;
}

export function denemeOlustur(sorular: readonly Soru[], cozulmus: ReadonlySet<string>, rng: Rng): DenemeUretimi {
  const soru_idleri: string[] = [];
  const eksik: DenemeUretimi['eksik'] = [];
  for (const { bolum, adet } of DENEME_DAGILIMI) {
    const havuz = sorular.filter((s) => s.bolum === bolum && !cozulmus.has(s.id));
    const secilen = bolumSec(havuz, adet, rng);
    if (secilen.length < adet) eksik.push({ bolum, istenen: adet, bulunan: secilen.length });
    // Bölüm içinde ortak parçalar bitişik kalsın: gruplar birlikte, sonra karıştırılmış tekler.
    soru_idleri.push(...secilen.map((s) => s.id));
  }
  return { soru_idleri, eksik };
}

/** ÖSYM usulü: her doğru 100/80 = 1,25 puan, yanlış doğruyu götürmez. */
export function ydsPuani(dogru: number, toplam: number): number {
  if (toplam <= 0) return 0;
  return Math.round((dogru / toplam) * 100 * 100) / 100;
}

export function ydsSeviyesi(puan: number): string {
  if (puan >= 90) return 'A';
  if (puan >= 80) return 'B';
  if (puan >= 70) return 'C';
  if (puan >= 60) return 'D';
  if (puan >= 50) return 'E';
  return '—';
}
