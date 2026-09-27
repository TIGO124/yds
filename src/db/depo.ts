import type { Ayarlar, CevapKaydi, Konu, Soru, TeshisTesti, TestKaydi, TestTipi } from '../types';
import { kontrolTestOlustur, siradakiTest, tekrarTestOlustur, uyarlanmisTestOlustur, yanlisSoruIdleri, type TestUretimi } from '../engine/adaptive';
import { denemeOlustur, type DenemeUretimi } from '../engine/deneme';
import { teshisPlaniOlustur } from '../engine/diagnostic';
import { mulberry32, type Rng } from '../engine/rng';
import { VARSAYILAN_AYARLAR, type YdsDB } from './db';

export interface Banka {
  sorular: readonly Soru[];
  konular: readonly Konu[];
}

export interface Yedek {
  uygulama: 'yds';
  surum: 1;
  tarih: number;
  testler: TestKaydi[];
  cevaplar: CevapKaydi[];
  ayarlar: Ayarlar[];
  teshis_plani: TeshisTesti[];
}

const rastgeleRng = (): Rng => mulberry32((Date.now() ^ Math.floor(Math.random() * 2 ** 32)) >>> 0);

/** Kullanıcı verisi işlemleri. Soru bankası ve RNG dışarıdan verilir (test edilebilirlik için). */
export class Depo {
  private soruMap: Map<string, Soru>;

  constructor(
    readonly db: YdsDB,
    readonly banka: Banka,
    private rngUret: () => Rng = rastgeleRng,
  ) {
    this.soruMap = new Map(banka.sorular.map((s) => [s.id, s]));
  }

  async ayarlar(): Promise<Ayarlar> {
    return { ...VARSAYILAN_AYARLAR, ...(await this.db.ayarlar.get('ayarlar')) };
  }

  /** Oku-değiştir-yaz tek işlemde: art arda gelen kayıtlar birbirinin değişikliğini ezmez. */
  ayarKaydet(degisim: Partial<Omit<Ayarlar, 'id'>>): Promise<Ayarlar> {
    return this.db.transaction('rw', this.db.ayarlar, async () => {
      const yeni = { ...(await this.ayarlar()), ...degisim };
      await this.db.ayarlar.put(yeni);
      return yeni;
    });
  }

  /** Kronolojik tüm cevaplar. */
  cevaplar(): Promise<CevapKaydi[]> {
    return this.db.cevaplar.orderBy('id').toArray();
  }

  testler(): Promise<TestKaydi[]> {
    return this.db.testler.orderBy('id').toArray();
  }

  test(id: number): Promise<TestKaydi | undefined> {
    return this.db.testler.get(id);
  }

  async aktifTest(): Promise<TestKaydi | undefined> {
    return this.db.testler.where('durum').equals('devam').first();
  }

  /** İlk açılışta 10 testlik teşhis planını oluşturur. */
  async planGaranti(): Promise<TeshisTesti[]> {
    return this.db.transaction('rw', this.db.teshis_plani, this.db.cevaplar, async () => {
      const mevcut = await this.db.teshis_plani.orderBy('sira_no').toArray();
      if (mevcut.length > 0) return mevcut;
      const cozulmus = new Set((await this.db.cevaplar.toArray()).map((c) => c.soru_id));
      const plan = teshisPlaniOlustur(this.banka.sorular, this.banka.konular, cozulmus, this.rngUret());
      await this.db.teshis_plani.bulkAdd(plan);
      return plan;
    });
  }

  /** Aktif test varsa onu, yoksa sıradaki teşhis / uyarlanmış / kontrol testini başlatır. */
  async sonrakiTestiBaslat(): Promise<number> {
    const plan = await this.planGaranti();
    // Aktif test kontrolü işlem içinde: art arda iki dokunuş iki test oluşturmasın.
    return this.db.transaction('rw', this.db.testler, this.db.cevaplar, async () => {
      const aktif = await this.db.testler.where('durum').equals('devam').first();
      if (aktif) return aktif.id!;
      const testler = await this.db.testler.toArray();
      const cevaplar = await this.db.cevaplar.orderBy('id').toArray();
      const cozulmus = new Set(cevaplar.map((c) => c.soru_id));
      const sira = siradakiTest(testler, plan.length);
      const rng = this.rngUret();
      const { sorular, konular } = this.banka;

      let uretim: TestUretimi;
      if (sira.tip === 'teshis') {
        const ids = plan[sira.sira_no - 1].soru_idleri.filter((id) => !cozulmus.has(id) && this.soruMap.has(id));
        uretim = { soru_idleri: ids, biten_konular: [] };
        if (ids.length === 0) uretim = kontrolTestOlustur(sorular, konular, cozulmus, rng);
      } else if (sira.tip === 'kontrol') {
        uretim = kontrolTestOlustur(sorular, konular, cozulmus, rng);
      } else {
        uretim = uyarlanmisTestOlustur(sorular, konular, cevaplar, cozulmus, rng);
      }
      if (uretim.soru_idleri.length === 0) throw new Error('Çözülmemiş soru kalmadı.');
      return this.yeniTest(sira.tip, sira.sira_no, uretim);
    });
  }

  /** Yanlış/boş bırakılan sorulardan tekrar testi; konu puanlarını etkilemez. */
  async tekrarTestiBaslat(): Promise<number | null> {
    return this.db.transaction('rw', this.db.testler, this.db.cevaplar, async () => {
      const aktif = await this.db.testler.where('durum').equals('devam').first();
      if (aktif) return aktif.id!;
      const ids = tekrarTestOlustur(await this.yanlislar(), this.rngUret());
      if (ids.length === 0) return null;
      const sira = (await this.db.testler.where('tip').equals('tekrar').count()) + 1;
      return this.yeniTest('tekrar', sira, { soru_idleri: ids, biten_konular: [] });
    });
  }

  /**
   * YDS düzeninde 80 soruluk deneme (yalnızca yeni sorular). Başka bir test yarımken başlamaz;
   * yarım kalmış bir deneme varsa onu döndürür.
   */
  async denemeBaslat(): Promise<{ id: number; eksik: DenemeUretimi['eksik'] }> {
    return this.db.transaction('rw', this.db.testler, this.db.cevaplar, async () => {
      const aktif = await this.db.testler.where('durum').equals('devam').first();
      if (aktif?.tip === 'deneme') return { id: aktif.id!, eksik: [] };
      if (aktif) throw new Error('Önce yarım kalan testi bitir; deneme sınavı ondan sonra başlar.');
      const cozulmus = new Set((await this.db.cevaplar.toArray()).map((c) => c.soru_id));
      const d = denemeOlustur(this.banka.sorular, cozulmus, this.rngUret());
      if (d.soru_idleri.length === 0) throw new Error('Çözülmemiş soru kalmadı.');
      const sira = (await this.db.testler.where('tip').equals('deneme').count()) + 1;
      const id = await this.yeniTest('deneme', sira, { soru_idleri: d.soru_idleri, biten_konular: [] });
      return { id, eksik: d.eksik };
    });
  }

  async yanlislar(): Promise<string[]> {
    return yanlisSoruIdleri(await this.cevaplar()).filter((id) => this.soruMap.has(id));
  }

  private yeniTest(tip: TestTipi, sira_no: number, u: TestUretimi): Promise<number> {
    const n = u.soru_idleri.length;
    return this.db.testler.add({
      tip,
      sira_no,
      soru_idleri: u.soru_idleri,
      baslangic: Date.now(),
      bitis: null,
      dogru_sayisi: 0,
      durum: 'devam',
      secimler: Array<number | null>(n).fill(null),
      sureler: Array<number>(n).fill(0),
      aktif_index: 0,
      biten_konular: u.biten_konular,
    });
  }

  /** Devam eden testte seçimi ve süreyi kaydeder (yarıda kalırsa sürdürmek için). */
  async secimKaydet(testId: number, index: number, secim: number | null, ekSureMs: number, aktifIndex: number): Promise<void> {
    await this.db.transaction('rw', this.db.testler, async () => {
      const t = await this.db.testler.get(testId);
      if (!t || t.durum !== 'devam') return;
      t.secimler[index] = secim;
      t.sureler[index] = (t.sureler[index] ?? 0) + Math.max(0, ekSureMs);
      await this.db.testler.update(testId, { secimler: t.secimler, sureler: t.sureler, aktif_index: aktifIndex });
    });
  }

  async konumKaydet(testId: number, index: number, ekSureMs: number, yeniIndex: number): Promise<void> {
    await this.db.transaction('rw', this.db.testler, async () => {
      const t = await this.db.testler.get(testId);
      if (!t || t.durum !== 'devam') return;
      t.sureler[index] = (t.sureler[index] ?? 0) + Math.max(0, ekSureMs);
      await this.db.testler.update(testId, { sureler: t.sureler, aktif_index: yeniIndex });
    });
  }

  async testiBitir(testId: number): Promise<void> {
    await this.db.transaction('rw', this.db.testler, this.db.cevaplar, async () => {
      const t = await this.db.testler.get(testId);
      if (!t || t.durum === 'bitti') return;
      const simdi = Date.now();
      // Uygulama güncellemesinde bankadan kaldırılmış bir soru varsa atlanır.
      const kayitlar: CevapKaydi[] = t.soru_idleri.flatMap((soru_id, i) => {
        const s = this.soruMap.get(soru_id);
        if (!s) return [];
        const secilen = t.secimler[i] ?? null;
        return [{
          test_id: testId,
          test_tipi: t.tip,
          soru_id,
          konu: s.konu,
          bolum: s.bolum,
          secilen,
          dogru_mu: secilen === s.dogru,
          sure_ms: t.sureler[i] ?? 0,
          tarih: simdi,
        }];
      });
      await this.db.cevaplar.bulkAdd(kayitlar);
      await this.db.testler.update(testId, {
        durum: 'bitti',
        bitis: simdi,
        dogru_sayisi: kayitlar.filter((k) => k.dogru_mu).length,
      });
    });
  }

  async yedekAl(): Promise<Yedek> {
    return {
      uygulama: 'yds',
      surum: 1,
      tarih: Date.now(),
      testler: await this.db.testler.toArray(),
      cevaplar: await this.db.cevaplar.toArray(),
      ayarlar: await this.db.ayarlar.toArray(),
      teshis_plani: await this.db.teshis_plani.toArray(),
    };
  }

  async yedektenYukle(veri: unknown): Promise<void> {
    const y = yedekDogrula(veri);
    await this.db.transaction('rw', [this.db.testler, this.db.cevaplar, this.db.ayarlar, this.db.teshis_plani], async () => {
      await Promise.all([this.db.testler.clear(), this.db.cevaplar.clear(), this.db.ayarlar.clear(), this.db.teshis_plani.clear()]);
      await this.db.testler.bulkPut(y.testler);
      await this.db.cevaplar.bulkPut(y.cevaplar);
      await this.db.ayarlar.bulkPut(y.ayarlar);
      await this.db.teshis_plani.bulkPut(y.teshis_plani);
    });
  }

  /** İlerlemeyi siler; ayarlar korunur. */
  async sifirla(): Promise<void> {
    await this.db.transaction('rw', this.db.testler, this.db.cevaplar, this.db.teshis_plani, async () => {
      await Promise.all([this.db.testler.clear(), this.db.cevaplar.clear(), this.db.teshis_plani.clear()]);
    });
  }
}

/** Dışarıdan gelen yedek dosyasını doğrular (sistem sınırı). */
export function yedekDogrula(veri: unknown): Yedek {
  const hata = (m: string): never => {
    throw new Error(`Geçersiz yedek dosyası: ${m}`);
  };
  if (!veri || typeof veri !== 'object') hata('JSON nesnesi değil');
  const y = veri as Record<string, unknown>;
  if (y.uygulama !== 'yds') hata('bu uygulamaya ait değil');
  if (y.surum !== 1) hata('desteklenmeyen sürüm');
  for (const alan of ['testler', 'cevaplar', 'ayarlar', 'teshis_plani']) {
    if (!Array.isArray(y[alan])) hata(`'${alan}' listesi eksik`);
  }
  const testler = y.testler as TestKaydi[];
  for (const t of testler) {
    if (typeof t.id !== 'number' || !Array.isArray(t.soru_idleri) || !Array.isArray(t.secimler)) hata('test kaydı bozuk');
  }
  for (const c of y.cevaplar as CevapKaydi[]) {
    if (typeof c.test_id !== 'number' || typeof c.soru_id !== 'string' || typeof c.dogru_mu !== 'boolean') hata('cevap kaydı bozuk');
  }
  for (const p of y.teshis_plani as TeshisTesti[]) {
    if (typeof p.sira_no !== 'number' || !Array.isArray(p.soru_idleri)) hata('teşhis planı bozuk');
  }
  for (const a of y.ayarlar as Ayarlar[]) {
    if (!a || a.id !== 'ayarlar') hata('ayar kaydı bozuk');
  }
  return y as unknown as Yedek;
}
