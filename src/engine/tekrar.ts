import { CONFIG } from './config';

/**
 * Aralıklı tekrar (Leitner kutuları). Yanlış cevaplanan soru ve deftere eklenen kelime kutu 0'dan başlar;
 * her doğru cevap bir kutu ilerletir, yanlış cevap başa döndürür. Kutu, aralık sayısına ulaşınca öğrenilmiş sayılır.
 */
export const OGRENILDI = CONFIG.TEKRAR_ARALIKLARI_GUN.length;

/** Yerel takvimde verilen anın gününden n gün sonraki gece yarısı. */
export function gunSonra(an: number, n: number): number {
  const d = new Date(an);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n).getTime();
}

export interface KutuDurumu {
  kutu: number;
  /** Bu andan (ms) itibaren sırası gelir */
  sonraki: number;
}

/** Bir tekrar adımı: doğru → bir sonraki kutu, yanlış → kutu 0 (ertesi gün). */
export function kutuIlerlet(kutu: number, dogru: boolean, an: number): KutuDurumu {
  const yeni = dogru ? Math.min(kutu + 1, OGRENILDI) : 0;
  return { kutu: yeni, sonraki: yeni >= OGRENILDI ? an : gunSonra(an, CONFIG.TEKRAR_ARALIKLARI_GUN[yeni]) };
}

export interface SoruTekrari extends KutuDurumu {
  soru_id: string;
}

/**
 * Kronolojik cevaplardan tekrardaki sorular: en az bir kez yanlış/boş bırakılmış ve henüz öğrenilmemiş.
 * Hiç yanlış yapılmamış soru tekrara girmez; öğrenilen soru yeniden yanlışlanırsa baştan başlar.
 */
export function tekrarDurumlari(
  cevaplar: readonly { soru_id: string; dogru_mu: boolean; tarih: number }[],
): Map<string, SoruTekrari> {
  const m = new Map<string, SoruTekrari>();
  for (const c of cevaplar) {
    const d = m.get(c.soru_id);
    if (!d && c.dogru_mu) continue;
    const y = kutuIlerlet(d?.kutu ?? 0, c.dogru_mu, c.tarih);
    if (y.kutu >= OGRENILDI) m.delete(c.soru_id);
    else m.set(c.soru_id, { soru_id: c.soru_id, ...y });
  }
  return m;
}

/** Sırası gelmiş kayıtlar, en çok geciken önce. */
export function siradakiler<T extends KutuDurumu>(kayitlar: Iterable<T>, simdi: number): T[] {
  return [...kayitlar].filter((k) => k.kutu < OGRENILDI && k.sonraki <= simdi).sort((a, b) => a.sonraki - b.sonraki);
}

/** Bugünden itibaren kaç gün sonra sırası gelir (gecikmişler 0). */
export function kacGunSonra(sonraki: number, bugun: Date): number {
  let gun = 0;
  while (gun < 366 && sonraki >= gunSonra(bugun.getTime(), gun + 1)) gun++;
  return gun;
}

/** Önümüzdeki günlerde sırası gelecek kayıt sayıları; 0. gün bugündür ve gecikmişleri de içerir. */
export function tekrarTakvimi(kayitlar: Iterable<KutuDurumu>, bugun: Date, gunSayisi = 7): number[] {
  const takvim = Array<number>(gunSayisi).fill(0);
  for (const k of kayitlar) {
    if (k.kutu >= OGRENILDI) continue;
    const gun = kacGunSonra(k.sonraki, bugun);
    if (gun < gunSayisi) takvim[gun]++;
  }
  return takvim;
}

/** "Sırada", "yarın", "3 gün sonra" */
export function sonrakiMetni(sonraki: number, simdi: Date): string {
  if (sonraki <= simdi.getTime()) return 'Sırada';
  const gun = kacGunSonra(sonraki, simdi);
  return gun === 0 ? 'Bugün' : gun === 1 ? 'Yarın' : `${gun} gün sonra`;
}
