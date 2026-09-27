import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { describe, expect, it } from 'vitest';
import { YdsDB } from '../src/db/db';
import { androidSurumDenetle, bekleyenGuncelleme, guncellemeBildir, surumBilgisiDogrula, surumKarsilastir, UYGULAMA_SURUMU } from '../src/guncelleme';

describe('sürüm karşılaştırma', () => {
  it('sayısal karşılaştırır (1.10.0 > 1.9.9)', () => {
    expect(surumKarsilastir('1.10.0', '1.9.9')).toBe(1);
    expect(surumKarsilastir('1.0.0', '1.0.1')).toBe(-1);
    expect(surumKarsilastir('2.0.0', '2.0.0')).toBe(0);
  });
  it('uygulama sürümü package.json ile aynı', async () => {
    const { version } = await import('../package.json');
    expect(UYGULAMA_SURUMU).toBe(version);
  });
});

describe('surum.json doğrulama', () => {
  it('geçerli bilgiyi kabul eder', () => {
    expect(surumBilgisiDogrula({ surum: '1.2.3', apk: 'indir/YDS-Calisma.apk', notlar: ['a', 5] })).toEqual({
      surum: '1.2.3',
      apk: 'indir/YDS-Calisma.apk',
      notlar: ['a'],
    });
  });
  it('bozuk sürümü ve başka siteye giden APK adresini reddeder', () => {
    expect(surumBilgisiDogrula({ surum: 'x' })).toBeNull();
    expect(surumBilgisiDogrula(null)).toBeNull();
    expect(surumBilgisiDogrula({ surum: '9.0.0', apk: 'https://kotu.site/a.apk' })?.apk).toBeNull();
    expect(surumBilgisiDogrula({ surum: '9.0.0', apk: '//kotu.site/a.apk' })?.apk).toBeNull();
    expect(surumBilgisiDogrula({ surum: '9.0.0', apk: 'indir/../../x.apk' })?.apk).toBeNull();
  });
});

describe('Android sürüm denetimi', () => {
  const sunucu = (govde: unknown) => async () => new Response(JSON.stringify(govde));

  it('daha yeni sürüm varsa güncelleme bildirir', async () => {
    guncellemeBildir(null);
    expect(await androidSurumDenetle(sunucu({ surum: '99.0.0', apk: 'indir/YDS-Calisma.apk', notlar: ['Yeni'] }))).toBe('var');
    expect(bekleyenGuncelleme()).toEqual({
      tur: 'android',
      surum: '99.0.0',
      notlar: ['Yeni'],
      // Site adresi değil: telefondaki web sürümünün service worker'ı onu boş sayfaya çeviriyordu.
      adres: 'https://raw.githubusercontent.com/TIGO124/yds/v99.0.0/indir/YDS-Calisma.apk',
    });
  });
  it('aynı ya da eski sürümde ve APK yoksa bildirmez', async () => {
    guncellemeBildir(null);
    expect(await androidSurumDenetle(sunucu({ surum: UYGULAMA_SURUMU, apk: 'indir/YDS-Calisma.apk' }))).toBe('guncel');
    expect(await androidSurumDenetle(sunucu({ surum: '0.0.1', apk: 'indir/YDS-Calisma.apk' }))).toBe('guncel');
    expect(await androidSurumDenetle(sunucu({ surum: '99.0.0', apk: null }))).toBe('guncel');
    expect(bekleyenGuncelleme()).toBeNull();
  });
  it('sunucu hatasında hata fırlatır', async () => {
    await expect(androidSurumDenetle(async () => new Response('', { status: 404 }))).rejects.toThrow();
  });
});

describe('veritabanı geçişi', () => {
  it('ilk sürümün (v1) verisi yeni şemada eksiksiz okunur', async () => {
    const ad = 'gecis-v1';
    const eski = new Dexie(ad);
    eski.version(1).stores({ testler: '++id, tip, durum', cevaplar: '++id, test_id, soru_id, konu', ayarlar: 'id', teshis_plani: 'sira_no' });
    await eski.table('testler').add({ tip: 'teshis', durum: 'bitti', soru_idleri: ['a'] });
    await eski.table('cevaplar').add({ test_id: 1, soru_id: 'a', konu: 'gr.zaman', dogru_mu: true });
    await eski.table('ayarlar').put({ id: 'ayarlar', tema: 'koyu' });
    await eski.table('teshis_plani').put({ sira_no: 1, konular: [] });
    eski.close();

    const yeni = new YdsDB(ad);
    expect(await yeni.testler.count()).toBe(1);
    expect(await yeni.cevaplar.get(1)).toMatchObject({ soru_id: 'a', dogru_mu: true });
    expect((await yeni.ayarlar.get('ayarlar'))?.tema).toBe('koyu');
    expect(await yeni.teshis_plani.count()).toBe(1);
    expect(await yeni.paket.count()).toBe(0);
    yeni.close();
  });

  it('v2 verisi (indirilmiş paket dahil) v3 şemasında korunur; yeni tablolar boş açılır', async () => {
    const ad = 'gecis-v2';
    const eski = new Dexie(ad);
    eski.version(1).stores({ testler: '++id, tip, durum', cevaplar: '++id, test_id, soru_id, konu', ayarlar: 'id', teshis_plani: 'sira_no' });
    eski.version(2).stores({ paket: 'id' });
    await eski.table('cevaplar').add({ test_id: 1, soru_id: 'a', konu: 'gr.zaman', dogru_mu: false, tarih: 1 });
    await eski.table('paket').put({ id: 'soru', surum: 'x', tarih: 1, sorular: [] });
    eski.close();

    const yeni = new YdsDB(ad);
    expect(await yeni.cevaplar.count()).toBe(1);
    expect((await yeni.paket.get('soru'))?.surum).toBe('x');
    expect(await yeni.isaretler.count()).toBe(0);
    expect(await yeni.kelimeler.count()).toBe(0);
    expect(await yeni.gunluk.count()).toBe(0);
    yeni.close();
  });
});
