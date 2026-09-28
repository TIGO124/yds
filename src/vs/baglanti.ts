// VS için gerçek zamanlı veritabanı arayüzü. Yayında Firebase, testlerde ve geliştirmede bellek içi sunucu.

export interface VsBaglanti {
  /** Bu cihazın oyuncu kimliği */
  uid: string;
  /** Sunucu saatine göre şimdiki an (ms) */
  simdi(): number;
  oku<T>(yol: string): Promise<T | null>;
  /** null yazmak siler */
  yaz(yol: string, deger: unknown): Promise<void>;
  /** Atomik değiştirme; fn undefined döndürürse vazgeçilir. fn birden çok kez çağrılabilir. */
  islem<T>(yol: string, fn: (mevcut: T | null) => T | null | undefined): Promise<boolean>;
  dinle<T>(yol: string, cb: (deger: T | null) => void): () => void;
  /** Bağlantı koparsa sunucunun yazacağı değer (null = sil) */
  kopunca(yol: string, deger: unknown): Promise<void>;
  kopuncaIptal(yol: string): Promise<void>;
  /** Sunucuyla bağlantı durumu; aboneliğin ardından hemen bir kez çağrılır */
  baglantiDinle(cb: (bagli: boolean) => void): () => void;
}

/** Bağlantı kurulamadı ya da VS bu yapıda kapalı: kullanıcıya gösterilecek açıklama taşır. */
export class VsHatasi extends Error {}

export const yeniKimlik = (): string =>
  Date.now().toString(36) + Array.from(crypto.getRandomValues(new Uint8Array(6)), (b) => b.toString(36).padStart(2, '0')).join('');
