// Bellek içi VS sunucusu: testlerde iki oyuncuyu aynı süreçte, geliştirmede aynı tarayıcının
// sekmelerini (SharedWorker, sekmeSunucusu.ts) eşleştirir. Firebase'in davranışını taklit eder:
// null yazılan ve boş kalan düğümler silinir.
import type { VsBaglanti } from './baglanti';

type Agac = Record<string, unknown>;

const parcala = (yol: string) => yol.split('/').filter(Boolean);
const kopya = <T>(d: T): T => (d === undefined ? d : (JSON.parse(JSON.stringify(d)) as T));

function degerAl(agac: Agac, yol: string): unknown {
  let d: unknown = agac;
  for (const p of parcala(yol)) {
    if (d === null || typeof d !== 'object') return null;
    d = (d as Agac)[p];
  }
  return d ?? null;
}

/** null ve boş nesneleri temizler (Firebase'de boş düğüm olmaz). */
function temizle(d: unknown): unknown {
  if (d === null || d === undefined) return null;
  if (typeof d !== 'object') return d;
  const girdiler = Object.entries(d as Agac)
    .map(([k, v]) => [k, temizle(v)] as const)
    .filter(([, v]) => v !== null);
  if (girdiler.length === 0) return null;
  return Array.isArray(d) ? girdiler.reduce<unknown[]>((a, [k, v]) => ((a[Number(k)] = v), a), []) : Object.fromEntries(girdiler);
}

function degerKoy(agac: Agac, yol: string, deger: unknown): Agac {
  const parcalar = parcala(yol);
  if (parcalar.length === 0) return (temizle(kopya(deger)) as Agac | null) ?? {};
  const kok = kopya(agac);
  let d = kok;
  for (const p of parcalar.slice(0, -1)) {
    if (d[p] === null || typeof d[p] !== 'object') d[p] = {};
    d = d[p] as Agac;
  }
  d[parcalar[parcalar.length - 1]] = kopya(deger);
  return (temizle(kok) as Agac | null) ?? {};
}

interface Dinleyici {
  yol: string;
  cb: (d: unknown) => void;
  son: string;
}

export class BellekSunucu {
  private dinleyiciler = new Set<Dinleyici>();
  private kopunca = new Map<string, Map<string, unknown>>();
  private baglantilar = new Map<string, Set<(b: boolean) => void>>();
  private agac: Agac = {};

  al(yol: string): unknown {
    return kopya(degerAl(this.agac, yol));
  }

  koy(yol: string, deger: unknown): void {
    this.agac = degerKoy(this.agac, yol, deger);
    this.bildir();
  }

  private bildir(): void {
    for (const d of [...this.dinleyiciler]) {
      if (!this.dinleyiciler.has(d)) continue;
      const v = this.al(d.yol);
      const j = JSON.stringify(v);
      if (j === d.son) continue;
      d.son = j;
      d.cb(v);
    }
  }

  /** Oyuncunun bağlantısı koptu: kayıtlı "kopunca" yazımları uygulanır. */
  kopar(uid: string): void {
    for (const [yol, deger] of this.kopunca.get(uid) ?? []) this.koy(yol, deger);
    this.kopunca.delete(uid);
    for (const cb of this.baglantilar.get(uid) ?? []) cb(false);
  }

  baglanti(uid: string, saat: () => number = Date.now): VsBaglanti {
    return {
      uid,
      simdi: saat,
      oku: async <T>(yol: string) => this.al(yol) as T | null,
      yaz: async (yol, deger) => this.koy(yol, deger),
      islem: async <T>(yol: string, fn: (m: T | null) => T | null | undefined) => {
        const yeni = fn(this.al(yol) as T | null);
        if (yeni === undefined) return false;
        this.koy(yol, yeni);
        return true;
      },
      dinle: <T>(yol: string, cb: (d: T | null) => void) => {
        const d: Dinleyici = { yol, cb: cb as (d: unknown) => void, son: JSON.stringify(this.al(yol)) };
        this.dinleyiciler.add(d);
        cb(this.al(yol) as T | null);
        return () => void this.dinleyiciler.delete(d);
      },
      kopunca: async (yol, deger) => {
        if (!this.kopunca.has(uid)) this.kopunca.set(uid, new Map());
        this.kopunca.get(uid)!.set(yol, deger);
      },
      kopuncaIptal: async (yol) => void this.kopunca.get(uid)?.delete(yol),
      baglantiDinle: (cb) => {
        if (!this.baglantilar.has(uid)) this.baglantilar.set(uid, new Set());
        this.baglantilar.get(uid)!.add(cb);
        cb(true);
        return () => void this.baglantilar.get(uid)?.delete(cb);
      },
    };
  }
}
