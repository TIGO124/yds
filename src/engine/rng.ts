// Tohumlanabilir RNG: testlerin tekrarlanabilir olması için.
export type Rng = () => number;

export function mulberry32(tohum: number): Rng {
  let a = tohum >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function karistir<T>(dizi: readonly T[], rng: Rng): T[] {
  const a = [...dizi];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function rastgeleSec<T>(dizi: readonly T[], rng: Rng): T {
  return dizi[Math.floor(rng() * dizi.length)];
}

/** Ağırlıklı rastgele seçim; tüm ağırlıklar 0 ise null döner. */
export function agirlikliSec<T>(adaylar: readonly T[], agirlik: (x: T) => number, rng: Rng): T | null {
  let toplam = 0;
  for (const a of adaylar) toplam += Math.max(0, agirlik(a));
  if (toplam <= 0) return null;
  let r = rng() * toplam;
  for (const a of adaylar) {
    r -= Math.max(0, agirlik(a));
    if (r < 0) return a;
  }
  return adaylar[adaylar.length - 1];
}

/** Metinden kararlı bir 32-bit tohum üretir. */
export function metinTohumu(metin: string): number {
  let h = 2166136261;
  for (let i = 0; i < metin.length; i++) {
    h ^= metin.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
