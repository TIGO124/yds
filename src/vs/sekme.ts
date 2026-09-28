// Geliştirme: her sekme ayrı oyuncu; ortak sunucu SharedWorker'da (sekmeSunucusu.ts).
import type { VsBaglanti } from './baglanti';
import type { Istek, Yanit } from './sekmeSunucusu';

type IstekGovdesi = Istek extends infer I ? (I extends Istek ? Omit<I, 'id' | 'uid'> : never) : never;

export function sekmeBaglantisi(): VsBaglanti {
  let uid = sessionStorage.getItem('vs-yerel-uid');
  if (!uid) {
    uid = `sekme-${Math.random().toString(36).slice(2, 8)}`;
    sessionStorage.setItem('vs-yerel-uid', uid);
  }
  const ben = uid;
  const isci = new SharedWorker(new URL('./sekmeSunucusu.ts', import.meta.url), { type: 'module', name: 'vs-sekme' });
  const port = isci.port;
  let sayac = 0;
  const bekleyen = new Map<number, (y: { deger?: unknown; tamam?: boolean }) => void>();
  const dinleyiciler = new Map<number, (d: unknown) => void>();
  port.onmessage = ({ data }: MessageEvent<Yanit>) => {
    if ('dinle' in data) dinleyiciler.get(data.dinle)?.(data.deger);
    else {
      bekleyen.get(data.id)?.(data);
      bekleyen.delete(data.id);
    }
  };
  port.start();
  const istek = (m: IstekGovdesi) =>
    new Promise<{ deger?: unknown; tamam?: boolean }>((coz) => {
      const id = ++sayac;
      bekleyen.set(id, coz);
      port.postMessage({ ...m, id, uid: ben });
    });
  window.addEventListener('pagehide', () => port.postMessage({ tip: 'kopar', id: 0, uid: ben }));

  return {
    uid: ben,
    simdi: () => Date.now(),
    oku: async <T>(yol: string) => ((await istek({ tip: 'oku', yol })).deger ?? null) as T | null,
    yaz: async (yol, deger) => void (await istek({ tip: 'yaz', yol, deger })),
    islem: async <T>(yol: string, fn: (m: T | null) => T | null | undefined) => {
      let mevcut = ((await istek({ tip: 'oku', yol })).deger ?? null) as T | null;
      for (let deneme = 0; deneme < 25; deneme++) {
        const yeni = fn(mevcut);
        if (yeni === undefined) return false;
        const r = await istek({ tip: 'cas', yol, beklenen: JSON.stringify(mevcut), deger: yeni });
        if (r.tamam) return true;
        mevcut = (r.deger ?? null) as T | null;
      }
      return false;
    },
    dinle: <T>(yol: string, cb: (d: T | null) => void) => {
      const id = ++sayac;
      dinleyiciler.set(id, cb as (d: unknown) => void);
      port.postMessage({ tip: 'dinle', id, uid: ben, yol });
      return () => {
        dinleyiciler.delete(id);
        port.postMessage({ tip: 'birak', id, uid: ben });
      };
    },
    kopunca: async (yol, deger) => void (await istek({ tip: 'kopunca', yol, deger })),
    kopuncaIptal: async (yol) => void (await istek({ tip: 'kopuncaIptal', yol })),
    baglantiDinle: (cb) => {
      cb(true);
      return () => undefined;
    },
  };
}
