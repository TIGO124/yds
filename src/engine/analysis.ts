import type { Bolum, Konu } from '../types';
import { konuAgirliklari, konuDurumlari, sayilanCevaplar, seviye, type CevapOzeti, type KonuDurumu, type Seviye } from './mastery';

export interface CevapBilgisi extends CevapOzeti {
  bolum: string;
  test_id: number;
}

export interface Oran {
  kod: string;
  dogru: number;
  toplam: number;
}

const yuzde = (x: number) => Math.round(x * 100);

/** Bir cevap listesindeki doğru/toplam, anahtara göre gruplu. */
export function oranlar(cevaplar: readonly CevapBilgisi[], anahtar: (c: CevapBilgisi) => string): Oran[] {
  const m = new Map<string, Oran>();
  for (const c of cevaplar) {
    const kod = anahtar(c);
    const o = m.get(kod) ?? { kod, dogru: 0, toplam: 0 };
    o.toplam++;
    if (c.dogru_mu) o.dogru++;
    m.set(kod, o);
  }
  return [...m.values()];
}

export interface KonuDegisimi {
  konu: string;
  eksiklikYuzde: number;
  oncekiYuzde: number;
  /** Eksiklik yönü: ↑ arttı (kötü), ↓ azaldı (iyi) */
  yon: '↑' | '↓' | '=';
  deneme: number;
}

/** Test sonrası genel konu durumu: güncel eksiklik ve bu testten önceki değere göre değişim. */
export function konuDegisimleri(
  konular: readonly Konu[],
  tumCevaplar: readonly CevapBilgisi[],
  testId: number,
): KonuDegisimi[] {
  const once = konuDurumlari(konular, tumCevaplar.filter((c) => c.test_id !== testId));
  const simdi = konuDurumlari(konular, tumCevaplar);
  return konular
    .map((k) => {
      const s = simdi.get(k.kod)!;
      const e = yuzde(s.eksiklik);
      const o = yuzde(once.get(k.kod)!.eksiklik);
      return { konu: k.kod, eksiklikYuzde: e, oncekiYuzde: o, yon: e > o ? '↑' : e < o ? '↓' : '=', deneme: s.deneme } as KonuDegisimi;
    })
    .filter((d) => d.deneme > 0)
    .sort((a, b) => b.eksiklikYuzde - a.eksiklikYuzde);
}

/** Bir sonraki uyarlanmış testin odaklanacağı en yüksek ağırlıklı konular. */
export function odakKonulari(konular: readonly Konu[], cevaplar: readonly CevapOzeti[], n = 3): Konu[] {
  const ag = konuAgirliklari(konular, konuDurumlari(konular, cevaplar));
  return [...konular].sort((a, b) => ag.get(b.kod)! - ag.get(a.kod)!).slice(0, n);
}

export interface KonuRaporu extends KonuDurumu {
  seviye: Seviye;
}

export interface SeviyeRaporu {
  genelYuzde: number;
  cozulen: number;
  bolumler: (Oran & { ad: string; yuzde: number })[];
  konular: KonuRaporu[];
  enZayif: Konu[];
}

export function seviyeRaporu(
  konular: readonly Konu[],
  bolumler: readonly Bolum[],
  tumCevaplar: readonly CevapBilgisi[],
): SeviyeRaporu {
  const cevaplar = sayilanCevaplar(tumCevaplar);
  const dogru = cevaplar.filter((c) => c.dogru_mu).length;
  const durumlar = konuDurumlari(konular, cevaplar);
  const bolumOran = new Map(oranlar(cevaplar, (c) => c.bolum).map((o) => [o.kod, o]));

  const konuRaporlari = konular
    .map((k) => ({ ...durumlar.get(k.kod)!, seviye: seviye(durumlar.get(k.kod)!) }))
    .sort((a, b) => b.eksiklik - a.eksiklik);
  const konuMap = new Map(konular.map((k) => [k.kod, k]));

  return {
    genelYuzde: cevaplar.length ? yuzde(dogru / cevaplar.length) : 0,
    cozulen: cevaplar.length,
    bolumler: bolumler
      .filter((b) => bolumOran.has(b.kod))
      .map((b) => {
        const o = bolumOran.get(b.kod)!;
        return { ...o, ad: b.ad, yuzde: yuzde(o.dogru / o.toplam) };
      }),
    konular: konuRaporlari,
    enZayif: konuRaporlari
      .filter((r) => r.deneme > 0)
      .slice(0, 3)
      .map((r) => konuMap.get(r.konu)!),
  };
}

/** Her bitmiş (tekrar olmayan) testten sonraki konu ustalıkları: konu → [test1, test2, ...] yüzdeleri. */
export function konuGecmisi(
  konular: readonly Konu[],
  tumCevaplar: readonly CevapBilgisi[],
  testIdleri: readonly number[],
): Map<string, number[]> {
  const cevaplar = sayilanCevaplar(tumCevaplar);
  const gecmis = new Map<string, number[]>(konular.map((k) => [k.kod, []]));
  const dahil = new Set<number>();
  for (const id of testIdleri) {
    dahil.add(id);
    const d = konuDurumlari(konular, cevaplar.filter((c) => dahil.has(c.test_id)));
    for (const k of konular) gecmis.get(k.kod)!.push(yuzde(d.get(k.kod)!.ustalik));
  }
  return gecmis;
}
