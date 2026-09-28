/// <reference lib="webworker" />
// Geliştirme: aynı tarayıcının sekmeleri için tek bir VS sunucusu (SharedWorker). localStorage sekmeler
// arasında gecikmeli eşitlendiği için ortak sunucu bu işçide bellekte tutulur.
import { BellekSunucu } from './bellek';

declare const self: SharedWorkerGlobalScope;

export type Istek =
  | { tip: 'oku'; id: number; uid: string; yol: string }
  | { tip: 'yaz'; id: number; uid: string; yol: string; deger: unknown }
  /** Karşılaştırıp yaz: değer beklenen hâldeyse yazılır (işlemler bunun üzerine kurulur) */
  | { tip: 'cas'; id: number; uid: string; yol: string; beklenen: string; deger: unknown }
  | { tip: 'dinle'; id: number; uid: string; yol: string }
  | { tip: 'birak'; id: number; uid: string }
  | { tip: 'kopunca'; id: number; uid: string; yol: string; deger: unknown }
  | { tip: 'kopuncaIptal'; id: number; uid: string; yol: string }
  | { tip: 'kopar'; id: number; uid: string };

export type Yanit = { id: number; deger?: unknown; tamam?: boolean } | { dinle: number; deger: unknown };

const sunucu = new BellekSunucu();

self.onconnect = (e) => {
  const port = e.ports[0];
  const dinlemeler = new Map<number, () => void>();
  const gonder = (y: Yanit) => port.postMessage(y);
  port.onmessage = async ({ data: m }: MessageEvent<Istek>) => {
    const b = sunucu.baglanti(m.uid);
    switch (m.tip) {
      case 'oku':
        return gonder({ id: m.id, deger: sunucu.al(m.yol) });
      case 'yaz':
        sunucu.koy(m.yol, m.deger);
        return gonder({ id: m.id });
      case 'cas': {
        const tamam = JSON.stringify(sunucu.al(m.yol)) === m.beklenen;
        if (tamam) sunucu.koy(m.yol, m.deger);
        return gonder({ id: m.id, tamam, deger: sunucu.al(m.yol) });
      }
      case 'dinle':
        dinlemeler.set(
          m.id,
          b.dinle(m.yol, (d) => gonder({ dinle: m.id, deger: d })),
        );
        return;
      case 'birak':
        dinlemeler.get(m.id)?.();
        dinlemeler.delete(m.id);
        return;
      case 'kopunca':
        await b.kopunca(m.yol, m.deger);
        return gonder({ id: m.id });
      case 'kopuncaIptal':
        await b.kopuncaIptal(m.yol);
        return gonder({ id: m.id });
      case 'kopar':
        for (const k of dinlemeler.values()) k();
        dinlemeler.clear();
        sunucu.kopar(m.uid);
    }
  };
  port.start();
};
