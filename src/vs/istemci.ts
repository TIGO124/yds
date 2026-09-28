// VS akışı: rakip arama (kuyruk) ve maç oturumu. Arayüzden bağımsız; testlerde bellek sunucusuyla çalışır.
import type { Rng } from '../engine/rng';
import type { Soru } from '../types';
import { yeniKimlik, type VsBaglanti } from './baglanti';
import {
  VS,
  asamaHesapla,
  cevaplar,
  kuyrukAdimi,
  macOlustur,
  rakipUid,
  vsSorulariSec,
  type Asama,
  type Kuyruk,
  type KuyrukSonucu,
  type Mac,
} from './oyun';

export type AramaOlayi = { tip: 'eslesti'; macId: string } | { tip: 'hata'; mesaj: string };

const KUYRUK = 'vs/kuyruk';
const macYolu = (id: string) => `vs/maclar/${id}`;

/**
 * Rakip arar: bekleyen biri varsa hemen eşleşir (maçı bu cihaz kurar), yoksa kuyruğa girer ve
 * eşleştirilmeyi bekler. Döndürülen fonksiyon aramayı iptal eder.
 */
export function rakipAra(
  b: VsBaglanti,
  ad: string,
  sorular: () => readonly Soru[],
  olay: (o: AramaOlayi) => void,
  rng: Rng = Math.random,
): () => void {
  const kayit = `${KUYRUK}/${b.uid}`;
  let bitti = false;
  let nabiz: ReturnType<typeof setInterval> | undefined;
  let kayitDinle: (() => void) | undefined;

  const kapat = () => {
    bitti = true;
    clearInterval(nabiz);
    kayitDinle?.();
    void b.kopuncaIptal(kayit).catch(() => undefined);
  };
  const bulundu = (macId: string) => {
    if (bitti) return;
    kapat();
    olay({ tip: 'eslesti', macId });
  };

  const adim = async () => {
    if (bitti) return;
    const macId = yeniKimlik();
    let sonuc: KuyrukSonucu = { tip: 'bekle' };
    const tamam = await b.islem<Kuyruk>(KUYRUK, (k) => {
      const r = kuyrukAdimi(k, { uid: b.uid, ad }, macId, b.simdi());
      sonuc = r.sonuc;
      return r.kuyruk;
    });
    if (!tamam) throw new Error('Eşleşme sırası güncellenemedi.');
    const s = sonuc as KuyrukSonucu;
    if (bitti) {
      // Arama bu sırada iptal edildiyse kuyrukta kalmayalım.
      if (s.tip === 'bekle') await b.yaz(kayit, null);
      return;
    }
    if (s.tip === 'eslesti') {
      const mac = macOlustur({ uid: b.uid, ad }, { uid: s.rakip, ad: s.rakipAd }, vsSorulariSec(sorular(), rng), b.simdi());
      await b.yaz(macYolu(s.macId), mac);
      bulundu(s.macId);
    } else if (s.tip === 'eslestirildi') {
      bulundu(s.macId);
    } else {
      await b.kopunca(kayit, null);
      kayitDinle ??= b.dinle<string>(`${kayit}/mac`, (m) => {
        if (!m || bitti) return;
        void b.yaz(kayit, null).catch(() => undefined);
        bulundu(m);
      });
    }
  };

  const hata = (e: unknown) => {
    if (bitti) return;
    kapat();
    olay({ tip: 'hata', mesaj: e instanceof Error ? e.message : String(e) });
  };
  adim().catch(hata);
  // Bekleyen kayıt tazelenir; aynı adım terk edilmiş kayıtları da temizler.
  nabiz = setInterval(() => void adim().catch(hata), VS.NABIZ);

  return () => {
    if (bitti) return;
    kapat();
    void b.yaz(kayit, null).catch(() => undefined);
  };
}

export type MacDurumu =
  | { tip: 'yukleniyor' }
  /** Rakip zamanında gelmedi; yeniden aranmalı */
  | { tip: 'iptal' }
  | { tip: 'rakip_cikti' }
  | { tip: 'rakip_koptu' }
  | { tip: 'oyun'; asama: Asama };

/** Tek bir maç: hazır olma, başlatma, cevaplar, bağlantı takibi ve bitince temizlik. */
export class MacOturumu {
  mac: Mac | null = null;
  private kapatilacak: (() => void)[] = [];
  private zamanlayici: ReturnType<typeof setInterval> | undefined;
  private rakipKopukBeri: number | null = null;
  private bittiYazildi = false;
  private silindi = false;
  private yol: string;

  constructor(
    private b: VsBaglanti,
    readonly macId: string,
    private degisti: () => void,
  ) {
    this.yol = macYolu(macId);
  }

  get uid() {
    return this.b.uid;
  }

  baslat(): void {
    this.kapatilacak.push(
      this.b.dinle<Mac>(this.yol, (m) => {
        // Maç bitince silinir; son hâli ekranda kalsın.
        if (m) this.mac = m;
        this.denetle();
        this.degisti();
      }),
      this.b.baglantiDinle((bagli) => {
        if (bagli && this.mac) void this.varligiBildir();
      }),
    );
    this.zamanlayici = setInterval(() => {
      this.denetle();
      this.degisti();
    }, 500);
  }

  kapat(): void {
    clearInterval(this.zamanlayici);
    for (const k of this.kapatilacak.splice(0)) k();
    void this.b.kopuncaIptal(`${this.yol}/bagli/${this.uid}`).catch(() => undefined);
  }

  private async varligiBildir() {
    await this.b.kopunca(`${this.yol}/bagli/${this.uid}`, false);
    await this.b.yaz(`${this.yol}/bagli/${this.uid}`, true);
  }

  durum(simdi = this.b.simdi()): MacDurumu {
    const m = this.mac;
    if (!m) return { tip: 'yukleniyor' };
    const asama = asamaHesapla(m, simdi);
    if (asama.tip === 'bitti') return { tip: 'oyun', asama };
    if (m.iptal) return { tip: 'iptal' };
    const rakip = rakipUid(m, this.uid);
    // Maç başlamadan çıkan rakip yüzünden kimse kazanmış sayılmaz: yeniden aranır.
    if (m.cikti?.[rakip]) return m.basla === undefined ? { tip: 'iptal' } : { tip: 'rakip_cikti' };
    if (this.rakipKopukBeri !== null && simdi - this.rakipKopukBeri >= VS.KOPUK_SINIR) return { tip: 'rakip_koptu' };
    return { tip: 'oyun', asama };
  }

  /** Rakibin bağlantısı şu an kopuk mu (henüz süre dolmadıysa uyarı için) */
  get rakipKopuk(): boolean {
    return this.rakipKopukBeri !== null;
  }

  private denetle(): void {
    const m = this.mac;
    if (!m) return;
    const simdi = this.b.simdi();
    const rakip = rakipUid(m, this.uid);

    if (!m.hazir?.[this.uid] && !m.iptal) {
      void this.b.yaz(`${this.yol}/hazir/${this.uid}`, true).catch(() => undefined);
      void this.varligiBildir().catch(() => undefined);
    }
    // İki oyuncu da hazırsa maçı kuran başlatır; rakip gelmezse eşleşme iptal edilir.
    if (m.basla === undefined && !m.iptal) {
      if (m.kurucu === this.uid && m.hazir?.[this.uid] && m.hazir?.[rakip]) {
        void this.b.yaz(`${this.yol}/basla`, simdi).catch(() => undefined);
      } else if (simdi - m.olusturma > VS.HAZIR_BEKLEME) {
        void this.b.yaz(`${this.yol}/iptal`, true).catch(() => undefined);
      }
    }

    if (m.basla !== undefined && m.bagli?.[rakip] === false) this.rakipKopukBeri ??= simdi;
    else this.rakipKopukBeri = null;

    const d = this.durum(simdi);
    const bitti = (d.tip === 'oyun' && d.asama.tip === 'bitti') || d.tip === 'rakip_cikti' || d.tip === 'rakip_koptu';
    if (bitti && !this.bittiYazildi) {
      this.bittiYazildi = true;
      void this.b.yaz(`${this.yol}/bitti/${this.uid}`, true).catch(() => undefined);
    }
    // İki taraf da sonucu gördüyse (ya da rakip çıktıysa) maç kaydı silinir; veritabanı şişmesin.
    const silinsin = m.bitti?.[this.uid] && ((m.bitti?.[rakip] && m.kurucu === this.uid) || m.cikti?.[rakip]);
    if (silinsin && !this.silindi) {
      this.silindi = true;
      void this.b.yaz(this.yol, null).catch(() => undefined);
    }
  }

  /** Açık sorudaki cevabı gönderir; soru kapandıysa ya da zaten cevaplandıysa yok sayar. */
  cevapla(i: number, secim: number): boolean {
    const m = this.mac;
    if (!m) return false;
    const simdi = this.b.simdi();
    const a = asamaHesapla(m, simdi);
    if (a.tip !== 'soru' || a.i !== i || cevaplar(m, this.uid).has(i)) return false;
    const cevap = { s: secim, ms: Math.max(0, Math.min(VS.SORU_SURE - 1, Math.round(simdi - a.baslangic))) };
    // Yerel kopya hemen güncellensin (sunucu yankısını beklemeden).
    const benim = { ...(m.cevaplar?.[this.uid] ?? {}) } as Record<string, typeof cevap>;
    benim[String(i)] = cevap;
    this.mac = { ...m, cevaplar: { ...m.cevaplar, [this.uid]: benim } };
    void this.b.yaz(`${this.yol}/cevaplar/${this.uid}/${i}`, cevap).catch(() => undefined);
    this.degisti();
    return true;
  }

  /** Oyundan çıkış: rakip hükmen kazanır. */
  async cik(): Promise<void> {
    if (this.mac && !this.bittiYazildi) await this.b.yaz(`${this.yol}/cikti/${this.uid}`, true).catch(() => undefined);
    this.kapat();
  }
}
