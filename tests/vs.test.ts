import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BellekSunucu } from '../src/vs/bellek';
import { MacOturumu, rakipAra, type AramaOlayi } from '../src/vs/istemci';
import {
  VS,
  adTemizle,
  asamaHesapla,
  kapananSoru,
  kuyrukAdimi,
  macOlustur,
  puan,
  skor,
  vsSorulariSec,
  type Mac,
} from '../src/vs/oyun';
import { mulberry32 } from '../src/engine/rng';
import { sahteKonular, sahteSorular, say } from './helpers';

const KONULAR = sahteKonular({
  kel: ['kel.fiil', 'kel.isim'],
  gr: ['gr.zaman', 'gr.if'],
  tamamlama: ['tam'],
  yakin_anlam: ['yakin_anlam'],
  diyalog: ['diyalog'],
  okuma: ['okuma.detay'],
});
const SORULAR = sahteSorular(KONULAR, 8).map((s) => (s.bolum === 'okuma' ? { ...s, paragraf_id: 'p-1' } : s));
const T0 = 1_000_000;

describe('eşleştirme kuyruğu', () => {
  it('boş kuyrukta bekler; ikinci oyuncu ilkini eşleştirir; ilk oyuncu sırası gelince maça geçer', () => {
    const a = kuyrukAdimi(null, { uid: 'a', ad: 'Ali' }, 'm1', T0);
    expect(a.sonuc).toEqual({ tip: 'bekle' });
    expect(a.kuyruk.a).toMatchObject({ ad: 'Ali', mac: null, surum: VS.SURUM });

    const b = kuyrukAdimi(a.kuyruk, { uid: 'b', ad: 'Ece' }, 'm2', T0 + 1000);
    expect(b.sonuc).toEqual({ tip: 'eslesti', rakip: 'a', rakipAd: 'Ali', macId: 'm2' });
    expect(b.kuyruk.a.mac).toBe('m2');
    expect(b.kuyruk.b).toBeUndefined();

    const a2 = kuyrukAdimi(b.kuyruk, { uid: 'a', ad: 'Ali' }, 'm3', T0 + 2000);
    expect(a2.sonuc).toEqual({ tip: 'eslestirildi', macId: 'm2' });
    expect(a2.kuyruk).toEqual({});
  });

  it('kendisiyle, eşleşmiş kayıtla, eski sürümle ve terk edilmiş kayıtla eşleşmez', () => {
    const kuyruk = {
      a: { ad: 'Ben', zaman: T0, surum: VS.SURUM, mac: null },
      eski: { ad: 'Eski', zaman: T0 - VS.ESKIME - 1, surum: VS.SURUM, mac: null },
      dolu: { ad: 'Dolu', zaman: T0, surum: VS.SURUM, mac: 'x' },
      surum: { ad: 'Surum', zaman: T0, surum: VS.SURUM + 1, mac: null },
    };
    const r = kuyrukAdimi(kuyruk, { uid: 'a', ad: 'Ben' }, 'm', T0 + 10);
    expect(r.sonuc).toEqual({ tip: 'bekle' });
    expect(Object.keys(r.kuyruk).sort()).toEqual(['a', 'dolu', 'surum']);
    expect(r.kuyruk.a.zaman).toBe(T0 + 10);
  });

  it('birden çok bekleyen varsa en eskisi eşleşir', () => {
    const kuyruk = {
      yeni: { ad: 'Yeni', zaman: T0 + 500, surum: VS.SURUM },
      eski: { ad: 'Eski', zaman: T0, surum: VS.SURUM },
    };
    expect(kuyrukAdimi(kuyruk, { uid: 'c', ad: 'C' }, 'm', T0 + 600).sonuc).toMatchObject({ tip: 'eslesti', rakip: 'eski' });
  });

  it('takma ad kırpılır', () => {
    expect(adTemizle('   Ayşe    Nur  ')).toBe('Ayşe Nur');
    expect(adTemizle('x'.repeat(40))).toHaveLength(16);
  });
});

describe('maç kurgusu', () => {
  it('10 kısa soru: bölüm dağılımı sabit, parçalı soru yok, tohumla tekrarlanabilir', () => {
    const s = vsSorulariSec(SORULAR, mulberry32(7));
    expect(s).toHaveLength(VS.SORU_SAYISI);
    expect(new Set(s.map((x) => x.id)).size).toBe(VS.SORU_SAYISI);
    expect(Object.fromEntries(say(s, (x) => x.bolum))).toEqual({ kel: 3, gr: 3, tamamlama: 2, yakin_anlam: 1, diyalog: 1 });
    expect(s.every((x) => !('paragraf_id' in x))).toBe(true);
    expect(vsSorulariSec(SORULAR, mulberry32(7))).toEqual(s);
  });

  const mac = (): Mac => ({
    ...macOlustur({ uid: 'a', ad: 'A' }, { uid: 'b', ad: 'B' }, vsSorulariSec(SORULAR, mulberry32(1)).slice(0, 2), T0),
    basla: T0,
  });
  const ilk = T0 + VS.GERI_SAYIM;

  it('geri sayım, soru, açıklama ve bitiş zamanları maç verisinden türetilir', () => {
    const m = mac();
    expect(asamaHesapla({ ...m, basla: undefined }, T0)).toEqual({ tip: 'hazirlaniyor' });
    expect(asamaHesapla(m, T0 + 10)).toEqual({ tip: 'geri_sayim', bitis: ilk });
    expect(asamaHesapla(m, ilk)).toEqual({ tip: 'soru', i: 0, baslangic: ilk, bitis: ilk + VS.SORU_SURE });

    // Yalnızca biri cevapladıysa soru süre dolana kadar açık kalır.
    m.cevaplar = { a: { 0: { s: 0, ms: 2000 } } };
    expect(asamaHesapla(m, ilk + 5000).tip).toBe('soru');
    const kapanis = ilk + VS.SORU_SURE;
    expect(asamaHesapla(m, kapanis)).toEqual({ tip: 'aciklama', i: 0, bitis: kapanis + VS.ACIKLAMA_SURE });

    // İkisi de cevaplayınca soru, geç cevaplayanın anında kapanır.
    m.cevaplar = { a: { 0: { s: 0, ms: 2000 } }, b: [{ s: 1, ms: 6000 }] };
    expect(asamaHesapla(m, ilk + 5999).tip).toBe('soru');
    const ikinci = ilk + 6000 + VS.ACIKLAMA_SURE;
    expect(asamaHesapla(m, ilk + 6000)).toEqual({ tip: 'aciklama', i: 0, bitis: ikinci });
    expect(asamaHesapla(m, ikinci)).toMatchObject({ tip: 'soru', i: 1, baslangic: ikinci });
    expect(asamaHesapla(m, ikinci + VS.SORU_SURE + VS.ACIKLAMA_SURE)).toEqual({ tip: 'bitti' });
  });

  it('puan: doğru 100 + hız bonusu; yanlış, boş ve süre dışı 0; skor yalnızca kapanan soruları sayar', () => {
    const soru = { dogru: 2 };
    expect(puan(soru, { s: 2, ms: 0 })).toBe(150);
    expect(puan(soru, { s: 2, ms: VS.SORU_SURE / 2 })).toBe(125);
    expect(puan(soru, { s: 1, ms: 0 })).toBe(0);
    expect(puan(soru, undefined)).toBe(0);

    const m = mac();
    const d0 = m.sorular[0].dogru;
    m.cevaplar = { a: { 0: { s: d0, ms: 0 }, 1: { s: m.sorular[1].dogru, ms: VS.SORU_SURE + 5 } } };
    expect(skor(m, 'a', 0)).toBe(0);
    expect(skor(m, 'a', 1)).toBe(150);
    expect(skor(m, 'a')).toBe(150);
    expect(kapananSoru({ tip: 'aciklama', i: 0, bitis: 0 }, 2)).toBe(1);
  });
});

describe('iki cihaz arasında maç (bellek sunucusu)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(T0);
  });
  afterEach(() => vi.useRealTimers());

  const saat = () => Date.now();

  async function eslestir(sunucu: BellekSunucu) {
    const a = sunucu.baglanti('a', saat);
    const b = sunucu.baglanti('b', saat);
    const olaylar: Record<string, AramaOlayi[]> = { a: [], b: [] };
    rakipAra(a, 'Ali', () => SORULAR, (o) => olaylar.a.push(o), mulberry32(3));
    await vi.advanceTimersByTimeAsync(100);
    expect(sunucu.al('vs/kuyruk/a')).toEqual({ ad: 'Ali', zaman: Date.now() - 100, surum: VS.SURUM });
    rakipAra(b, 'Ece', () => SORULAR, (o) => olaylar.b.push(o), mulberry32(4));
    await vi.advanceTimersByTimeAsync(100);
    return { a, b, olaylar };
  }

  it('bekleyen oyuncu ile yeni gelen aynı maça düşer; kuyruk boşalır', async () => {
    const sunucu = new BellekSunucu();
    const { olaylar } = await eslestir(sunucu);
    expect(olaylar.a).toHaveLength(1);
    expect(olaylar.b).toHaveLength(1);
    const macId = (olaylar.a[0] as { macId: string }).macId;
    expect(olaylar.b[0]).toEqual({ tip: 'eslesti', macId });
    expect(sunucu.al('vs/kuyruk')).toBeNull();
    const mac = sunucu.al(`vs/maclar/${macId}`) as Mac;
    expect(mac.kurucu).toBe('b');
    expect(Object.keys(mac.oyuncular).sort()).toEqual(['a', 'b']);
    expect(mac.sorular).toHaveLength(VS.SORU_SAYISI);
  });

  it('iki oyuncu hazır olunca maç başlar; cevaplar iki tarafta aynı skoru verir', async () => {
    const sunucu = new BellekSunucu();
    const { a, b, olaylar } = await eslestir(sunucu);
    const macId = (olaylar.a[0] as { macId: string }).macId;
    const oa = new MacOturumu(a, macId, () => undefined);
    const ob = new MacOturumu(b, macId, () => undefined);
    oa.baslat();
    ob.baslat();
    await vi.advanceTimersByTimeAsync(600);
    expect(oa.mac!.basla).toBeDefined();
    expect(oa.durum().tip).toBe('oyun');

    await vi.advanceTimersByTimeAsync(VS.GERI_SAYIM + 1000);
    const dogru = oa.mac!.sorular[0].dogru;
    expect(oa.cevapla(0, dogru)).toBe(true);
    expect(oa.cevapla(0, dogru)).toBe(false);
    await vi.advanceTimersByTimeAsync(1000);
    expect(ob.cevapla(0, (dogru + 1) % 5)).toBe(true);
    await vi.advanceTimersByTimeAsync(10);

    const da = oa.durum();
    expect(da).toMatchObject({ tip: 'oyun', asama: { tip: 'aciklama', i: 0 } });
    expect(ob.durum()).toEqual(da);
    expect(skor(oa.mac!, 'a', 1)).toBe(skor(ob.mac!, 'a', 1));
    expect(skor(ob.mac!, 'a', 1)).toBeGreaterThan(100);
    expect(skor(ob.mac!, 'b', 1)).toBe(0);
    oa.kapat();
    ob.kapat();
  });

  it('rakip çıkarsa maç hükmen biter; rakip hiç gelmezse eşleşme iptal edilir', async () => {
    const sunucu = new BellekSunucu();
    const { a, b, olaylar } = await eslestir(sunucu);
    const macId = (olaylar.a[0] as { macId: string }).macId;
    const oa = new MacOturumu(a, macId, () => undefined);
    const ob = new MacOturumu(b, macId, () => undefined);
    oa.baslat();
    ob.baslat();
    await vi.advanceTimersByTimeAsync(VS.GERI_SAYIM + 600);
    await ob.cik();
    await vi.advanceTimersByTimeAsync(600);
    expect(oa.durum().tip).toBe('rakip_cikti');
    oa.kapat();

    // Rakip maç ekranını hiç açmıyor.
    const s2 = new BellekSunucu();
    const e2 = await eslestir(s2);
    const id2 = (e2.olaylar.a[0] as { macId: string }).macId;
    const yalniz = new MacOturumu(e2.b, id2, () => undefined);
    yalniz.baslat();
    await vi.advanceTimersByTimeAsync(VS.HAZIR_BEKLEME + 1000);
    expect(yalniz.durum().tip).toBe('iptal');
    yalniz.kapat();
  });

  it('bağlantısı kopan rakip süre sınırından sonra kaybetmiş sayılır', async () => {
    const sunucu = new BellekSunucu();
    const { a, b, olaylar } = await eslestir(sunucu);
    const macId = (olaylar.a[0] as { macId: string }).macId;
    const oa = new MacOturumu(a, macId, () => undefined);
    const ob = new MacOturumu(b, macId, () => undefined);
    oa.baslat();
    ob.baslat();
    await vi.advanceTimersByTimeAsync(VS.GERI_SAYIM + 600);
    // Uygulama kapanır: sunucu "kopunca" yazımını uygular.
    sunucu.kopar('b');
    ob.kapat();
    await vi.advanceTimersByTimeAsync(1000);
    expect(oa.rakipKopuk).toBe(true);
    expect(oa.durum().tip).toBe('oyun');
    await vi.advanceTimersByTimeAsync(VS.KOPUK_SINIR);
    expect(oa.durum().tip).toBe('rakip_koptu');
    oa.kapat();
  });

  it('arama iptal edilince kuyruktan çıkar', async () => {
    const sunucu = new BellekSunucu();
    const a = sunucu.baglanti('a', saat);
    const iptal = rakipAra(a, 'Ali', () => SORULAR, () => undefined);
    await vi.advanceTimersByTimeAsync(100);
    expect(sunucu.al('vs/kuyruk/a')).not.toBeNull();
    iptal();
    await vi.advanceTimersByTimeAsync(100);
    expect(sunucu.al('vs/kuyruk')).toBeNull();
    await vi.advanceTimersByTimeAsync(VS.NABIZ * 2);
    expect(sunucu.al('vs/kuyruk')).toBeNull();
  });
});
