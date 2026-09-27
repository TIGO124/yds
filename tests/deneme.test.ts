import { describe, expect, it } from 'vitest';
import { SORULAR } from '../src/data/bank';
import { DENEME_DAGILIMI, DENEME_SORU, denemeOlustur, ydsPuani, ydsSeviyesi } from '../src/engine/deneme';
import { mulberry32 } from '../src/engine/rng';

const soruMap = new Map(SORULAR.map((s) => [s.id, s]));

describe('deneme sınavı', () => {
  const d = denemeOlustur(SORULAR, new Set(), mulberry32(5));

  it('80 soru, YDS bölüm dağılımı ve sırasıyla', () => {
    expect(DENEME_SORU).toBe(80);
    expect(d.soru_idleri).toHaveLength(80);
    expect(new Set(d.soru_idleri).size).toBe(80);
    expect(d.eksik).toEqual([]);
    const bolumler = d.soru_idleri.map((id) => soruMap.get(id)!.bolum);
    let i = 0;
    for (const { bolum, adet } of DENEME_DAGILIMI) {
      expect(bolumler.slice(i, i + adet).every((b) => b === bolum)).toBe(true);
      i += adet;
    }
  });

  it('ortak parçalı sorular bitişik gelir', () => {
    const paragraflar = d.soru_idleri.map((id) => soruMap.get(id)!.paragraf_id).filter(Boolean);
    const gorulen = new Set<string>();
    let onceki: string | null | undefined;
    for (const p of paragraflar) {
      if (p !== onceki) {
        expect(gorulen.has(p!)).toBe(false);
        gorulen.add(p!);
      }
      onceki = p;
    }
  });

  it('çözülmüş sorular gelmez; yetmeyen bölüm raporlanır', () => {
    const cozulmus = new Set(SORULAR.filter((s) => s.bolum === 'bozan').slice(3).map((s) => s.id));
    const e = denemeOlustur(SORULAR, cozulmus, mulberry32(1));
    for (const id of e.soru_idleri) expect(cozulmus.has(id)).toBe(false);
    expect(e.eksik).toEqual([{ bolum: 'bozan', istenen: 5, bulunan: 3 }]);
  });

  it('YDS puanı ve seviyesi', () => {
    expect(ydsPuani(61, 80)).toBe(76.25);
    expect(ydsPuani(80, 80)).toBe(100);
    expect(ydsSeviyesi(76.25)).toBe('C');
    expect(ydsSeviyesi(90)).toBe('A');
    expect(ydsSeviyesi(49.99)).toBe('—');
  });
});
