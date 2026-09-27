/**
 * Soru başına süre analizi. Hedefler gerçek sınav temposuna göre önerilen sürelerdir:
 * 80 soruluk denemede toplam ≈ 139 dakika eder; kalan süre gözden geçirme ve optik form içindir.
 */
export const HEDEF_SANIYE: Readonly<Record<string, number>> = {
  kel: 60,
  gr: 60,
  cloze: 75,
  tamamlama: 90,
  ceviri_et: 120,
  ceviri_te: 120,
  okuma: 150,
  diyalog: 90,
  yakin_anlam: 120,
  paragraf: 120,
  bozan: 120,
};

export type Tempo = 'uygun' | 'sinirda' | 'yavas';

/** Süre analizi için gereken en küçük cevap bilgisi. */
export interface SureliCevap {
  soru_id: string;
  bolum: string;
  secilen: number | null;
  dogru_mu: boolean;
  sure_ms: number;
}

export interface BolumSuresi {
  bolum: string;
  /** Süresi ölçülen soru sayısı */
  adet: number;
  ortalamaMs: number;
  hedefMs: number | null;
  tempo: Tempo | null;
}

export const hedefMs = (bolum: string): number | null => (HEDEF_SANIYE[bolum] ? HEDEF_SANIYE[bolum] * 1000 : null);

/** Hiç açılmamış soruların süresi 0'dır; ortalamalara katılmaz. */
const olculen = <T extends SureliCevap>(cevaplar: readonly T[]) => cevaplar.filter((c) => c.sure_ms > 0);

export function tempo(ortalamaMs: number, hedef: number): Tempo {
  const oran = ortalamaMs / hedef;
  return oran <= 1 ? 'uygun' : oran <= 1.3 ? 'sinirda' : 'yavas';
}

const SINAV_SIRASI = Object.keys(HEDEF_SANIYE);
const sinavSirasi = (bolum: string) => (SINAV_SIRASI.indexOf(bolum) + 1 || SINAV_SIRASI.length + 1);

/** Bölüm başına ortalama süre ve hedefe göre tempo; bölümler sınavdaki sırayla. */
export function bolumSureleri(cevaplar: readonly SureliCevap[]): BolumSuresi[] {
  const m = new Map<string, { adet: number; toplam: number }>();
  for (const c of olculen(cevaplar)) {
    const b = m.get(c.bolum) ?? { adet: 0, toplam: 0 };
    b.adet++;
    b.toplam += c.sure_ms;
    m.set(c.bolum, b);
  }
  return [...m]
    .sort(([a], [b]) => sinavSirasi(a) - sinavSirasi(b))
    .map(([bolum, { adet, toplam }]) => {
      const ortalamaMs = toplam / adet;
      const h = hedefMs(bolum);
      return { bolum, adet, ortalamaMs, hedefMs: h, tempo: h ? tempo(ortalamaMs, h) : null };
    });
}

/** En uzun düşünülen sorular (uzundan kısaya). */
export function enUzunlar<T extends SureliCevap>(cevaplar: readonly T[], n = 3): T[] {
  return [...olculen(cevaplar)].sort((a, b) => b.sure_ms - a.sure_ms).slice(0, n);
}

/** "Aceleyle yanlış" sınırı: bölüm hedefinin %30'u, 10–30 saniye arasında. */
export function hizEsigiMs(bolum: string): number {
  const h = HEDEF_SANIYE[bolum] ?? 60;
  return Math.min(30, Math.max(10, h * 0.3)) * 1000;
}

/** Çok kısa sürede işaretlenip yanlış çıkan sorular (boşlar sayılmaz). */
export function hizliYanlislar<T extends SureliCevap>(cevaplar: readonly T[]): T[] {
  return olculen(cevaplar).filter((c) => c.secilen !== null && !c.dogru_mu && c.sure_ms < hizEsigiMs(c.bolum));
}

/** 84_000 → "1:24" */
export function dakikaSaniye(ms: number): string {
  const s = Math.round(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
