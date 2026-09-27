import type { Konu, Soru, Zorluk } from '../src/types';

/** Sentetik taksonomi: bölüm başına verilen konu kodları. */
export function sahteKonular(tanim: Record<string, string[]>, agirlik = 0.5): Konu[] {
  return Object.entries(tanim).flatMap(([bolum, kodlar]) =>
    kodlar.map((kod) => ({ kod, ad: kod, bolum, sinav_agirligi: agirlik, oneri: '' })),
  );
}

/** Her konu için n soru; zorluklar 1,2,2,3 döngüsüyle. */
export function sahteSorular(konular: readonly Konu[], n: number): Soru[] {
  const zorluklar: Zorluk[] = [1, 2, 2, 3];
  return konular.flatMap((k) =>
    Array.from({ length: n }, (_, i) => ({
      id: `${k.kod}-${String(i + 1).padStart(4, '0')}`,
      bolum: k.bolum,
      konu: k.kod,
      alt_konu: '',
      zorluk: zorluklar[i % 4],
      soru: `${k.kod} soru ${i}`,
      secenekler: ['a', 'b', 'c', 'd', 'e'],
      dogru: 0,
      aciklama: '',
      paragraf_id: null,
    })),
  );
}

export const say = <T>(dizi: readonly T[], anahtar: (x: T) => string) => {
  const m = new Map<string, number>();
  for (const x of dizi) m.set(anahtar(x), (m.get(anahtar(x)) ?? 0) + 1);
  return m;
};
