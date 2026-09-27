// Uyarlama algoritmasının ayarlanabilir sabitleri tek yerde.
export const CONFIG = {
  TEST_BOYUTU: 10,

  // Teşhis aşaması
  TESHIS_TEST_SAYISI: 10,
  TESHIS_KONU_MIN: 2,
  TESHIS_TEST_KONU_MAX: 2,
  /** Zorluk döngüsü: 1 kolay, 2 orta, 1 zor → %25 / %50 / %25 */
  TESHIS_ZORLUK_DONGUSU: [2, 1, 2, 3] as const,

  // Ustalık / eksiklik
  /** w = SONUMLEME^(o konuda bu cevaptan sonra verilen cevap sayısı) */
  AGIRLIK_SONUMLEME: 0.9,

  // Konu seçim ağırlığı
  EKSIKLIK_US: 1.5,
  BELIRSIZLIK_PAYI: 0.3,
  BELIRSIZLIK_ESIK: 5,
  TABAN_AGIRLIK: 0.03,

  // Uyarlanmış test
  UYARLANMIS_KONU_MAX: 3,
  /** Her N uyarlanmış testten sonra 1 kontrol testi */
  KONTROL_ARALIGI: 10,
  KONTROL_KONU_MAX: 2,

  // Ders programı (dakika)
  PROGRAM_TEST_DAKIKA: 20,
  PROGRAM_TEKRAR_DAKIKA: 15,
  PROGRAM_KONU_BLOK: 25,
  PROGRAM_MIN_BLOK: 15,
  /** Haftalık konu bloklarının dağıtılacağı en fazla konu sayısı */
  PROGRAM_ODAK_KONU: 8,
  /** Normal dönemde günlük sürenin test çözmeye ayrılan payı */
  PROGRAM_TEST_PAYI: 0.4,
  /** Sınava bu kadar gün kala son hafta moduna geçilir */
  PROGRAM_SON_HAFTA: 7,

  // Seviye etiketleri
  USTALIK_ZAYIF: 0.5,
  USTALIK_IYI: 0.75,
  YETERSIZ_VERI_ESIK: 5,

  // Aralıklı tekrar (Leitner): yanlıştan sonra 1 gün, her doğrudan sonra 3 ve 7 gün;
  // üst üste bu kadar doğru cevaplanan soru/kelime öğrenilmiş sayılır.
  TEKRAR_ARALIKLARI_GUN: [1, 3, 7] as const,
  /** Bir kart oturumundaki en fazla kelime */
  KART_OTURUMU: 20,

  // Yeni soru bitince eski soruların yeniden kullanımı
  /** Son bu kadar gün içinde görülen soru yeniden gelmez */
  YENIDEN_MIN_GUN: 3,
  /** Konunun en uzun süredir görülmeyen bu kadar (en az) sorusu aday olur */
  YENIDEN_MIN_ADAY: 5,

  /** Konu kartından başlatılan testin soru sayısı */
  KONU_TEST_BOYUTU: 5,
} as const;
