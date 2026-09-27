// Soru bankası (salt okunur, pakete gömülü)
export type Zorluk = 1 | 2 | 3;

export interface Soru {
  id: string;
  bolum: string;
  konu: string;
  alt_konu: string;
  zorluk: Zorluk;
  soru: string;
  secenekler: string[];
  dogru: number;
  aciklama: string;
  paragraf_id: string | null;
}

/** Birden çok okuma sorusunun paylaştığı parça (paragraflar.json). */
export interface Paragraf {
  id: string;
  metin: string;
}

export interface Bolum {
  kod: string;
  ad: string;
}

export interface Konu {
  kod: string;
  ad: string;
  bolum: string;
  sinav_agirligi: number;
  oneri: string;
}

export interface Taksonomi {
  bolumler: Bolum[];
  konular: Konu[];
}

/** Konu kartı: kısa konu anlatımı (konu_notlari.json). */
export interface KonuNotu {
  ozet: string;
  kurallar: string[];
  ornekler: { en: string; tr: string }[];
  hatalar: string[];
}

// Cihazdaki kullanıcı verisi (IndexedDB)
export type TestTipi = 'teshis' | 'uyarlanmis' | 'kontrol' | 'tekrar' | 'deneme' | 'konu';

export interface TestKaydi {
  id?: number;
  tip: TestTipi;
  /** Aynı tip içindeki sıra (teşhis 1–10, uyarlanmış 1..n) */
  sira_no: number;
  soru_idleri: string[];
  baslangic: number;
  bitis: number | null;
  dogru_sayisi: number;
  durum: 'devam' | 'bitti';
  /** Devam eden test için şık indeksleri; null = boş */
  secimler: (number | null)[];
  sureler: number[];
  aktif_index: number;
  /** Bu testte soru kalmayan konular (bilgi mesajı için) */
  biten_konular?: string[];
  /** Konu testinin konusu */
  konu?: string;
}

export interface CevapKaydi {
  id?: number;
  test_id: number;
  test_tipi: TestTipi;
  soru_id: string;
  konu: string;
  bolum: string;
  secilen: number | null;
  dogru_mu: boolean;
  sure_ms: number;
  tarih: number;
}

export interface Ayarlar {
  id: 'ayarlar';
  konu_etiketini_goster: boolean;
  cevabi_goster: 'aninda' | 'test_sonunda';
  tema: 'sistem' | 'acik' | 'koyu';
  /** Ders programı: günlük çalışma süresi (dakika) */
  gunluk_dakika: number;
  /** Ders programı: haftada kaç gün çalışılacak (3–7) */
  haftalik_gun: number;
  /** Ders programı: sınav tarihi (YYYY-AA-GG) */
  sinav_tarihi: string | null;
  /** Günlük hatırlatma saati (SS:DD); null = kapalı. Yalnızca Android uygulaması. */
  hatirlatma: string | null;
}

export interface TeshisTesti {
  sira_no: number;
  soru_idleri: string[];
}

/** "Sonra bak" diye işaretlenen soru. */
export interface IsaretKaydi {
  soru_id: string;
  tarih: number;
}

/** Kelime defteri kaydı; kutu/sonraki aralıklı tekrar durumudur. */
export interface KelimeKaydi {
  /** Anahtar: küçük harfli kelime ya da kalıp */
  kelime: string;
  anlam: string;
  /** Kelimenin geçtiği cümle */
  baglam: string;
  soru_id: string | null;
  eklenme: number;
  /** 0 = yeni; öğrenilen kelimenin kutusu aralık sayısına eşittir */
  kutu: number;
  /** Bu andan (ms) itibaren sırası gelir */
  sonraki: number;
}

/** Test dışı çalışma günlüğü (kelime kartları); seri hesabında kullanılır. */
export interface GunlukKaydi {
  /** YYYY-AA-GG */
  tarih: string;
  kart: number;
}
