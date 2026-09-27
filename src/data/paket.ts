import type { Konu, Paragraf, Soru, Taksonomi } from '../types';

/** İnternetten indirilen soru paketi (scripts/soru-paketi.mjs üretir). */
export interface SoruPaketi {
  surum: string;
  tarih: number;
  taksonomi: Taksonomi;
  paragraflar: Paragraf[];
  sorular: Soru[];
}

const metin = (x: unknown): x is string => typeof x === 'string' && x.trim().length > 0;

/**
 * Dışarıdan gelen paketi doğrular (sistem sınırı). Bozuk sorular atılır; biçimi hiç
 * tutmayan paket için null döner.
 */
export function paketDogrula(veri: unknown): SoruPaketi | null {
  if (!veri || typeof veri !== 'object') return null;
  const v = veri as Record<string, unknown>;
  const t = v.taksonomi as Taksonomi | undefined;
  if (!metin(v.surum) || typeof v.tarih !== 'number') return null;
  if (!t || !Array.isArray(t.bolumler) || !Array.isArray(t.konular)) return null;
  if (!Array.isArray(v.sorular) || !Array.isArray(v.paragraflar)) return null;

  const konular: Konu[] = t.konular.filter(
    (k) => k && metin(k.kod) && metin(k.ad) && metin(k.bolum) && typeof k.sinav_agirligi === 'number' && typeof k.oneri === 'string',
  );
  const bolumler = t.bolumler.filter((b) => b && metin(b.kod) && metin(b.ad));
  const bolumKodlari = new Set(bolumler.map((b) => b.kod));
  const konuKodlari = new Set(konular.map((k) => k.kod));
  const paragraflar = (v.paragraflar as Paragraf[]).filter((p) => p && metin(p.id) && metin(p.metin));
  const paragrafIdleri = new Set(paragraflar.map((p) => p.id));

  const sorular = (v.sorular as Soru[]).filter(
    (s) =>
      s &&
      metin(s.id) &&
      bolumKodlari.has(s.bolum) &&
      konuKodlari.has(s.konu) &&
      typeof s.alt_konu === 'string' &&
      [1, 2, 3].includes(s.zorluk) &&
      metin(s.soru) &&
      Array.isArray(s.secenekler) &&
      s.secenekler.length === 5 &&
      s.secenekler.every(metin) &&
      Number.isInteger(s.dogru) &&
      s.dogru >= 0 &&
      s.dogru <= 4 &&
      typeof s.aciklama === 'string' &&
      (s.paragraf_id === null || paragrafIdleri.has(s.paragraf_id)),
  );

  return { surum: v.surum, tarih: v.tarih, taksonomi: { bolumler, konular }, paragraflar, sorular };
}
