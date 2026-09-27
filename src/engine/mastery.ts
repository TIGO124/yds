import { CONFIG } from './config';
import type { Konu, TestTipi } from '../types';

/** Ustalık hesabı için gereken en küçük cevap bilgisi (kronolojik sırada verilir). */
export interface CevapOzeti {
  konu: string;
  dogru_mu: boolean;
  test_tipi?: TestTipi;
}

export interface KonuDurumu {
  konu: string;
  ustalik: number;
  eksiklik: number;
  deneme: number;
  dogru: number;
}

export type Seviye = 'zayif' | 'gelisiyor' | 'iyi' | 'yetersiz';

/** Tekrar testleri konu puanlarını etkilemez. */
export function sayilanCevaplar<T extends CevapOzeti>(cevaplar: readonly T[]): T[] {
  return cevaplar.filter((c) => c.test_tipi !== 'tekrar');
}

/**
 * ustalik(k) = (Σ w·dogru + 1) / (Σ w + 2), w = 0.9^(sonraki cevap sayısı)
 * En yeni cevabın ağırlığı 1'dir, geriye gidildikçe azalır.
 */
export function konuDurumlari(konular: readonly Konu[], cevaplar: readonly CevapOzeti[]): Map<string, KonuDurumu> {
  const gruplar = new Map<string, boolean[]>();
  for (const k of konular) gruplar.set(k.kod, []);
  for (const c of sayilanCevaplar(cevaplar)) gruplar.get(c.konu)?.push(c.dogru_mu);

  const sonuc = new Map<string, KonuDurumu>();
  for (const [konu, dizi] of gruplar) {
    let sw = 0;
    let swd = 0;
    let dogru = 0;
    const n = dizi.length;
    for (let i = 0; i < n; i++) {
      const w = CONFIG.AGIRLIK_SONUMLEME ** (n - 1 - i);
      sw += w;
      if (dizi[i]) {
        swd += w;
        dogru++;
      }
    }
    const ustalik = (swd + 1) / (sw + 2);
    sonuc.set(konu, { konu, ustalik, eksiklik: 1 - ustalik, deneme: n, dogru });
  }
  return sonuc;
}

/** agirlik(k) = eksiklik^1.5 × (0.5 + sinav_agirligi) + belirsizlik payı + taban */
export function konuAgirligi(durum: KonuDurumu, konu: Konu): number {
  return (
    durum.eksiklik ** CONFIG.EKSIKLIK_US * (0.5 + konu.sinav_agirligi) +
    (durum.deneme < CONFIG.BELIRSIZLIK_ESIK ? CONFIG.BELIRSIZLIK_PAYI : 0) +
    CONFIG.TABAN_AGIRLIK
  );
}

export function konuAgirliklari(konular: readonly Konu[], durumlar: Map<string, KonuDurumu>): Map<string, number> {
  const m = new Map<string, number>();
  for (const k of konular) m.set(k.kod, konuAgirligi(durumlar.get(k.kod)!, k));
  return m;
}

export function seviye(durum: KonuDurumu): Seviye {
  if (durum.deneme < CONFIG.YETERSIZ_VERI_ESIK) return 'yetersiz';
  if (durum.ustalik < CONFIG.USTALIK_ZAYIF) return 'zayif';
  if (durum.ustalik <= CONFIG.USTALIK_IYI) return 'gelisiyor';
  return 'iyi';
}

/** Ustalığa göre hedef zorluk aralığı. */
export function hedefZorluklar(ustalik: number): number[] {
  if (ustalik < CONFIG.USTALIK_ZAYIF) return [1, 2];
  if (ustalik <= CONFIG.USTALIK_IYI) return [2];
  return [2, 3];
}
