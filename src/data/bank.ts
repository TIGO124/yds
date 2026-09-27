import type { Bolum, Konu, Paragraf, Soru, Taksonomi } from '../types';
import taksonomi from './konular.json';
import paragraflar from './paragraflar.json';

const moduller = import.meta.glob<{ default: Soru[] }>('./sorular/*.json', { eager: true });

export const TAKSONOMI = taksonomi as Taksonomi;
export const KONULAR: Konu[] = TAKSONOMI.konular;
export const BOLUMLER: Bolum[] = TAKSONOMI.bolumler;
export const SORULAR: Soru[] = Object.values(moduller).flatMap((m) => m.default);

export const SORU_MAP = new Map(SORULAR.map((s) => [s.id, s]));
export const KONU_MAP = new Map(KONULAR.map((k) => [k.kod, k]));
export const BOLUM_MAP = new Map(BOLUMLER.map((b) => [b.kod, b]));
export const PARAGRAF_MAP = new Map((paragraflar as Paragraf[]).map((p) => [p.id, p.metin]));

/** Sorunun ortak parçası (varsa). */
export const soruParagrafi = (s: Soru): string | null => (s.paragraf_id ? (PARAGRAF_MAP.get(s.paragraf_id) ?? null) : null);

export const konuAdi = (kod: string) => KONU_MAP.get(kod)?.ad ?? kod;
export const bolumAdi = (kod: string) => BOLUM_MAP.get(kod)?.ad ?? kod;

const tekKonuluBolumler = new Set(
  BOLUMLER.filter((b) => KONULAR.filter((k) => k.bolum === b.kod).length === 1).map((b) => b.kod),
);

/** Örn. "Dilbilgisi · Zamanlar · Past Perfect Continuous". Tek konulu bölümlerde konu adı tekrar yazılmaz. */
export function soruEtiketi(s: Soru): string {
  const konu = tekKonuluBolumler.has(s.bolum) && KONU_MAP.get(s.konu)?.bolum === s.bolum ? '' : konuAdi(s.konu);
  return [bolumAdi(s.bolum), konu, s.alt_konu].filter(Boolean).join(' · ');
}
