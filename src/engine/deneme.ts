import type { Soru } from '../types';
import { karistir, type Rng } from './rng';
import { eskiAdaylar, type EskiSorular } from './secim';

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
  /** Yeni ve eski sorular birlikte yetmeyen bölümler */
  eksik: { bolum: string; istenen: number; bulunan: number }[];
  /** Yeni soru yetmediği için daha önce çözülmüşlerden gelen soru sayısı */
  yeniden: number;
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

/**
 * Yeni soru yetmeyince eski sorular: ortak parçalı sorular parçasıyla birlikte, en uzun süredir
 * görülmeyen parça ya da soru önce gelir.
 */
function eskiSec(havuz: readonly Soru[], adet: number, eski: EskiSorular, rng: Rng): Soru[] {
  const birimler = new Map<string, Soru[]>();
  for (const s of eskiAdaylar(havuz, eski)) {
    const anahtar = s.paragraf_id ?? `#${s.id}`;
    const b = birimler.get(anahtar);
    if (b) b.push(s);
    else birimler.set(anahtar, [s]);
  }
  const yas = (b: Soru[]) => Math.max(...b.map((s) => eski.sonGorulme.get(s.id) ?? 0));
  const sirali = karistir([...birimler.values()], rng).sort((a, b) => yas(a) - yas(b));
  const secilen: Soru[] = [];
  for (const b of sirali) {
    if (secilen.length >= adet) break;
    secilen.push(...b.sort((x, y) => x.id.localeCompare(y.id)).slice(0, adet - secilen.length));
  }
  return secilen;
}

/** Aynı parçayı paylaşan sorular ilk göründükleri yerde bitişik dizilir. */
function bitisikSirala(sorular: readonly Soru[]): Soru[] {
  const sonuc: Soru[] = [];
  const eklenen = new Set<string>();
  for (const s of sorular) {
    if (eklenen.has(s.id)) continue;
    const grup = s.paragraf_id ? sorular.filter((x) => x.paragraf_id === s.paragraf_id) : [s];
    for (const g of grup.sort((a, b) => a.id.localeCompare(b.id))) {
      sonuc.push(g);
      eklenen.add(g.id);
    }
  }
  return sonuc;
}

export function denemeOlustur(sorular: readonly Soru[], cozulmus: ReadonlySet<string>, rng: Rng, eski?: EskiSorular): DenemeUretimi {
  const soru_idleri: string[] = [];
  const eksik: DenemeUretimi['eksik'] = [];
  let yeniden = 0;
  for (const { bolum, adet } of DENEME_DAGILIMI) {
    const bolumSorulari = sorular.filter((s) => s.bolum === bolum);
    const secilen = bolumSec(
      bolumSorulari.filter((s) => !cozulmus.has(s.id)),
      adet,
      rng,
    );
    if (secilen.length < adet && eski) {
      const ek = eskiSec(bolumSorulari.filter((s) => cozulmus.has(s.id)), adet - secilen.length, eski, rng);
      yeniden += ek.length;
      secilen.push(...ek);
    }
    if (secilen.length < adet) eksik.push({ bolum, istenen: adet, bulunan: secilen.length });
    // Bölüm içinde ortak parçalar bitişik kalsın: gruplar birlikte, sonra karıştırılmış tekler.
    soru_idleri.push(...bitisikSirala(secilen).map((s) => s.id));
  }
  return { soru_idleri, eksik, yeniden };
}

/** Deneme için yeni soru yetmeyen bölümlerdeki açık: kaç soru eski sorulardan gelecek. */
export function denemeYeniSoruAcigi(sorular: readonly Soru[], cozulmus: ReadonlySet<string>): number {
  return DENEME_DAGILIMI.reduce((t, { bolum, adet }) => {
    const yeni = sorular.filter((s) => s.bolum === bolum && !cozulmus.has(s.id)).length;
    return t + Math.max(0, adet - yeni);
  }, 0);
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
