import { describe, expect, it } from 'vitest';
import { anlamBul, baglamCumlesi, kelimeAnahtari, soruBaglami } from '../src/engine/kelime';
import { calismaGunleri, haftalikTakvim, seriHesapla } from '../src/engine/seri';
import { bolumSureleri, dakikaSaniye, enUzunlar, hizliYanlislar, type SureliCevap } from '../src/engine/sure';
import { SORULAR } from '../src/data/bank';

describe('süre analizi', () => {
  const c = (soru_id: string, bolum: string, sure_ms: number, dogru_mu = true, secilen: number | null = 0): SureliCevap => ({
    soru_id,
    bolum,
    sure_ms,
    dogru_mu,
    secilen,
  });
  const cevaplar = [
    c('1', 'okuma', 200_000),
    c('2', 'okuma', 300_000),
    c('3', 'gr', 30_000),
    c('4', 'gr', 8_000, false),
    c('5', 'kel', 0, false, null),
    c('6', 'gr', 12_000, false, null),
  ];

  it('bölüm ortalaması sınav sırasıyla; hiç açılmayan soru sayılmaz; tempo hedefe göre', () => {
    const b = bolumSureleri(cevaplar);
    expect(b.map((x) => x.bolum)).toEqual(['gr', 'okuma']);
    expect(b[0]).toMatchObject({ adet: 3, ortalamaMs: 50_000 / 3, tempo: 'uygun' });
    expect(b[1]).toMatchObject({ adet: 2, ortalamaMs: 250_000, hedefMs: 150_000, tempo: 'yavas' });
  });

  it('en uzun sorular ve aceleyle yanlışlar (boşlar hariç)', () => {
    expect(enUzunlar(cevaplar, 2).map((x) => x.soru_id)).toEqual(['2', '1']);
    expect(hizliYanlislar(cevaplar).map((x) => x.soru_id)).toEqual(['4']);
  });

  it('dk:sn biçimi', () => {
    expect(dakikaSaniye(84_000)).toBe('1:24');
    expect(dakikaSaniye(5_400)).toBe('0:05');
  });
});

describe('çalışma serisi', () => {
  const bugun = new Date(2026, 8, 30, 15);
  const gunler = calismaGunleri([new Date(2026, 8, 28, 9).getTime(), new Date(2026, 8, 29, 23).getTime()], ['2026-09-20', '2026-09-21', '2026-09-22', '2026-09-23']);

  it('bugün çalışılmadıysa seri dünden sayılır', () => {
    expect(seriHesapla(gunler, bugun)).toEqual({ guncel: 2, enUzun: 4, bugun: false });
  });

  it('bugün çalışılınca seri artar; iki gün boşluk seriyi bitirir', () => {
    expect(seriHesapla(new Set([...gunler, '2026-09-30']), bugun).guncel).toBe(3);
    expect(seriHesapla(gunler, new Date(2026, 9, 2)).guncel).toBe(0);
  });

  it('4 haftalık takvim pazartesiden başlar, gelecek günler boş', () => {
    const t = haftalikTakvim(gunler, bugun);
    expect(t).toHaveLength(4);
    expect(t[0][0]!.tarih).toBe('2026-09-07');
    expect(t[3][1]).toEqual({ tarih: '2026-09-29', calisti: true });
    expect(t[3][2]).toEqual({ tarih: '2026-09-30', calisti: false });
    expect(t[3][3]).toBeNull();
  });
});

describe('kelime defteri yardımcıları', () => {
  it('anahtar: noktalama ve büyük harf atılır', () => {
    expect(kelimeAnahtari('  “Evidence,” ')).toBe('evidence');
    expect(kelimeAnahtari('carry   out.')).toBe('carry out');
  });

  it('açıklamadan anlam: birebir eşleşme, yoksa kalıbıyla', () => {
    expect(anlamBul("'shortage' = kıtlık. Ailelerin göç etmesinin nedeni...", 'shortage')).toBe('kıtlık');
    expect(anlamBul("'conduct an experiment' = deney yapmak. Kalıplaşmış bir eşdizimdir.", 'conducted')).toBe(
      'conduct an experiment: deney yapmak',
    );
    expect(anlamBul('Bağlamdan anlam çıkar.', 'word')).toBe('');
  });

  it('bağlam cümlesi ve boşluğu doldurulmuş soru', () => {
    expect(baglamCumlesi('First one. The drug had adverse effects. Last.', 'adverse')).toBe('The drug had adverse effects.');
    expect(soruBaglami('Scientists ---- a series of experiments.', 'conducted')).toBe('Scientists conducted a series of experiments.');
  });

  it('gerçek bankadaki kelime sorularının büyük çoğunluğunda (%80+) anlam bulunur', () => {
    const kel = SORULAR.filter((s) => s.bolum === 'kel');
    const bulunan = kel.filter((s) => anlamBul(s.aciklama, s.secenekler[s.dogru]) !== '').length;
    expect(bulunan / kel.length).toBeGreaterThan(0.8);
  });
});
