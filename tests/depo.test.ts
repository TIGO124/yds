import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { KONULAR, SORULAR } from '../src/data/bank';
import { YdsDB } from '../src/db/db';
import { Depo } from '../src/db/depo';
import { mulberry32 } from '../src/engine/rng';
import { sahteKonular, sahteSorular } from './helpers';

let sayac = 0;
let depo: Depo;
/** Depo'nun saati: testler günleri ileri sarabilsin. */
let saat = 0;
const gunIlerle = (n: number) => {
  saat += n * 86_400_000;
};
const soruMap = new Map(SORULAR.map((s) => [s.id, s]));

beforeEach(() => {
  let tohum = 100;
  saat = new Date(2026, 8, 28, 10).getTime();
  depo = new Depo(new YdsDB(`test-${++sayac}`), { sorular: SORULAR, konular: KONULAR }, () => mulberry32(tohum++), () => saat);
});

/** Aktif testi rastgele cevaplayıp bitirir. */
async function coz(testId: number, dogruOrani = 0.5): Promise<void> {
  const t = (await depo.test(testId))!;
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
  }, 60_000);

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

  it('aralıklı tekrar: yanlışlar ertesi gün gelir; 1, 3, 7 gün arayla 3 kez doğru çözülünce listeden çıkar', async () => {
    const id = await depo.sonrakiTestiBaslat();
    await coz(id, 0.5);
    let liste = await depo.tekrarListesi();
    expect(liste.hepsi).toHaveLength(5);
    expect(liste.sirada).toHaveLength(0);
    expect(await depo.tekrarTestiBaslat()).toBeNull();

    const yanlislar = new Set(liste.hepsi.map((d) => d.soru_id));
    for (const gun of [1, 3, 7]) {
      gunIlerle(gun);
      const tid = (await depo.tekrarTestiBaslat())!;
      const t = (await depo.test(tid))!;
      expect(t.tip).toBe('tekrar');
      expect(new Set(t.soru_idleri)).toEqual(yanlislar);
      await coz(tid, 1);
      liste = await depo.tekrarListesi();
      expect(liste.sirada).toHaveLength(0);
    }
    expect(liste.hepsi).toHaveLength(0);
  });

  it('kaydedilen sorular: işaretleme, kaldırma ve bunlardan tekrar testi', async () => {
    const ids = SORULAR.slice(0, 3).map((s) => s.id);
    await depo.isaretle(ids[0], true);
    saat += 1000;
    await depo.isaretle(ids[1], true);
    expect((await depo.isaretler()).map((i) => i.soru_id)).toEqual([ids[1], ids[0]]);
    await depo.isaretle(ids[0], false);
    expect((await depo.isaretler()).map((i) => i.soru_id)).toEqual([ids[1]]);

    const tid = (await depo.tekrarTestiBaslat(ids))!;
    expect(new Set((await depo.test(tid))!.soru_idleri)).toEqual(new Set(ids));
  });

  it('kelime defteri: ekleme, kart cevapları ve çalışma günlüğü', async () => {
    expect(await depo.kelimeEkle({ kelime: ' Evidence ', baglam: 'There is evidence.' })).toBe('eklendi');
    expect(await depo.kelimeEkle({ kelime: 'evidence', anlam: 'kanıt' })).toBe('vardi');
    expect((await depo.kelimeler())[0]).toMatchObject({ kelime: 'evidence', anlam: 'kanıt', kutu: 0 });
    await expect(depo.kelimeEkle({ kelime: ' .. ' })).rejects.toThrow('boş');

    expect((await depo.siradakiKartlar()).map((k) => k.kelime)).toEqual(['evidence']);
    await depo.kartCevapla('evidence', true);
    expect(await depo.siradakiKartlar()).toHaveLength(0);
    gunIlerle(3);
    expect(await depo.siradakiKartlar()).toHaveLength(1);
    await depo.kartCevapla('evidence', false);
    expect((await depo.kelimeler())[0].kutu).toBe(0);
    expect((await depo.gunluk()).map((g) => g.kart)).toEqual([1, 1]);
  });

  it('konu testi: tek konudan 5 soru, başka test yarımken başlamaz, test sırasını bozmaz', async () => {
    const id = await depo.konuTestiBaslat('gr.zaman');
    const t = (await depo.test(id))!;
    expect(t).toMatchObject({ tip: 'konu', konu: 'gr.zaman' });
    expect(t.soru_idleri).toHaveLength(5);
    for (const sid of t.soru_idleri) expect(soruMap.get(sid)!.konu).toBe('gr.zaman');
    expect(await depo.konuTestiBaslat('gr.zaman')).toBe(id);
    await expect(depo.konuTestiBaslat('gr.modal')).rejects.toThrow('yarım kalan');
    await coz(id);
    const sonraki = (await depo.test(await depo.sonrakiTestiBaslat()))!;
    expect([sonraki.tip, sonraki.sira_no]).toEqual(['teshis', 1]);
  });

  it('yeni soru kalmayınca en uzun süredir görülmeyen sorular gelir; son 3 günde görülenler gelmez', async () => {
    const konular = sahteKonular({ gr: ['a', 'b'] });
    const kucuk = new Depo(new YdsDB(`test-${++sayac}`), { sorular: sahteSorular(konular, 12), konular }, () => mulberry32(7), () => saat);
    const hepsiDogru = async (id: number) => {
      const t = (await kucuk.test(id))!;
      for (let i = 0; i < t.soru_idleri.length; i++) await kucuk.secimKaydet(id, i, 0, 1000, i);
      await kucuk.testiBitir(id);
    };
    for (let i = 0; i < 3; i++) await hepsiDogru(await kucuk.sonrakiTestiBaslat());
    expect(new Set((await kucuk.cevaplar()).map((c) => c.soru_id)).size).toBe(24);
    await expect(kucuk.sonrakiTestiBaslat()).rejects.toThrow('kalmadı');

    gunIlerle(4);
    const t = (await kucuk.test(await kucuk.sonrakiTestiBaslat()))!;
    expect(t.tip).toBe('uyarlanmis');
    expect(t.soru_idleri).toHaveLength(10);
  });

  it('art arda ayar kayıtları birbirini ezmez', async () => {
    await Promise.all([depo.ayarKaydet({ tema: 'koyu' }), depo.ayarKaydet({ gunluk_dakika: 90 }), depo.ayarKaydet({ haftalik_gun: 4 })]);
    const a = await depo.ayarlar();
    expect([a.tema, a.gunluk_dakika, a.haftalik_gun]).toEqual(['koyu', 90, 4]);
  });

  it('yedek → sıfırla → yedekten yükle tüm ilerlemeyi geri getirir', async () => {
    for (let i = 0; i < 2; i++) await coz(await depo.sonrakiTestiBaslat());
    await depo.ayarKaydet({ tema: 'koyu' });
    await depo.kelimeEkle({ kelime: 'outcome', anlam: 'sonuç' });
    await depo.kartCevapla('outcome', true);
    await depo.isaretle(SORULAR[0].id, true);
    const yedek = JSON.parse(JSON.stringify(await depo.yedekAl()));
    expect(yedek.surum).toBe(2);

    await depo.sifirla();
    expect(await depo.cevaplar()).toHaveLength(0);
    // Sıfırlama kelime defterine ve kaydedilenlere dokunmaz.
    expect(await depo.kelimeler()).toHaveLength(1);
    await depo.kelimeSil('outcome');
    await depo.isaretle(SORULAR[0].id, false);

    await depo.yedektenYukle(yedek);
    expect(await depo.cevaplar()).toHaveLength(20);
    expect((await depo.kelimeler())[0]).toMatchObject({ kelime: 'outcome', kutu: 1 });
    expect(await depo.isaretler()).toHaveLength(1);
    expect(await depo.gunluk()).toHaveLength(1);
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

  it('fotoğraflar: ekleme, not, silme; sıfırlama ve yedek fotoğraflara dokunmaz', async () => {
    const bayt = (n: number) => new Uint8Array([n, n, n]).buffer;
    const ilk = await depo.fotografEkle({ veri: bayt(1), kucuk: bayt(2), genislik: 1600, yukseklik: 1200 });
    saat += 1000;
    const ikinci = await depo.fotografEkle({ veri: bayt(3), kucuk: bayt(4), genislik: 800, yukseklik: 600 });
    expect((await depo.fotograflar()).map((f) => f.id)).toEqual([ikinci, ilk]);

    await depo.fotografNotu(ilk, '  s. 42, 7. soru  ');
    const f = (await depo.fotograf(ilk))!;
    expect(f).toMatchObject({ not: 's. 42, 7. soru', genislik: 1600, yukseklik: 1200 });
    expect(new Uint8Array(f.veri)).toEqual(new Uint8Array([1, 1, 1]));

    await depo.sifirla();
    expect(Object.keys(await depo.yedekAl()).some((k) => k.includes('fotograf'))).toBe(false);
    expect(await depo.fotografSayisi()).toBe(2);

    await depo.fotografSil(ilk);
    expect(await depo.fotograf(ilk)).toBeUndefined();
    expect(await depo.db.fotograf_verisi.count()).toBe(1);
  });

  it('eski biçimli (v1) yedek yüklenir; kelime defterine dokunulmaz', async () => {
    await coz(await depo.sonrakiTestiBaslat());
    const yedek = JSON.parse(JSON.stringify(await depo.yedekAl()));
    yedek.surum = 1;
    delete yedek.isaretler;
    delete yedek.kelimeler;
    delete yedek.gunluk;
    await depo.sifirla();
    await depo.kelimeEkle({ kelime: 'outcome' });
    await depo.yedektenYukle(yedek);
    expect(await depo.cevaplar()).toHaveLength(10);
    expect((await depo.kelimeler()).map((k) => k.kelime)).toEqual(['outcome']);
  });

  it('geçersiz yedek reddedilir', async () => {
    await expect(depo.yedektenYukle({ uygulama: 'baska' })).rejects.toThrow('Geçersiz yedek');
    const bozuk = { ...(await depo.yedekAl()), kelimeler: [{ kelime: '', anlam: '', baglam: '', kutu: 0, sonraki: 0, eklenme: 0 }] };
    await expect(depo.yedektenYukle(bozuk)).rejects.toThrow('kelime kaydı bozuk');
  });
});
