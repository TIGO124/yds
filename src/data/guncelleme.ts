import type { Depo } from '../db/depo';
import { BANKA_SURUMU, BANKA_TARIHI, etkinBankaSurumu, paketUygula } from './bank';
import { paketDogrula } from './paket';

/** GitHub Pages'teki web sürümü; derleme her seferinde yanına soru paketini koyar. */
export const PAKET_ADRESI = 'https://tigo124.github.io/yds/';

export type DenetimSonucu =
  | { durum: 'guncel' }
  | { durum: 'guncellendi'; yeni: number }
  | { durum: 'hata'; mesaj: string };

type Getir = (url: string, secenek?: RequestInit) => Promise<Response>;

/** Açılışta: daha önce indirilmiş ve gömülü bankadan yeni olan paketi uygular (internet gerekmez). */
export async function kayitliPaketiUygula(depo: Depo): Promise<number> {
  try {
    const k = await depo.db.paket.get('soru');
    if (!k || k.tarih <= BANKA_TARIHI || k.surum === BANKA_SURUMU) return 0;
    const p = paketDogrula(k);
    if (!p) return 0;
    const yeni = paketUygula(p);
    depo.bankaYenilendi();
    return yeni;
  } catch {
    return 0;
  }
}

async function zamanAsimli(getir: Getir, url: string, ms = 15_000): Promise<Response> {
  const kontrol = new AbortController();
  const z = setTimeout(() => kontrol.abort(), ms);
  try {
    const cevap = await getir(url, { cache: 'no-store', signal: kontrol.signal });
    if (!cevap.ok) throw new Error(`Sunucu ${cevap.status} döndürdü`);
    return cevap;
  } finally {
    clearTimeout(z);
  }
}

/**
 * İnternetteki soru paketini denetler; daha yeniyse indirip doğrular, cihaza kaydeder ve
 * bankaya hemen ekler. İlerleme (testler, cevaplar) ayrı tablolarda olduğu için etkilenmez.
 */
export async function yeniSorulariDenetle(depo: Depo, getir: Getir = (u, s) => fetch(u, s)): Promise<DenetimSonucu> {
  try {
    const meta = (await (await zamanAsimli(getir, `${PAKET_ADRESI}soru-paketi-surum.json`)).json()) as {
      surum?: unknown;
      tarih?: unknown;
    };
    if (typeof meta.surum !== 'string' || typeof meta.tarih !== 'number') throw new Error('Sürüm bilgisi okunamadı');
    // Aynı içerik ya da uygulamanın kendisinden eski bir paket: yapılacak bir şey yok.
    if (meta.surum === etkinBankaSurumu || meta.surum === BANKA_SURUMU || meta.tarih <= BANKA_TARIHI) return { durum: 'guncel' };

    const paket = paketDogrula(await (await zamanAsimli(getir, `${PAKET_ADRESI}soru-paketi.json`, 60_000)).json());
    if (!paket || paket.sorular.length === 0) throw new Error('İndirilen paket geçersiz');
    await depo.db.paket.put({ id: 'soru', ...paket });
    const yeni = paketUygula(paket);
    depo.bankaYenilendi();
    return { durum: 'guncellendi', yeni };
  } catch (e) {
    const mesaj = e instanceof DOMException && e.name === 'AbortError' ? 'Bağlantı zaman aşımına uğradı' : e instanceof Error ? e.message : String(e);
    return { durum: 'hata', mesaj };
  }
}
