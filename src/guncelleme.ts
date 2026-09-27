import { PAKET_ADRESI, zamanAsimli, type Getir } from './data/guncelleme';

/**
 * Uygulama güncellemeleri. Veriler (testler, cevaplar, ayarlar) cihazdaki IndexedDB'de durur;
 * güncelleme yalnızca uygulama dosyalarını değiştirir, veritabanına dokunmaz.
 *  - Web/iPhone: yeni service worker hazır olunca bant gösterilir, kullanıcı onaylayınca yenilenir.
 *  - Android: surum.json'daki sürüm daha yeniyse aynı imzalı yeni APK indirilir; Android bunu
 *    güncelleme olarak kurar ve uygulama verisi korunur.
 */
export const UYGULAMA_SURUMU: string = __UYGULAMA_SURUMU__;
const ANDROID = import.meta.env.MODE === 'android';
const ARTIFACT = import.meta.env.MODE === 'artifact';

/** 1.2.10 > 1.2.9 gibi; a > b ise 1. */
export function surumKarsilastir(a: string, b: string): number {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    const fark = (pa[i] || 0) - (pb[i] || 0);
    if (fark) return Math.sign(fark);
  }
  return 0;
}

export type Guncelleme =
  | { tur: 'web'; uygula: () => void }
  | { tur: 'android'; surum: string; notlar: string[]; adres: string };

let bekleyen: Guncelleme | null = null;
const dinleyiciler = new Set<(g: Guncelleme | null) => void>();

export function guncellemeBildir(g: Guncelleme | null): void {
  bekleyen = g;
  dinleyiciler.forEach((f) => f(g));
}
export const bekleyenGuncelleme = () => bekleyen;
export function guncellemeyiDinle(f: (g: Guncelleme | null) => void): () => void {
  dinleyiciler.add(f);
  return () => dinleyiciler.delete(f);
}

// ---------- Web (PWA) ----------
let swKaydi: ServiceWorkerRegistration | undefined;

export async function webGuncellemeKur(): Promise<void> {
  if (!('serviceWorker' in navigator)) return;
  const { registerSW } = await import('virtual:pwa-register');
  const guncelle = registerSW({
    onNeedRefresh() {
      guncellemeBildir({ tur: 'web', uygula: () => void guncelle(true) });
    },
    onRegisteredSW(_adres, kayit) {
      swKaydi = kayit;
      // Uygulama uzun süre açık kalsa da saatte bir yeni sürüme bak.
      if (kayit) setInterval(() => kayit.update().catch(() => undefined), 60 * 60 * 1000);
    },
  });
}

// ---------- Android ----------
export interface SurumBilgisi {
  surum: string;
  apk: string | null;
  notlar: string[];
}

export function surumBilgisiDogrula(v: unknown): SurumBilgisi | null {
  if (!v || typeof v !== 'object') return null;
  const b = v as Record<string, unknown>;
  if (typeof b.surum !== 'string' || !/^\d+\.\d+\.\d+$/.test(b.surum)) return null;
  // Yalnızca sitedeki göreli yol (ör. indir/YDS-Calisma.apk); başka siteye ya da üst klasöre çıkamaz.
  const apk = typeof b.apk === 'string' && /^\w[\w-]*(\/\w[\w-]*)*\.apk$/.test(b.apk) ? b.apk : null;
  const notlar = Array.isArray(b.notlar) ? b.notlar.filter((n): n is string => typeof n === 'string').slice(0, 10) : [];
  return { surum: b.surum, apk, notlar };
}

export async function androidSurumDenetle(getir: Getir = (u, s) => fetch(u, s)): Promise<'var' | 'guncel'> {
  const bilgi = surumBilgisiDogrula(await (await zamanAsimli(getir, `${PAKET_ADRESI}surum.json`)).json());
  if (!bilgi) throw new Error('Sürüm bilgisi okunamadı');
  if (!bilgi.apk || surumKarsilastir(bilgi.surum, UYGULAMA_SURUMU) <= 0) return 'guncel';
  guncellemeBildir({ tur: 'android', surum: bilgi.surum, notlar: bilgi.notlar, adres: `${PAKET_ADRESI}${bilgi.apk}` });
  return 'var';
}

// ---------- Ortak ----------
export type DenetimDurumu = 'var' | 'guncel' | 'desteklenmiyor';

/** Ayarlar'daki "Güncellemeleri denetle" düğmesi. */
export async function guncellemeleriDenetle(): Promise<DenetimDurumu> {
  if (bekleyen) return 'var';
  if (ANDROID) return androidSurumDenetle();
  if (ARTIFACT || !swKaydi) return 'desteklenmiyor';
  await swKaydi.update();
  // Yeni service worker kurulurken onNeedRefresh birkaç saniye içinde tetiklenir.
  for (let i = 0; i < 10 && !bekleyen; i++) await new Promise((r) => setTimeout(r, 500));
  return bekleyen ? 'var' : 'guncel';
}
