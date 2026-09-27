import type { Konu, Soru, TestTipi } from '../types';
import { CONFIG } from './config';
import { hedefZorluklar, konuAgirliklari, konuDurumlari, type CevapOzeti } from './mastery';
import { agirlikliSec, karistir, type Rng } from './rng';
import { havuzOlustur, soruCek } from './secim';

export interface TestUretimi {
  soru_idleri: string[];
  /** Seçilmek istenip sorusu kalmadığı için atlanan konular */
  biten_konular: string[];
}

/** Konu kotası ve havuz kurallarına uymayan durumda kalan boşlukları herhangi bir yeni soruyla doldurur. */
function eksikleriDoldur(secilen: Soru[], havuz: Map<string, Soru[]>, rng: Rng): void {
  const kalan = karistir([...havuz.values()].flat(), rng);
  while (secilen.length < CONFIG.TEST_BOYUTU && kalan.length > 0) {
    const s = kalan.pop()!;
    secilen.push(s);
    const dizi = havuz.get(s.konu)!;
    dizi.splice(dizi.indexOf(s), 1);
  }
}

/**
 * Uyarlanmış test: konular eksiklik ağırlığına göre ağırlıklı rastgele seçilir,
 * her konudan en fazla 3 soru, zorluk ustalığa göre belirlenir.
 */
export function uyarlanmisTestOlustur(
  sorular: readonly Soru[],
  konular: readonly Konu[],
  cevaplar: readonly CevapOzeti[],
  cozulmus: ReadonlySet<string>,
  rng: Rng,
): TestUretimi {
  const durumlar = konuDurumlari(konular, cevaplar);
  const agirliklar = konuAgirliklari(konular, durumlar);
  const havuz = havuzOlustur(sorular, cozulmus);
  const sayac = new Map<string, number>();
  const biten = new Set<string>();
  const secilen: Soru[] = [];

  const kotaVar = (k: Konu) => (sayac.get(k.kod) ?? 0) < CONFIG.UYARLANMIS_KONU_MAX;
  const soruVar = (k: Konu) => (havuz.get(k.kod)?.length ?? 0) > 0;
  const agirlik = (k: Konu) => agirliklar.get(k.kod)!;

  while (secilen.length < CONFIG.TEST_BOYUTU) {
    let konu = agirlikliSec(
      konular.filter((k) => kotaVar(k) && !biten.has(k.kod)),
      agirlik,
      rng,
    );
    if (!konu) break;
    if (!soruVar(konu)) {
      // Konu bitti: aynı bölümdeki diğer konulara geç.
      biten.add(konu.kod);
      const bolum = konu.bolum;
      konu = agirlikliSec(
        konular.filter((k) => k.bolum === bolum && kotaVar(k) && soruVar(k)),
        agirlik,
        rng,
      );
      if (!konu) continue;
    }
    const hedef = hedefZorluklar(durumlar.get(konu.kod)!.ustalik);
    secilen.push(soruCek(havuz.get(konu.kod)!, hedef, rng)!);
    sayac.set(konu.kod, (sayac.get(konu.kod) ?? 0) + 1);
  }

  eksikleriDoldur(secilen, havuz, rng);
  return { soru_idleri: secilen.map((s) => s.id), biten_konular: [...biten] };
}

/** Kontrol testi: teşhis mantığıyla dengeli karma test (önce farklı konular, zorluk döngüsü). */
export function kontrolTestOlustur(
  sorular: readonly Soru[],
  konular: readonly Konu[],
  cozulmus: ReadonlySet<string>,
  rng: Rng,
): TestUretimi {
  const havuz = havuzOlustur(sorular, cozulmus);
  const sayac = new Map<string, number>();
  const secilen: Soru[] = [];
  const dongu = CONFIG.TESHIS_ZORLUK_DONGUSU;

  for (let tur = 1; tur <= CONFIG.KONTROL_KONU_MAX; tur++) {
    while (secilen.length < CONFIG.TEST_BOYUTU) {
      const konu = agirlikliSec(
        konular.filter((k) => (sayac.get(k.kod) ?? 0) < tur && (havuz.get(k.kod)?.length ?? 0) > 0),
        (k) => k.sinav_agirligi + 0.1,
        rng,
      );
      if (!konu) break;
      secilen.push(soruCek(havuz.get(konu.kod)!, [dongu[secilen.length % dongu.length]], rng)!);
      sayac.set(konu.kod, (sayac.get(konu.kod) ?? 0) + 1);
    }
  }

  eksikleriDoldur(secilen, havuz, rng);
  return { soru_idleri: karistir(secilen.map((s) => s.id), rng), biten_konular: [] };
}

export interface TestOzeti {
  tip: TestTipi;
  durum: 'devam' | 'bitti';
}

/** Sıradaki testin tipi: teşhis → 10 uyarlanmış → 1 kontrol → 10 uyarlanmış → ... */
export function siradakiTest(
  testler: readonly TestOzeti[],
  teshisTestSayisi: number,
): { tip: 'teshis' | 'uyarlanmis' | 'kontrol'; sira_no: number } {
  const biten = (tip: TestTipi) => testler.filter((t) => t.tip === tip && t.durum === 'bitti').length;
  const teshis = biten('teshis');
  if (teshis < teshisTestSayisi) return { tip: 'teshis', sira_no: teshis + 1 };
  const uy = biten('uyarlanmis');
  const ko = biten('kontrol');
  if (uy >= (ko + 1) * CONFIG.KONTROL_ARALIGI) return { tip: 'kontrol', sira_no: ko + 1 };
  return { tip: 'uyarlanmis', sira_no: uy + 1 };
}

/** Son cevabı yanlış veya boş olan sorular (kronolojik cevap listesinden). */
export function yanlisSoruIdleri(cevaplar: readonly { soru_id: string; dogru_mu: boolean }[]): string[] {
  const son = new Map<string, boolean>();
  for (const c of cevaplar) {
    son.delete(c.soru_id);
    son.set(c.soru_id, c.dogru_mu);
  }
  return [...son].filter(([, d]) => !d).map(([id]) => id);
}

export function tekrarTestOlustur(yanlislar: readonly string[], rng: Rng): string[] {
  return karistir(yanlislar, rng).slice(0, CONFIG.TEST_BOYUTU);
}
