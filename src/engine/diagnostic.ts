import type { Konu, Soru, TeshisTesti } from '../types';
import { CONFIG } from './config';
import { karistir, type Rng } from './rng';
import { havuzOlustur, soruCek } from './secim';

/**
 * 100 soruluk teşhis planı:
 * - her konudan en az 2 soru,
 * - kalan kontenjan sinav_agirligi'na göre (en büyük kalan yöntemi),
 * - zorluk %25 kolay / %50 orta / %25 zor,
 * - bir testte bir konudan en fazla 2 soru.
 */
export function teshisPlaniOlustur(
  sorular: readonly Soru[],
  konular: readonly Konu[],
  cozulmus: ReadonlySet<string>,
  rng: Rng,
): TeshisTesti[] {
  const testSayisi = CONFIG.TESHIS_TEST_SAYISI;
  const hedefToplam = CONFIG.TEST_BOYUTU * testSayisi;
  const havuz = havuzOlustur(sorular, cozulmus);
  const aktif = konular.filter((k) => (havuz.get(k.kod)?.length ?? 0) > 0);
  const kapasite = (k: Konu) => Math.min(havuz.get(k.kod)!.length, CONFIG.TESHIS_TEST_KONU_MAX * testSayisi);

  const kota = new Map<string, number>();
  let kalan = hedefToplam;
  for (const k of aktif) {
    const q = Math.min(CONFIG.TESHIS_KONU_MIN, kapasite(k));
    kota.set(k.kod, q);
    kalan -= q;
  }

  while (kalan > 0) {
    const adaylar = aktif.filter((k) => kota.get(k.kod)! < kapasite(k));
    if (adaylar.length === 0) break;
    const w = (k: Konu) => (adaylar.some((a) => a.sinav_agirligi > 0) ? k.sinav_agirligi : 1);
    const toplamW = adaylar.reduce((t, k) => t + w(k), 0);
    const paylar = adaylar.map((k) => {
      const pay = (kalan * w(k)) / toplamW;
      return { k, tam: Math.floor(pay), kesir: pay - Math.floor(pay) };
    });
    let dagitilan = 0;
    const ekle = (k: Konu, n: number) => {
      const ek = Math.min(n, kapasite(k) - kota.get(k.kod)!, kalan - dagitilan);
      kota.set(k.kod, kota.get(k.kod)! + ek);
      dagitilan += ek;
    };
    for (const p of paylar) ekle(p.k, p.tam);
    for (const p of [...paylar].sort((a, b) => b.kesir - a.kesir)) {
      if (dagitilan >= kalan) break;
      ekle(p.k, 1);
    }
    if (dagitilan === 0) break;
    kalan -= dagitilan;
  }

  // Konu başına zorluk döngüsüyle seçim; döngü başlangıcı konudan konuya kayar.
  const dongu = CONFIG.TESHIS_ZORLUK_DONGUSU;
  const gruplar: string[][] = [];
  aktif.forEach((k, i) => {
    const secilen: string[] = [];
    for (let j = 0; j < kota.get(k.kod)!; j++) {
      const s = soruCek(havuz.get(k.kod)!, [dongu[(i + j) % dongu.length]], rng);
      if (s) secilen.push(s.id);
    }
    gruplar.push(secilen);
  });

  // Konulara göre gruplu listeyi testlere sırayla dağıt: bir konu ardışık testlere yayılır.
  const sirali = karistir(gruplar, rng).flatMap((g) => g);
  const n = Math.max(1, Math.ceil(sirali.length / CONFIG.TEST_BOYUTU));
  const testler: string[][] = Array.from({ length: n }, () => []);
  sirali.forEach((id, j) => testler[j % n].push(id));

  return testler
    .filter((t) => t.length > 0)
    .map((t, i) => ({ sira_no: i + 1, soru_idleri: karistir(t, rng) }));
}
