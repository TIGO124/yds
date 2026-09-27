import type { Ayarlar, CevapKaydi, GunlukKaydi, IsaretKaydi, KelimeKaydi, TeshisTesti, TestKaydi } from '../types';

export interface Yedek {
  uygulama: 'yds';
  /** 1: ilk biçim; 2: işaretlenen sorular, kelime defteri ve çalışma günlüğü eklendi */
  surum: 1 | 2;
  tarih: number;
  testler: TestKaydi[];
  cevaplar: CevapKaydi[];
  ayarlar: Ayarlar[];
  teshis_plani: TeshisTesti[];
  isaretler?: IsaretKaydi[];
  kelimeler?: KelimeKaydi[];
  gunluk?: GunlukKaydi[];
}

/** Dışarıdan gelen yedek dosyasını doğrular (sistem sınırı). */
export function yedekDogrula(veri: unknown): Yedek {
  const hata = (m: string): never => {
    throw new Error(`Geçersiz yedek dosyası: ${m}`);
  };
  if (!veri || typeof veri !== 'object') hata('JSON nesnesi değil');
  const y = veri as Record<string, unknown>;
  if (y.uygulama !== 'yds') hata('bu uygulamaya ait değil');
  if (y.surum !== 1 && y.surum !== 2) hata('desteklenmeyen sürüm');
  const alanlar = ['testler', 'cevaplar', 'ayarlar', 'teshis_plani', ...(y.surum === 2 ? ['isaretler', 'kelimeler', 'gunluk'] : [])];
  for (const alan of alanlar) {
    if (!Array.isArray(y[alan])) hata(`'${alan}' listesi eksik`);
  }
  for (const t of y.testler as TestKaydi[]) {
    if (typeof t?.id !== 'number' || !Array.isArray(t.soru_idleri) || !Array.isArray(t.secimler)) hata('test kaydı bozuk');
  }
  for (const c of y.cevaplar as CevapKaydi[]) {
    if (typeof c?.test_id !== 'number' || typeof c.soru_id !== 'string' || typeof c.dogru_mu !== 'boolean') hata('cevap kaydı bozuk');
  }
  for (const p of y.teshis_plani as TeshisTesti[]) {
    if (typeof p?.sira_no !== 'number' || !Array.isArray(p.soru_idleri)) hata('teşhis planı bozuk');
  }
  for (const a of y.ayarlar as Ayarlar[]) {
    if (!a || a.id !== 'ayarlar') hata('ayar kaydı bozuk');
  }
  if (y.surum === 2) {
    for (const i of y.isaretler as IsaretKaydi[]) {
      if (typeof i?.soru_id !== 'string' || typeof i.tarih !== 'number') hata('işaret kaydı bozuk');
    }
    for (const k of y.kelimeler as KelimeKaydi[]) {
      const sayilar = [k?.kutu, k?.sonraki, k?.eklenme].every((n) => typeof n === 'number');
      if (typeof k?.kelime !== 'string' || !k.kelime || typeof k.anlam !== 'string' || typeof k.baglam !== 'string' || !sayilar) {
        hata('kelime kaydı bozuk');
      }
    }
    for (const g of y.gunluk as GunlukKaydi[]) {
      if (typeof g?.tarih !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(g.tarih) || typeof g.kart !== 'number') hata('günlük kaydı bozuk');
    }
  }
  return y as unknown as Yedek;
}
