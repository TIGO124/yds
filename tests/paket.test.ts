import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { BANKA_SURUMU, KONULAR, SORULAR, SORU_MAP, TAKSONOMI, paketUygula } from '../src/data/bank';
import { kayitliPaketiUygula, yeniSorulariDenetle } from '../src/data/guncelleme';
import { paketDogrula } from '../src/data/paket';
import { YdsDB } from '../src/db/db';
import { Depo } from '../src/db/depo';
import type { Soru } from '../src/types';

const yeniSoru: Soru = {
  id: 'gr.zaman-9001',
  bolum: 'gr',
  konu: 'gr.zaman',
  alt_konu: 'Simple Present',
  zorluk: 1,
  soru: 'She ---- to work every day.',
  secenekler: ['walks', 'walk', 'walked', 'walking', 'has walk'],
  dogru: 0,
  aciklama: 'Genel alışkanlık → Simple Present.',
  paragraf_id: null,
};

const paket = (sorular: unknown[], surum = 'yeni-surum') => ({
  surum,
  tarih: Date.now() + 60_000,
  taksonomi: TAKSONOMI,
  paragraflar: [],
  sorular,
});

/** Sahte sunucu: sürüm dosyası ve paket. */
const sunucu =
  (p: unknown, durum = 200) =>
  async (url: string) => {
    const govde = url.endsWith('surum.json') ? { surum: (p as { surum: string }).surum, tarih: (p as { tarih: number }).tarih } : p;
    return new Response(JSON.stringify(govde), { status: durum });
  };

let n = 0;
const yeniDepo = () => new Depo(new YdsDB(`paket-${++n}`), { sorular: SORULAR, konular: KONULAR });

describe('soru paketi', () => {
  it('bozuk paketi reddeder, geçersiz soruları ayıklar', () => {
    expect(paketDogrula(null)).toBeNull();
    expect(paketDogrula({ surum: 'x' })).toBeNull();
    const p = paketDogrula(paket([yeniSoru, { ...yeniSoru, id: 'bozuk', secenekler: ['a'] }, { ...yeniSoru, id: 'x', konu: 'yok' }]))!;
    expect(p.sorular.map((s) => s.id)).toEqual(['gr.zaman-9001']);
  });

  it('aynı sürüm ya da eski paket indirilmez', async () => {
    const depo = yeniDepo();
    expect(await yeniSorulariDenetle(depo, sunucu(paket([], BANKA_SURUMU)))).toEqual({ durum: 'guncel' });
    expect(await yeniSorulariDenetle(depo, sunucu({ ...paket([yeniSoru]), tarih: 1 }))).toEqual({ durum: 'guncel' });
    expect(await depo.db.paket.count()).toBe(0);
  });

  it('ağ hatası ya da bozuk paket bankayı değiştirmez', async () => {
    const depo = yeniDepo();
    const once = SORULAR.length;
    expect((await yeniSorulariDenetle(depo, sunucu(paket([yeniSoru]), 500))).durum).toBe('hata');
    expect((await yeniSorulariDenetle(depo, sunucu(paket([{ bozuk: true }])))).durum).toBe('hata');
    expect((await yeniSorulariDenetle(depo, async () => Promise.reject(new TypeError('Failed to fetch')))).durum).toBe('hata');
    expect(SORULAR.length).toBe(once);
  });

  it('yeni paketi indirir, kaydeder, bankaya ekler; ilerleme korunur; açılışta yeniden uygulanır', async () => {
    const depo = yeniDepo();
    const id = await depo.sonrakiTestiBaslat();
    const once = SORULAR.length;

    const s = await yeniSorulariDenetle(depo, sunucu(paket([...SORULAR.slice(0, 3), yeniSoru])));
    expect(s).toEqual({ durum: 'guncellendi', yeni: 1 });
    expect(SORULAR.length).toBe(once + 1);
    expect(SORU_MAP.get('gr.zaman-9001')?.soru).toContain('every day');
    expect((await depo.db.paket.get('soru'))?.sorular).toHaveLength(4);
    expect((await depo.aktifTest())?.id).toBe(id);

    // Uygulama yeniden açıldığında (aynı veritabanı) kayıtlı paket internetsiz uygulanır; tekrar eklemez.
    expect(await kayitliPaketiUygula(new Depo(depo.db, { sorular: SORULAR, konular: KONULAR }))).toBe(0);
    expect(paketUygula(paketDogrula(paket([yeniSoru]))!)).toBe(0);
  });
});
