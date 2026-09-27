import Dexie, { type Table } from 'dexie';
import type { SoruPaketi } from '../data/paket';
import type { Ayarlar, CevapKaydi, TeshisTesti, TestKaydi } from '../types';

/** İndirilen soru paketi (tek kayıt, id = 'soru'). */
export interface PaketKaydi extends SoruPaketi {
  id: 'soru';
}

export class YdsDB extends Dexie {
  testler!: Table<TestKaydi, number>;
  cevaplar!: Table<CevapKaydi, number>;
  ayarlar!: Table<Ayarlar, string>;
  teshis_plani!: Table<TeshisTesti, number>;
  paket!: Table<PaketKaydi, string>;

  constructor(ad = 'yds') {
    super(ad);
    this.version(1).stores({
      testler: '++id, tip, durum',
      cevaplar: '++id, test_id, soru_id, konu',
      ayarlar: 'id',
      teshis_plani: 'sira_no',
    });
    // v2: internetten indirilen soru paketi (ilerleme tablolarına dokunulmaz)
    this.version(2).stores({ paket: 'id' });
  }
}

export const VARSAYILAN_AYARLAR: Ayarlar = {
  id: 'ayarlar',
  konu_etiketini_goster: true,
  cevabi_goster: 'test_sonunda',
  tema: 'sistem',
  gunluk_dakika: 60,
  haftalik_gun: 6,
  sinav_tarihi: null,
};
