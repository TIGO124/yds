import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { KONULAR, SORULAR } from '../src/data/bank';
import { YdsDB } from '../src/db/db';
import { Depo } from '../src/db/depo';
import { mulberry32 } from '../src/engine/rng';

let sayac = 0;
let depo: Depo;

beforeEach(() => {
  let tohum = 100;
  depo = new Depo(new YdsDB(`test-${++sayac}`), { sorular: SORULAR, konular: KONULAR }, () => mulberry32(tohum++));
});

/** Aktif testi rastgele cevaplayıp bitirir. */
async function coz(testId: number, dogruOrani = 0.5): Promise<void> {
  const t = (await depo.test(testId))!;
  const soruMap = new Map(SORULAR.map((s) => [s.id, s]));
  for (let i = 0; i < t.soru_idleri.length; i++) {
    const s = soruMap.get(t.soru_idleri[i])!;
    const secim = (i / t.soru_idleri.length) < dogruOrani ? s.dogru : (s.dogru + 1) % 5;
    await depo.secimKaydet(testId, i, secim, 1000, i);
  }
  await depo.testiBitir(testId);
}

describe('Depo (IndexedDB)', () => {
  it('10 teşhis testi boyunca ve sonrasında hiçbir soru iki kez gelmiyor', async () => {
    const gorulen = new Set<string>();
    for (let i = 0; i < 12; i++) {
      const id = await depo.sonrakiTestiBaslat();
      const t = (await depo.test(id))!;
      expect(t.tip).toBe(i < 10 ? 'teshis' : 'uyarlanmis');
      for (const sid of t.soru_idleri) {
        expect(gorulen.has(sid)).toBe(false);
        gorulen.add(sid);
      }
      await coz(id);
    }
    expect(gorulen.size).toBe(120);
  });

  it('tüm banka bitene kadar soru tekrarı yok; 10 uyarlanmıştan sonra kontrol testi gelir', async () => {
    const gorulen = new Set<string>();
    const tipler: string[] = [];
    for (;;) {
      let id: number;
      try {
        id = await depo.sonrakiTestiBaslat();
      } catch {
        break;
      }
      const t = (await depo.test(id))!;
      tipler.push(t.tip);
      for (const sid of t.soru_idleri) {
        expect(gorulen.has(sid)).toBe(false);
        gorulen.add(sid);
      }
      await coz(id, 0.6);
    }
    expect(gorulen.size).toBe(SORULAR.length);
    expect(tipler.slice(0, 10).every((t) => t === 'teshis')).toBe(true);
    if (tipler.length > 20) expect(tipler[20]).toBe('kontrol');
  });

  it('yarım kalan test yeni oturumda kaldığı yerden sürer', async () => {
    const id = await depo.sonrakiTestiBaslat();
    await depo.secimKaydet(id, 0, 2, 5000, 1);
    await depo.secimKaydet(id, 1, null, 3000, 2);

    const yeni = new Depo(depo.db, depo.banka);
    const aktif = (await yeni.aktifTest())!;
    expect(aktif.id).toBe(id);
    expect(aktif.aktif_index).toBe(2);
    expect(aktif.secimler.slice(0, 2)).toEqual([2, null]);
    expect(await yeni.sonrakiTestiBaslat()).toBe(id);
  });

  it('tekrar testi yalnızca yanlış/boş soruları içerir ve konu puanını etkilemez', async () => {
    const id = await depo.sonrakiTestiBaslat();
    await coz(id, 0.5);
    const yanlislar = await depo.yanlislar();
    expect(yanlislar).toHaveLength(5);

    const tid = (await depo.tekrarTestiBaslat())!;
    const t = (await depo.test(tid))!;
    expect(t.tip).toBe('tekrar');
    expect(new Set(t.soru_idleri)).toEqual(new Set(yanlislar));
    await coz(tid, 1);
    expect(await depo.yanlislar()).toHaveLength(0);
  });

  it('art arda ayar kayıtları birbirini ezmez', async () => {
    await Promise.all([depo.ayarKaydet({ tema: 'koyu' }), depo.ayarKaydet({ gunluk_dakika: 90 }), depo.ayarKaydet({ haftalik_gun: 4 })]);
    const a = await depo.ayarlar();
    expect([a.tema, a.gunluk_dakika, a.haftalik_gun]).toEqual(['koyu', 90, 4]);
  });

  it('yedek → sıfırla → yedekten yükle tüm ilerlemeyi geri getirir', async () => {
    for (let i = 0; i < 2; i++) await coz(await depo.sonrakiTestiBaslat());
    await depo.ayarKaydet({ tema: 'koyu' });
    const yedek = JSON.parse(JSON.stringify(await depo.yedekAl()));

    await depo.sifirla();
    expect(await depo.cevaplar()).toHaveLength(0);

    await depo.yedektenYukle(yedek);
    expect(await depo.cevaplar()).toHaveLength(20);
    expect((await depo.testler()).filter((t) => t.durum === 'bitti')).toHaveLength(2);
    expect((await depo.ayarlar()).tema).toBe('koyu');
    const sonraki = (await depo.test(await depo.sonrakiTestiBaslat()))!;
    expect(sonraki.sira_no).toBe(3);
  });

  it('art arda iki başlatma tek test oluşturur', async () => {
    const [a, b] = await Promise.all([depo.sonrakiTestiBaslat(), depo.sonrakiTestiBaslat()]);
    expect(a).toBe(b);
    expect(await depo.testler()).toHaveLength(1);
    expect(await depo.db.teshis_plani.count()).toBe(10);
  });

  it('bankadan kaldırılmış soru test bitirmeyi bozmaz', async () => {
    const id = await depo.sonrakiTestiBaslat();
    const t = (await depo.test(id))!;
    const eksikBanka = { sorular: SORULAR.filter((s) => s.id !== t.soru_idleri[0]), konular: KONULAR };
    const yeni = new Depo(depo.db, eksikBanka);
    await yeni.testiBitir(id);
    expect((await yeni.test(id))!.durum).toBe('bitti');
    expect(await yeni.cevaplar()).toHaveLength(9);
  });

  it('deneme: 80 yeni soru, yarım test varken başlamaz, test sırasını bozmaz', async () => {
    const ilk = await depo.sonrakiTestiBaslat();
    await expect(depo.denemeBaslat()).rejects.toThrow('yarım kalan');
    await coz(ilk);

    const { id, eksik } = await depo.denemeBaslat();
    expect(eksik).toEqual([]);
    expect((await depo.denemeBaslat()).id).toBe(id);
    const d = (await depo.test(id))!;
    expect(d.tip).toBe('deneme');
    expect(d.soru_idleri).toHaveLength(80);
    const ilkSorular = new Set((await depo.test(ilk))!.soru_idleri);
    expect(d.soru_idleri.some((s) => ilkSorular.has(s))).toBe(false);

    await coz(id, 0.5);
    expect(await depo.cevaplar()).toHaveLength(90);
    const sonraki = (await depo.test(await depo.sonrakiTestiBaslat()))!;
    expect(sonraki.tip).toBe('teshis');
    expect(sonraki.sira_no).toBe(2);
  });

  it('geçersiz yedek reddedilir', async () => {
    await expect(depo.yedektenYukle({ uygulama: 'baska' })).rejects.toThrow('Geçersiz yedek');
  });
});
