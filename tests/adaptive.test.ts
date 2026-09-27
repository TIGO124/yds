import { describe, expect, it } from 'vitest';
import { kontrolTestOlustur, siradakiTest, uyarlanmisTestOlustur, yanlisSoruIdleri } from '../src/engine/adaptive';
import { CONFIG } from '../src/engine/config';
import { teshisPlaniOlustur } from '../src/engine/diagnostic';
import { hedefZorluklar, konuAgirligi, konuDurumlari, seviye, type CevapOzeti } from '../src/engine/mastery';
import { mulberry32 } from '../src/engine/rng';
import { KONULAR, SORULAR } from '../src/data/bank';
import { sahteKonular, sahteSorular, say } from './helpers';

const soruMap = new Map(SORULAR.map((s) => [s.id, s]));

describe('ustalık / eksiklik', () => {
  const konular = sahteKonular({ gr: ['a'] });

  it('veri yokken ustalık 0.5, tek doğru cevapta 2/3', () => {
    expect(konuDurumlari(konular, []).get('a')!.ustalik).toBe(0.5);
    expect(konuDurumlari(konular, [{ konu: 'a', dogru_mu: true }]).get('a')!.ustalik).toBeCloseTo(2 / 3);
  });

  it('yeni cevaplar eskilerden daha etkili (0.9 sönümleme)', () => {
    const eskiYanlis: CevapOzeti[] = [{ konu: 'a', dogru_mu: false }, { konu: 'a', dogru_mu: true }];
    const yeniYanlis: CevapOzeti[] = [{ konu: 'a', dogru_mu: true }, { konu: 'a', dogru_mu: false }];
    const u1 = konuDurumlari(konular, eskiYanlis).get('a')!.ustalik;
    const u2 = konuDurumlari(konular, yeniYanlis).get('a')!.ustalik;
    expect(u1).toBeGreaterThan(u2);
    // (1 + 1) / (0.9 + 1 + 2)
    expect(u1).toBeCloseTo(2 / 3.9);
  });

  it('tekrar testi cevapları puanı etkilemez', () => {
    const d = konuDurumlari(konular, [{ konu: 'a', dogru_mu: false, test_tipi: 'tekrar' }]).get('a')!;
    expect(d.deneme).toBe(0);
    expect(d.ustalik).toBe(0.5);
  });

  it('ağırlık: az denenmiş konuya belirsizlik payı, taban 0.03', () => {
    const k = konular[0];
    const d = konuDurumlari(konular, []).get('a')!;
    expect(konuAgirligi(d, k)).toBeCloseTo(0.5 ** 1.5 * 1.0 + 0.3 + 0.03);
  });

  it('seviye etiketleri ve hedef zorluk', () => {
    const iyi = konuDurumlari(konular, Array(10).fill({ konu: 'a', dogru_mu: true })).get('a')!;
    const zayif = konuDurumlari(konular, Array(10).fill({ konu: 'a', dogru_mu: false })).get('a')!;
    expect(seviye(iyi)).toBe('iyi');
    expect(seviye(zayif)).toBe('zayif');
    expect(seviye(konuDurumlari(konular, [{ konu: 'a', dogru_mu: true }]).get('a')!)).toBe('yetersiz');
    expect(hedefZorluklar(0.3)).toEqual([1, 2]);
    expect(hedefZorluklar(0.6)).toEqual([2]);
    expect(hedefZorluklar(0.9)).toEqual([2, 3]);
  });
});

describe('teşhis planı (gerçek soru bankası)', () => {
  const plan = teshisPlaniOlustur(SORULAR, KONULAR, new Set(), mulberry32(42));
  const tumIdler = plan.flatMap((t) => t.soru_idleri);

  it('10 test × 10 soru ve hiçbir soru tekrar etmiyor', () => {
    expect(plan).toHaveLength(10);
    for (const t of plan) expect(t.soru_idleri).toHaveLength(10);
    expect(new Set(tumIdler).size).toBe(100);
  });

  it('her konudan en az 2 soru', () => {
    const sayim = say(tumIdler, (id) => soruMap.get(id)!.konu);
    for (const k of KONULAR) expect(sayim.get(k.kod) ?? 0).toBeGreaterThanOrEqual(2);
  });

  it('bir testte bir konudan en fazla 2 soru', () => {
    for (const t of plan) {
      const sayim = say(t.soru_idleri, (id) => soruMap.get(id)!.konu);
      expect(Math.max(...sayim.values())).toBeLessThanOrEqual(CONFIG.TESHIS_TEST_KONU_MAX);
    }
  });

  it('zorluk ağırlıklı olarak orta seviyede', () => {
    const z = say(tumIdler, (id) => String(soruMap.get(id)!.zorluk));
    expect(z.get('2')!).toBeGreaterThanOrEqual(40);
    expect(z.get('1')!).toBeGreaterThanOrEqual(15);
    expect(z.get('3')!).toBeGreaterThanOrEqual(15);
  });

  it('aynı tohum aynı planı üretir', () => {
    expect(teshisPlaniOlustur(SORULAR, KONULAR, new Set(), mulberry32(42))).toEqual(plan);
  });
});

describe('uyarlanmış test', () => {
  // 1 zayıf konu, 11 güçlü konu (gerçek taksonomiye yakın genişlikte)
  const konular = sahteKonular({ gr: ['zayif', 'guclu', 'g1', 'g2', 'g3', 'g4'], kel: ['k1', 'k2', 'k3', 'k4', 'k5', 'k6'] });
  const sorular = sahteSorular(konular, 60);
  const cevaplar: CevapOzeti[] = konular.flatMap((k) =>
    Array(10).fill({ konu: k.kod, dogru_mu: k.kod !== 'zayif' }),
  );

  it('daha önce çözülmüş soru gelmiyor ve konu başına en fazla 3 soru', () => {
    const cozulmus = new Set(sorular.filter((_, i) => i % 2 === 0).map((s) => s.id));
    for (let tohum = 1; tohum <= 50; tohum++) {
      const t = uyarlanmisTestOlustur(sorular, konular, cevaplar, cozulmus, mulberry32(tohum));
      expect(t.soru_idleri).toHaveLength(10);
      expect(new Set(t.soru_idleri).size).toBe(10);
      for (const id of t.soru_idleri) expect(cozulmus.has(id)).toBe(false);
      const sayim = say(t.soru_idleri, (id) => id.slice(0, id.lastIndexOf('-')));
      expect(Math.max(...sayim.values())).toBeLessThanOrEqual(CONFIG.UYARLANMIS_KONU_MAX);
    }
  });

  it('zayıf konudan gelen soru oranı güçlü konulardan belirgin şekilde fazla', () => {
    let zayif = 0;
    let guclu = 0;
    for (let tohum = 1; tohum <= 300; tohum++) {
      const t = uyarlanmisTestOlustur(sorular, konular, cevaplar, new Set(), mulberry32(tohum));
      for (const id of t.soru_idleri) {
        if (id.startsWith('zayif-')) zayif++;
        if (id.startsWith('guclu-')) guclu++;
      }
    }
    expect(zayif).toBeGreaterThan(guclu * 3);
  });

  it('zayıf konuda kolay/orta, güçlü konuda orta/zor sorular seçilir', () => {
    const t = uyarlanmisTestOlustur(sorular, konular, cevaplar, new Set(), mulberry32(7));
    const zorluk = new Map(sorular.map((s) => [s.id, s.zorluk]));
    for (const id of t.soru_idleri) {
      if (id.startsWith('zayif-')) expect([1, 2]).toContain(zorluk.get(id));
      if (id.startsWith('guclu-')) expect([2, 3]).toContain(zorluk.get(id));
    }
  });

  it('konunun soruları bitince aynı bölümdeki konulara geçer ve bunu bildirir', () => {
    const cozulmus = new Set(sorular.filter((s) => s.konu === 'zayif').map((s) => s.id));
    let bildirildi = false;
    for (let tohum = 1; tohum <= 30; tohum++) {
      const t = uyarlanmisTestOlustur(sorular, konular, cevaplar, cozulmus, mulberry32(tohum));
      expect(t.soru_idleri.some((id) => id.startsWith('zayif-'))).toBe(false);
      expect(t.soru_idleri).toHaveLength(10);
      if (t.biten_konular.includes('zayif')) bildirildi = true;
    }
    expect(bildirildi).toBe(true);
  });

  it('havuz 10 sorudan azsa kalan tüm soruları verir', () => {
    const az = sorular.slice(0, 4);
    const t = uyarlanmisTestOlustur(az, konular, cevaplar, new Set(), mulberry32(1));
    expect(new Set(t.soru_idleri)).toEqual(new Set(az.map((s) => s.id)));
  });
});

describe('kontrol testi ve test sırası', () => {
  const konular = sahteKonular({ gr: ['a', 'b', 'c', 'd', 'e', 'f'], kel: ['g', 'h', 'i', 'j', 'k', 'l'] });
  const sorular = sahteSorular(konular, 8);

  it('kontrol testi 10 farklı konudan gelir', () => {
    const t = kontrolTestOlustur(sorular, konular, new Set(), mulberry32(3));
    expect(t.soru_idleri).toHaveLength(10);
    const sayim = say(t.soru_idleri, (id) => id.slice(0, id.lastIndexOf('-')));
    expect(sayim.size).toBe(10);
  });

  it('teşhis → 10 uyarlanmış → kontrol → uyarlanmış', () => {
    const bitmis = (tip: 'teshis' | 'uyarlanmis' | 'kontrol', n: number) =>
      Array.from({ length: n }, () => ({ tip, durum: 'bitti' as const }));
    expect(siradakiTest([], 10)).toEqual({ tip: 'teshis', sira_no: 1 });
    expect(siradakiTest(bitmis('teshis', 9), 10)).toEqual({ tip: 'teshis', sira_no: 10 });
    expect(siradakiTest(bitmis('teshis', 10), 10)).toEqual({ tip: 'uyarlanmis', sira_no: 1 });
    expect(siradakiTest([...bitmis('teshis', 10), ...bitmis('uyarlanmis', 10)], 10)).toEqual({ tip: 'kontrol', sira_no: 1 });
    expect(
      siradakiTest([...bitmis('teshis', 10), ...bitmis('uyarlanmis', 10), ...bitmis('kontrol', 1)], 10),
    ).toEqual({ tip: 'uyarlanmis', sira_no: 11 });
  });

  it('yanlışlar listesi son cevaba göre güncellenir', () => {
    expect(
      yanlisSoruIdleri([
        { soru_id: 'x', dogru_mu: false },
        { soru_id: 'y', dogru_mu: false },
        { soru_id: 'x', dogru_mu: true },
      ]),
    ).toEqual(['y']);
  });
});
