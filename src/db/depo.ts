import type { Ayarlar, CevapKaydi, FotografKaydi, GunlukKaydi, IsaretKaydi, KelimeKaydi, Konu, Soru, TeshisTesti, TestKaydi, TestTipi } from '../types';
import { kontrolTestOlustur, konuTestOlustur, siradakiTest, tekrarTestOlustur, uyarlanmisTestOlustur, type TestUretimi } from '../engine/adaptive';
import { CONFIG } from '../engine/config';
import { denemeOlustur, type DenemeUretimi } from '../engine/deneme';
import { teshisPlaniOlustur } from '../engine/diagnostic';
import { kelimeAnahtari } from '../engine/kelime';
import { konuDurumlari } from '../engine/mastery';
import { tarihMetni } from '../engine/program';
import { karistir, mulberry32, type Rng } from '../engine/rng';
import { sonGorulmeler, type EskiSorular } from '../engine/secim';
import { kutuIlerlet, siradakiler, tekrarDurumlari, type SoruTekrari } from '../engine/tekrar';
import { VARSAYILAN_AYARLAR, type YdsDB } from './db';
import { yedekDogrula, type Yedek } from './yedek';

export type { Yedek } from './yedek';

export interface Banka {
  sorular: readonly Soru[];
  konular: readonly Konu[];
}

export interface TekrarListesi {
  /** Aralıklı tekrardaki tüm sorular, sırası en önce gelen önce */
  hepsi: SoruTekrari[];
  /** Şu an sırası gelmiş olanlar */
  sirada: SoruTekrari[];
}

const SORU_KALMADI = 'Şu an çözülecek soru kalmadı: yeni sorular bitti, eski sorular da son günlerde görüldü. Tekrar listeni çöz ya da birkaç gün sonra yeniden dene.';

const rastgeleRng = (): Rng => mulberry32((Date.now() ^ Math.floor(Math.random() * 2 ** 32)) >>> 0);

/** Kullanıcı verisi işlemleri. Soru bankası, RNG ve saat dışarıdan verilir (test edilebilirlik için). */
export class Depo {
  private soruMap: Map<string, Soru>;

  constructor(
    readonly db: YdsDB,
    readonly banka: Banka,
    private rngUret: () => Rng = rastgeleRng,
    readonly saat: () => number = () => Date.now(),
  ) {
    this.soruMap = new Map(banka.sorular.map((s) => [s.id, s]));
  }

  /** Soru bankası (indirilen paketle) büyüdüğünde çağrılır. */
  bankaYenilendi(): void {
    this.soruMap = new Map(this.banka.sorular.map((s) => [s.id, s]));
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

  /** Yeni sorular bitince eski soruları kullanmak için: aralıklı tekrardaki sorular hariç tutulur. */
  private eskiBilgisi(cevaplar: readonly CevapKaydi[]): EskiSorular {
    return { sonGorulme: sonGorulmeler(cevaplar), haric: new Set(tekrarDurumlari(cevaplar).keys()), simdi: this.saat() };
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
      const eski = this.eskiBilgisi(cevaplar);
      const { sorular, konular } = this.banka;

      let uretim: TestUretimi;
      if (sira.tip === 'teshis') {
        const ids = plan[sira.sira_no - 1].soru_idleri.filter((id) => !cozulmus.has(id) && this.soruMap.has(id));
        uretim = { soru_idleri: ids, biten_konular: [] };
        if (ids.length === 0) uretim = kontrolTestOlustur(sorular, konular, cozulmus, rng, eski);
      } else if (sira.tip === 'kontrol') {
        uretim = kontrolTestOlustur(sorular, konular, cozulmus, rng, eski);
      } else {
        uretim = uyarlanmisTestOlustur(sorular, konular, cevaplar, cozulmus, rng, eski);
      }
      if (uretim.soru_idleri.length === 0) throw new Error(SORU_KALMADI);
      return this.yeniTest(sira.tip, sira.sira_no, uretim);
    });
  }

  /** Aralıklı tekrardaki sorular (bankada olmayanlar atlanır). */
  async tekrarListesi(): Promise<TekrarListesi> {
    const hepsi = [...tekrarDurumlari(await this.cevaplar()).values()]
      .filter((d) => this.soruMap.has(d.soru_id))
      .sort((a, b) => a.sonraki - b.sonraki);
    return { hepsi, sirada: siradakiler(hepsi, this.saat()) };
  }

  /**
   * Tekrar testi (konu puanlarını etkilemez): kaynak verilirse o sorulardan (ör. kaydedilenler),
   * verilmezse sırası gelen yanlışlardan, en çok geciken önce. Başka bir test yarımsa onu döndürür.
   */
  async tekrarTestiBaslat(kaynak?: readonly string[]): Promise<number | null> {
    return this.db.transaction('rw', this.db.testler, this.db.cevaplar, async () => {
      const aktif = await this.db.testler.where('durum').equals('devam').first();
      if (aktif) return aktif.id!;
      const rng = this.rngUret();
      const oncelik = kaynak
        ? karistir(
            kaynak.filter((id) => this.soruMap.has(id)),
            rng,
          )
        : siradakiler(tekrarDurumlari(await this.db.cevaplar.orderBy('id').toArray()).values(), this.saat())
            .map((d) => d.soru_id)
            .filter((id) => this.soruMap.has(id));
      const ids = tekrarTestOlustur(oncelik, rng);
      if (ids.length === 0) return null;
      const sira = (await this.db.testler.where('tip').equals('tekrar').count()) + 1;
      return this.yeniTest('tekrar', sira, { soru_idleri: ids, biten_konular: [] });
    });
  }

  /** Konu kartından kısa test; aynı konunun yarım testi varsa onu döndürür, başka test yarımsa başlamaz. */
  async konuTestiBaslat(konu: string): Promise<number> {
    return this.db.transaction('rw', this.db.testler, this.db.cevaplar, async () => {
      const aktif = await this.db.testler.where('durum').equals('devam').first();
      if (aktif?.tip === 'konu' && aktif.konu === konu) return aktif.id!;
      if (aktif) throw new Error('Önce yarım kalan testi bitir; konu testi ondan sonra başlar.');
      const cevaplar = await this.db.cevaplar.orderBy('id').toArray();
      const cozulmus = new Set(cevaplar.map((c) => c.soru_id));
      const ustalik = konuDurumlari(this.banka.konular, cevaplar).get(konu)?.ustalik ?? 0.5;
      const ids = konuTestOlustur(this.banka.sorular, konu, ustalik, cozulmus, this.rngUret(), this.eskiBilgisi(cevaplar));
      if (ids.length === 0) throw new Error('Bu konuda şu an çözülecek soru kalmadı.');
      const sira = (await this.db.testler.where('tip').equals('konu').count()) + 1;
      return this.yeniTest('konu', sira, { soru_idleri: ids, biten_konular: [] }, konu);
    });
  }

  /**
   * YDS düzeninde 80 soruluk deneme: yeni sorular önce, yetmeyen bölümde en uzun süredir görülmeyen
   * sorular. Başka bir test yarımken başlamaz; yarım kalmış bir deneme varsa onu döndürür.
   */
  async denemeBaslat(): Promise<{ id: number; eksik: DenemeUretimi['eksik']; yeniden: number }> {
    return this.db.transaction('rw', this.db.testler, this.db.cevaplar, async () => {
      const aktif = await this.db.testler.where('durum').equals('devam').first();
      if (aktif?.tip === 'deneme') return { id: aktif.id!, eksik: [], yeniden: 0 };
      if (aktif) throw new Error('Önce yarım kalan testi bitir; deneme sınavı ondan sonra başlar.');
      const cevaplar = await this.db.cevaplar.orderBy('id').toArray();
      const cozulmus = new Set(cevaplar.map((c) => c.soru_id));
      const d = denemeOlustur(this.banka.sorular, cozulmus, this.rngUret(), this.eskiBilgisi(cevaplar));
      if (d.soru_idleri.length === 0) throw new Error(SORU_KALMADI);
      const sira = (await this.db.testler.where('tip').equals('deneme').count()) + 1;
      const id = await this.yeniTest('deneme', sira, { soru_idleri: d.soru_idleri, biten_konular: [] });
      return { id, eksik: d.eksik, yeniden: d.yeniden };
    });
  }

  private yeniTest(tip: TestTipi, sira_no: number, u: TestUretimi, konu?: string): Promise<number> {
    const n = u.soru_idleri.length;
    return this.db.testler.add({
      tip,
      sira_no,
      soru_idleri: u.soru_idleri,
      baslangic: this.saat(),
      bitis: null,
      dogru_sayisi: 0,
      durum: 'devam',
      secimler: Array<number | null>(n).fill(null),
      sureler: Array<number>(n).fill(0),
      aktif_index: 0,
      biten_konular: u.biten_konular,
      ...(konu ? { konu } : {}),
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
      const simdi = this.saat();
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

  // ---------- İşaretlenen sorular ----------

  /** En son işaretlenen önce. */
  async isaretler(): Promise<IsaretKaydi[]> {
    return (await this.db.isaretler.toArray()).sort((a, b) => b.tarih - a.tarih);
  }

  async isaretle(soru_id: string, isaretli: boolean): Promise<void> {
    if (isaretli) await this.db.isaretler.put({ soru_id, tarih: this.saat() });
    else await this.db.isaretler.delete(soru_id);
  }

  // ---------- Kelime defteri ----------

  /** En son eklenen önce. */
  async kelimeler(): Promise<KelimeKaydi[]> {
    return (await this.db.kelimeler.toArray()).sort((a, b) => b.eklenme - a.eklenme);
  }

  /** Yeni kelime hemen çalışılabilir (kutu 0). Kelime zaten defterdeyse yalnızca boş anlamını doldurur. */
  async kelimeEkle(k: { kelime: string; anlam?: string; baglam?: string; soru_id?: string | null }): Promise<'eklendi' | 'vardi'> {
    const kelime = kelimeAnahtari(k.kelime);
    if (!kelime) throw new Error('Kelime boş olamaz.');
    if (kelime.length > 60) throw new Error('Kelime ya da kalıp en fazla 60 karakter olabilir.');
    const anlam = (k.anlam ?? '').trim().slice(0, 200);
    return this.db.transaction('rw', this.db.kelimeler, async () => {
      const eski = await this.db.kelimeler.get(kelime);
      if (eski) {
        if (anlam && !eski.anlam) await this.db.kelimeler.update(kelime, { anlam });
        return 'vardi' as const;
      }
      const simdi = this.saat();
      await this.db.kelimeler.add({
        kelime,
        anlam,
        baglam: (k.baglam ?? '').trim().slice(0, 300),
        soru_id: k.soru_id ?? null,
        eklenme: simdi,
        kutu: 0,
        sonraki: simdi,
      });
      return 'eklendi' as const;
    });
  }

  async kelimeAnlami(kelime: string, anlam: string): Promise<void> {
    await this.db.kelimeler.update(kelime, { anlam: anlam.trim().slice(0, 200) });
  }

  kelimeSil(kelime: string): Promise<void> {
    return this.db.kelimeler.delete(kelime);
  }

  /** Sırası gelen kartlar, en çok geciken önce (bir oturumluk). */
  async siradakiKartlar(): Promise<KelimeKaydi[]> {
    return siradakiler(await this.db.kelimeler.toArray(), this.saat()).slice(0, CONFIG.KART_OTURUMU);
  }

  /** Kart cevabı: kutuyu ilerletir ya da başa alır; bugünü çalışma günü sayar. */
  async kartCevapla(kelime: string, bildi: boolean): Promise<void> {
    await this.db.transaction('rw', this.db.kelimeler, this.db.gunluk, async () => {
      const k = await this.db.kelimeler.get(kelime);
      if (!k) return;
      const simdi = this.saat();
      await this.db.kelimeler.update(kelime, kutuIlerlet(k.kutu, bildi, simdi));
      const tarih = tarihMetni(new Date(simdi));
      const g = await this.db.gunluk.get(tarih);
      await this.db.gunluk.put({ tarih, kart: (g?.kart ?? 0) + 1 });
    });
  }

  gunluk(): Promise<GunlukKaydi[]> {
    return this.db.gunluk.toArray();
  }

  // ---------- Fotoğraflar (yedeğe dahil değil; sıfırlamada silinmez) ----------

  /** En yeni önce; yalnızca küçük resimler (tam boylar ayrı tabloda). */
  async fotograflar(): Promise<FotografKaydi[]> {
    return (await this.db.fotograflar.toArray()).sort((a, b) => b.tarih - a.tarih);
  }

  fotografSayisi(): Promise<number> {
    return this.db.fotograflar.count();
  }

  /** Fotoğraf bilgisi ve tam boyu; yoksa undefined. */
  async fotograf(id: number): Promise<(FotografKaydi & { veri: ArrayBuffer }) | undefined> {
    const [kayit, tam] = await Promise.all([this.db.fotograflar.get(id), this.db.fotograf_verisi.get(id)]);
    return kayit && tam ? { ...kayit, veri: tam.veri } : undefined;
  }

  async fotografEkle(f: { veri: ArrayBuffer; kucuk: ArrayBuffer; genislik: number; yukseklik: number }): Promise<number> {
    return this.db.transaction('rw', this.db.fotograflar, this.db.fotograf_verisi, async () => {
      const id = await this.db.fotograflar.add({ tarih: this.saat(), not: '', genislik: f.genislik, yukseklik: f.yukseklik, kucuk: f.kucuk });
      await this.db.fotograf_verisi.put({ id, veri: f.veri });
      return id;
    });
  }

  async fotografNotu(id: number, not: string): Promise<void> {
    await this.db.fotograflar.update(id, { not: not.trim().slice(0, 500) });
  }

  async fotografSil(id: number): Promise<void> {
    await this.db.transaction('rw', this.db.fotograflar, this.db.fotograf_verisi, async () => {
      await this.db.fotograflar.delete(id);
      await this.db.fotograf_verisi.delete(id);
    });
  }

  // ---------- Yedek ----------

  async yedekAl(): Promise<Yedek> {
    return {
      uygulama: 'yds',
      surum: 2,
      tarih: this.saat(),
      testler: await this.db.testler.toArray(),
      cevaplar: await this.db.cevaplar.toArray(),
      ayarlar: await this.db.ayarlar.toArray(),
      teshis_plani: await this.db.teshis_plani.toArray(),
      isaretler: await this.db.isaretler.toArray(),
      kelimeler: await this.db.kelimeler.toArray(),
      gunluk: await this.db.gunluk.toArray(),
    };
  }

  /** Yedekteki verileri yükler. Eski biçimli (v1) yedek işaretlere ve kelime defterine dokunmaz. */
  async yedektenYukle(veri: unknown): Promise<void> {
    const y = yedekDogrula(veri);
    const { testler, cevaplar, ayarlar, teshis_plani, isaretler, kelimeler, gunluk } = this.db;
    const tablolar = [testler, cevaplar, ayarlar, teshis_plani, ...(y.surum === 2 ? [isaretler, kelimeler, gunluk] : [])];
    await this.db.transaction('rw', tablolar, async () => {
      await Promise.all(tablolar.map((t) => t.clear()));
      await testler.bulkPut(y.testler);
      await cevaplar.bulkPut(y.cevaplar);
      await ayarlar.bulkPut(y.ayarlar);
      await teshis_plani.bulkPut(y.teshis_plani);
      if (y.surum === 2) {
        await isaretler.bulkPut(y.isaretler!);
        await kelimeler.bulkPut(y.kelimeler!);
        await gunluk.bulkPut(y.gunluk!);
      }
    });
  }

  /** Testleri ve cevapları siler; ayarlar, kelime defteri ve işaretlenen sorular korunur. */
  async sifirla(): Promise<void> {
    await this.db.transaction('rw', this.db.testler, this.db.cevaplar, this.db.teshis_plani, async () => {
      await Promise.all([this.db.testler.clear(), this.db.cevaplar.clear(), this.db.teshis_plani.clear()]);
    });
  }
}
