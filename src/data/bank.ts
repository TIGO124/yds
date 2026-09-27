import type { Bolum, Konu, KonuNotu, Paragraf, Soru, Taksonomi } from '../types';
import konuNotlari from './konu_notlari.json';
import taksonomi from './konular.json';
import paragraflar from './paragraflar.json';
import type { SoruPaketi } from './paket';

const moduller = import.meta.glob<{ default: Soru[] }>('./sorular/*.json', { eager: true });

export const TAKSONOMI = taksonomi as Taksonomi;
export const KONULAR: Konu[] = TAKSONOMI.konular;
export const BOLUMLER: Bolum[] = TAKSONOMI.bolumler;
export const SORULAR: Soru[] = Object.values(moduller).flatMap((m) => m.default);

export const SORU_MAP = new Map(SORULAR.map((s) => [s.id, s]));
export const KONU_MAP = new Map(KONULAR.map((k) => [k.kod, k]));
export const BOLUM_MAP = new Map(BOLUMLER.map((b) => [b.kod, b]));
export const PARAGRAF_MAP = new Map((paragraflar as Paragraf[]).map((p) => [p.id, p.metin]));
/** Konu kartları (kısa konu anlatımı); indirilen paketle gelen yeni konularda olmayabilir. */
export const KONU_NOTLARI: Readonly<Record<string, KonuNotu>> = konuNotlari;

/** Sorunun ortak parçası (varsa). */
export const soruParagrafi = (s: Soru): string | null => (s.paragraf_id ? (PARAGRAF_MAP.get(s.paragraf_id) ?? null) : null);

export const konuAdi = (kod: string) => KONU_MAP.get(kod)?.ad ?? kod;
export const bolumAdi = (kod: string) => BOLUM_MAP.get(kod)?.ad ?? kod;

const tekKonuluBolumler = new Set<string>();
function tekKonuluHesapla() {
  tekKonuluBolumler.clear();
  for (const b of BOLUMLER) if (KONULAR.filter((k) => k.bolum === b.kod).length === 1) tekKonuluBolumler.add(b.kod);
}
tekKonuluHesapla();

/** Gömülü bankanın sürümü (derleme anında hesaplanır). */
export const BANKA_SURUMU: string = __BANKA_SURUMU__;
export const BANKA_TARIHI: number = __BANKA_TARIHI__;
export let etkinBankaSurumu = BANKA_SURUMU;

/**
 * İndirilen paketi bankaya yerinde işler: yeni soru/konu/parça eklenir, var olanlar güncellenir.
 * Diziler ve haritalar aynı nesneler kalır, bu yüzden onları tutan modüller güncel veriyi görür.
 * Eklenen yeni soru sayısını döndürür.
 */
export function paketUygula(p: SoruPaketi): number {
  for (const b of p.taksonomi.bolumler) {
    const eski = BOLUM_MAP.get(b.kod);
    if (eski) Object.assign(eski, b);
    else {
      BOLUMLER.push(b);
      BOLUM_MAP.set(b.kod, b);
    }
  }
  for (const k of p.taksonomi.konular) {
    const eski = KONU_MAP.get(k.kod);
    if (eski) Object.assign(eski, k);
    else {
      KONULAR.push(k);
      KONU_MAP.set(k.kod, k);
    }
  }
  for (const pr of p.paragraflar) PARAGRAF_MAP.set(pr.id, pr.metin);
  let yeni = 0;
  for (const s of p.sorular) {
    const eski = SORU_MAP.get(s.id);
    if (eski) Object.assign(eski, s);
    else {
      SORULAR.push(s);
      SORU_MAP.set(s.id, s);
      yeni++;
    }
  }
  tekKonuluHesapla();
  etkinBankaSurumu = p.surum;
  return yeni;
}

/** Örn. "Dilbilgisi · Zamanlar · Past Perfect Continuous". Tek konulu bölümlerde konu adı tekrar yazılmaz. */
export function soruEtiketi(s: Soru): string {
  const konu = tekKonuluBolumler.has(s.bolum) && KONU_MAP.get(s.konu)?.bolum === s.bolum ? '' : konuAdi(s.konu);
  return [bolumAdi(s.bolum), konu, s.alt_konu].filter(Boolean).join(' · ');
}
