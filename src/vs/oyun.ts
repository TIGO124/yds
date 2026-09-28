// VS düellosu: eşleştirme ve tur zamanlamasının saf mantığı (ağdan bağımsız, test edilebilir).
import { karistir, type Rng } from '../engine/rng';
import type { Soru } from '../types';

export const VS = {
  /** Eşleşme verisinin biçimi; farklı sürümdeki uygulamalar eşleşmez. */
  SURUM: 1,
  SORU_SAYISI: 10,
  SORU_SURE: 30_000,
  /** Cevapların gösterildiği ara */
  ACIKLAMA_SURE: 3_500,
  /** İki oyuncu hazır olduktan sonra ilk soruya kadar */
  GERI_SAYIM: 4_000,
  /** Bekleyen oyuncu kaydını bu aralıkla tazeler */
  NABIZ: 15_000,
  /** Bu kadar süredir tazelenmeyen bekleme kaydı terk edilmiş sayılır */
  ESKIME: 45_000,
  /** Rakip bu sürede maça gelmezse eşleşme iptal edilir */
  HAZIR_BEKLEME: 12_000,
  /** Maç sırasında rakibin bağlantısı bu kadar kopuk kalırsa oyun biter */
  KOPUK_SINIR: 20_000,
} as const;

/** Bölüm başına soru sayısı: kısa, parçasız sorular (okuma/cloze/paragraf düelloya uzun kalır). */
const DAGILIM: [bolum: string, adet: number][] = [
  ['kel', 3],
  ['gr', 3],
  ['tamamlama', 2],
  ['yakin_anlam', 1],
  ['diyalog', 1],
];

// ---------- Eşleştirme kuyruğu ----------

export interface KuyrukKaydi {
  ad: string;
  zaman: number;
  surum: number;
  /** Başka bir oyuncu bu kaydı eşleştirdiğinde maç kimliği yazılır */
  mac?: string | null;
}
export type Kuyruk = Record<string, KuyrukKaydi>;

export type KuyrukSonucu =
  /** Rakip yok: kuyruğa girildi (ya da kayıt tazelendi) */
  | { tip: 'bekle' }
  /** Bekleyen bir rakip bulundu; maçı bu oyuncu kurar */
  | { tip: 'eslesti'; rakip: string; rakipAd: string; macId: string }
  /** Bekleyen bu oyuncuyu başka biri eşleştirmiş */
  | { tip: 'eslestirildi'; macId: string };

/**
 * Kuyruğun tamamı üzerinde tek bir atomik adım (veritabanı işleminin içinde çalışır; birkaç kez çağrılabilir).
 * Terk edilmiş kayıtları temizler; bekleyen en eski rakibi eşleştirir, yoksa oyuncuyu kuyruğa yazar.
 */
export function kuyrukAdimi(
  kuyruk: Kuyruk | null,
  ben: { uid: string; ad: string },
  macId: string,
  simdi: number,
): { kuyruk: Kuyruk; sonuc: KuyrukSonucu } {
  const yeni: Kuyruk = {};
  for (const [uid, k] of Object.entries(kuyruk ?? {})) {
    if (!k || typeof k.ad !== 'string' || typeof k.zaman !== 'number') continue;
    if (simdi - k.zaman > VS.ESKIME) continue;
    yeni[uid] = { ...k };
  }

  const benim = yeni[ben.uid];
  if (benim?.mac) {
    delete yeni[ben.uid];
    return { kuyruk: yeni, sonuc: { tip: 'eslestirildi', macId: benim.mac } };
  }

  const rakip = Object.entries(yeni)
    .filter(([uid, k]) => uid !== ben.uid && !k.mac && k.surum === VS.SURUM)
    .sort((a, b) => a[1].zaman - b[1].zaman || (a[0] < b[0] ? -1 : 1))[0];
  if (rakip) {
    const [uid, k] = rakip;
    yeni[uid] = { ...k, mac: macId };
    delete yeni[ben.uid];
    return { kuyruk: yeni, sonuc: { tip: 'eslesti', rakip: uid, rakipAd: k.ad, macId } };
  }

  yeni[ben.uid] = { ad: ben.ad, zaman: simdi, surum: VS.SURUM, mac: null };
  return { kuyruk: yeni, sonuc: { tip: 'bekle' } };
}

// ---------- Maç ----------

/** Maça gömülen soru: iki cihazın bankası farklı sürümde olsa da aynı soruyu görsünler. */
export type VsSoru = Omit<Soru, 'paragraf_id'>;

/** Bir sorunun cevabı: s = seçilen şık, ms = soru açıldıktan sonra geçen süre. */
export interface VsCevap {
  s: number;
  ms: number;
}

export interface Mac {
  surum: number;
  olusturma: number;
  kurucu: string;
  oyuncular: Record<string, { ad: string }>;
  sorular: VsSoru[];
  /** Maç ekranını açan oyuncular */
  hazir?: Record<string, boolean>;
  /** İlk sorunun açıldığı an (sunucu saati); iki oyuncu hazır olunca kurucu yazar */
  basla?: number;
  /** Rakip zamanında gelmedi */
  iptal?: boolean;
  /** Veritabanı seyrek dizileri nesne olarak da döndürebilir */
  cevaplar?: Record<string, Record<string, VsCevap> | (VsCevap | null)[]>;
  cikti?: Record<string, boolean>;
  bagli?: Record<string, boolean>;
  bitti?: Record<string, boolean>;
}

export function vsSorulariSec(sorular: readonly Soru[], rng: Rng): VsSoru[] {
  const secilen: Soru[] = [];
  for (const [bolum, adet] of DAGILIM) {
    const adaylar = sorular.filter((s) => s.bolum === bolum && !s.paragraf_id);
    secilen.push(...karistir(adaylar, rng).slice(0, adet));
  }
  // Bir bölüm eksik kalırsa (küçük banka) kalan yerler diğer kısa sorulardan dolar.
  if (secilen.length < VS.SORU_SAYISI) {
    const alinan = new Set(secilen.map((s) => s.id));
    const kalan = sorular.filter((s) => !s.paragraf_id && !alinan.has(s.id));
    secilen.push(...karistir(kalan, rng).slice(0, VS.SORU_SAYISI - secilen.length));
  }
  return karistir(secilen, rng).map(({ paragraf_id: _p, ...s }) => s);
}

export function macOlustur(
  kurucu: { uid: string; ad: string },
  rakip: { uid: string; ad: string },
  sorular: VsSoru[],
  simdi: number,
): Mac {
  return {
    surum: VS.SURUM,
    olusturma: simdi,
    kurucu: kurucu.uid,
    oyuncular: { [kurucu.uid]: { ad: kurucu.ad }, [rakip.uid]: { ad: rakip.ad } },
    sorular,
  };
}

/** Oyuncunun cevapları (soru sırası → cevap); süresi geçmiş cevaplar sayılmaz. */
export function cevaplar(mac: Mac, uid: string): Map<number, VsCevap> {
  const ham = mac.cevaplar?.[uid];
  const sonuc = new Map<number, VsCevap>();
  if (!ham) return sonuc;
  for (const [anahtar, c] of Object.entries(ham)) {
    if (!c || typeof c.s !== 'number' || typeof c.ms !== 'number' || c.ms < 0 || c.ms >= VS.SORU_SURE) continue;
    sonuc.set(Number(anahtar), c);
  }
  return sonuc;
}

/** Doğru cevap 100 puan + hıza göre 50'ye kadar ek puan; yanlış ya da boş 0. */
export function puan(soru: Pick<VsSoru, 'dogru'>, cevap: VsCevap | undefined): number {
  if (!cevap || cevap.s !== soru.dogru) return 0;
  return 100 + Math.round(50 * Math.max(0, 1 - cevap.ms / VS.SORU_SURE));
}

export const rakipUid = (mac: Mac, ben: string) => Object.keys(mac.oyuncular).find((u) => u !== ben) ?? '';

export type Asama =
  | { tip: 'hazirlaniyor' }
  | { tip: 'geri_sayim'; bitis: number }
  | { tip: 'soru'; i: number; baslangic: number; bitis: number }
  | { tip: 'aciklama'; i: number; bitis: number }
  | { tip: 'bitti' };

/**
 * Maçın şu anki aşaması. Soru, iki oyuncu da cevaplayınca ya da süre dolunca kapanır;
 * kısa bir açıklama arasından sonra sıradaki soru açılır. Zamanlar yalnızca maç verisinden
 * türetildiği için iki cihaz aynı sonuca varır.
 */
export function asamaHesapla(mac: Mac, simdi: number): Asama {
  if (mac.basla === undefined) return { tip: 'hazirlaniyor' };
  const uidler = Object.keys(mac.oyuncular);
  const tum = uidler.map((u) => cevaplar(mac, u));
  let baslangic = mac.basla + VS.GERI_SAYIM;
  if (simdi < baslangic) return { tip: 'geri_sayim', bitis: baslangic };
  for (let i = 0; i < mac.sorular.length; i++) {
    const sure = baslangic + VS.SORU_SURE;
    const hepsi = tum.every((c) => c.has(i));
    const kapanis = hepsi ? baslangic + Math.max(...tum.map((c) => c.get(i)!.ms)) : sure;
    if (simdi < kapanis) return { tip: 'soru', i, baslangic, bitis: sure };
    const araBitis = kapanis + VS.ACIKLAMA_SURE;
    if (simdi < araBitis) return { tip: 'aciklama', i, bitis: araBitis };
    baslangic = araBitis;
  }
  return { tip: 'bitti' };
}

/** Sonucu açıklanmış soru sayısı: skor tablosu yalnızca bunları sayar (rakibin cevabı erken görünmesin). */
export function kapananSoru(a: Asama, toplam: number): number {
  if (a.tip === 'soru') return a.i;
  if (a.tip === 'aciklama') return a.i + 1;
  if (a.tip === 'bitti') return toplam;
  return 0;
}

export function skor(mac: Mac, uid: string, kapanan = mac.sorular.length): number {
  const c = cevaplar(mac, uid);
  let toplam = 0;
  for (let i = 0; i < kapanan; i++) toplam += puan(mac.sorular[i], c.get(i));
  return toplam;
}

export function dogruSayisi(mac: Mac, uid: string): number {
  const c = cevaplar(mac, uid);
  return mac.sorular.filter((s, i) => c.get(i)?.s === s.dogru).length;
}

/** Takma ad: baştaki/sondaki boşluk atılır, en çok 16 karakter. */
export function adTemizle(ad: string): string {
  return ad.replace(/\s+/g, ' ').trim().slice(0, 16);
}
