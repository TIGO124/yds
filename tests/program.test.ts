import { describe, expect, it } from 'vitest';
import { programOlustur, type ProgramGirdisi } from '../src/engine/program';
import type { CevapOzeti } from '../src/engine/mastery';
import { sahteKonular } from './helpers';

const konular = sahteKonular({ gr: ['zayif', 'g1', 'g2', 'g3', 'g4', 'g5'], kel: ['k1', 'k2', 'k3', 'k4', 'k5', 'k6'] });
const cevaplar: CevapOzeti[] = konular.flatMap((k) => Array(10).fill({ konu: k.kod, dogru_mu: k.kod !== 'zayif' }));
// 2026-09-28 pazartesi
const pazartesi = new Date(2026, 8, 28);

const girdi = (degisim: Partial<ProgramGirdisi> = {}): ProgramGirdisi => ({
  konular,
  cevaplar,
  yanlisSayisi: 12,
  kalanYeniSoru: 800,
  teshisKalan: 0,
  bugun: pazartesi,
  gunlukDakika: 90,
  haftalikGun: 6,
  sinavTarihi: null,
  ...degisim,
});

describe('ders programı', () => {
  it('7 gün üretir, dinlenme günü sayısı ayara uyar ve pazar önce dinlenir', () => {
    const p = programOlustur(girdi({ haftalikGun: 5 }));
    expect(p.gunler).toHaveLength(7);
    const dinlenme = p.gunler.filter((g) => g.dinlenme);
    expect(dinlenme).toHaveLength(2);
    expect(dinlenme.map((g) => g.haftaGunu).sort()).toEqual([0, 3]);
    expect(p.gunler[0].tarih).toBe('2026-09-28');
  });

  it('çalışma günlerinde süre günlük hedefi aşmaz', () => {
    for (const dk of [30, 45, 60, 90, 120, 180]) {
      const p = programOlustur(girdi({ gunlukDakika: dk }));
      for (const g of p.gunler.filter((x) => !x.dinlenme)) {
        const toplam = g.etkinlikler.reduce((t, e) => t + (e.tur === 'sinav' ? 0 : e.dakika), 0);
        expect(toplam).toBeLessThanOrEqual(dk);
        expect(toplam).toBeGreaterThan(0);
      }
    }
  });

  it('zayıf konu güçlü konulardan daha çok çalışma bloğu alır ve aynı gün tekrar etmez', () => {
    const p = programOlustur(girdi({ gunlukDakika: 120 }));
    const bloklar = p.gunler.flatMap((g) => g.etkinlikler).filter((e) => e.tur === 'konu');
    const say = (k: string) => bloklar.filter((e) => e.tur === 'konu' && e.konu === k).length;
    expect(say('zayif')).toBeGreaterThan(say('g1'));
    expect(p.odak[0].konu).toBe('zayif');
    for (const g of p.gunler) {
      const konuListesi = g.etkinlikler.flatMap((e) => (e.tur === 'konu' ? [e.konu] : []));
      expect(new Set(konuListesi).size).toBe(konuListesi.length);
    }
  });

  it('teşhis aşamasında kalan teşhis testlerini planlar, fazlasını değil', () => {
    const p = programOlustur(girdi({ teshisKalan: 3, cevaplar: [] }));
    expect(p.asama).toBe('teshis');
    const teshis = p.gunler
      .flatMap((g) => g.etkinlikler)
      .reduce((t, e) => t + (e.tur === 'test' && e.teshis ? e.adet : 0), 0);
    expect(teshis).toBe(3);
    expect(p.notlar).toContain('teshis');
  });

  it('sınav yaklaşınca son hafta moduna geçer; arife hafif, sonrası boş', () => {
    const p = programOlustur(girdi({ sinavTarihi: '2026-10-01' }));
    expect(p.asama).toBe('son_hafta');
    expect(p.sinavaKalanGun).toBe(3);
    expect(p.gunler[3].etkinlikler).toEqual([{ tur: 'sinav' }]);
    expect(p.gunler[2].etkinlikler.some((e) => e.tur === 'test')).toBe(false);
    expect(p.gunler.slice(4).every((g) => g.dinlenme)).toBe(true);
  });

  it('geçmiş sınav tarihi yok sayılır; soru kalmayınca test planlanmaz', () => {
    const p = programOlustur(girdi({ sinavTarihi: '2020-01-01', kalanYeniSoru: 0 }));
    expect(p.sinavaKalanGun).toBeNull();
    expect(p.notlar).toContain('sinav_gecti');
    expect(p.gunler.flatMap((g) => g.etkinlikler).some((e) => e.tur === 'test')).toBe(false);
  });

  it('son bir haftada deneme çözülmediyse deneme önerir', () => {
    expect(programOlustur(girdi({ sonDenemeGunOnce: null })).notlar).toContain('deneme');
    expect(programOlustur(girdi({ sonDenemeGunOnce: 3 })).notlar).not.toContain('deneme');
    expect(programOlustur(girdi({ teshisKalan: 2 })).notlar).not.toContain('deneme');
  });

  it('aynı girdi aynı programı verir', () => {
    expect(programOlustur(girdi())).toEqual(programOlustur(girdi()));
  });
});
