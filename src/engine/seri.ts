import { tarihMetni } from './program';

/** Günlük çalışma serisi: test bitirilen ya da kelime kartı çalışılan günler. */
export interface Seri {
  /** Bugün (ya da bugün henüz çalışılmadıysa dün) biten ardışık gün sayısı */
  guncel: number;
  enUzun: number;
  /** Bugün çalışıldı mı */
  bugun: boolean;
}

/** Anlardan (ms) ve hazır gün metinlerinden (YYYY-AA-GG) gün kümesi. */
export function calismaGunleri(anlar: Iterable<number>, gunler: Iterable<string> = []): Set<string> {
  const s = new Set<string>(gunler);
  for (const a of anlar) s.add(tarihMetni(new Date(a)));
  return s;
}

const kaydir = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);

function metindenTarih(g: string): Date {
  const [y, a, gun] = g.split('-').map(Number);
  return new Date(y, a - 1, gun);
}

export function seriHesapla(gunler: ReadonlySet<string>, bugun: Date): Seri {
  const bugunCalisti = gunler.has(tarihMetni(bugun));
  let guncel = 0;
  // Bugün henüz çalışılmadıysa seri dünden sayılır; gün bitene kadar bozulmuş sayılmaz.
  for (let d = bugunCalisti ? bugun : kaydir(bugun, -1); gunler.has(tarihMetni(d)); d = kaydir(d, -1)) guncel++;

  let enUzun = 0;
  let sure = 0;
  let onceki: string | null = null;
  for (const g of [...gunler].sort()) {
    sure = onceki !== null && tarihMetni(kaydir(metindenTarih(onceki), 1)) === g ? sure + 1 : 1;
    enUzun = Math.max(enUzun, sure);
    onceki = g;
  }
  return { guncel, enUzun, bugun: bugunCalisti };
}

/** Son n haftanın takvimi (pazartesiden başlayan satırlar); gelecekteki günler null. */
export function haftalikTakvim(gunler: ReadonlySet<string>, bugun: Date, hafta = 4): ({ tarih: string; calisti: boolean } | null)[][] {
  const pazartesi = kaydir(bugun, -((bugun.getDay() + 6) % 7));
  const bas = kaydir(pazartesi, -7 * (hafta - 1));
  const bugunMetni = tarihMetni(bugun);
  return Array.from({ length: hafta }, (_, h) =>
    Array.from({ length: 7 }, (_, g) => {
      const tarih = tarihMetni(kaydir(bas, h * 7 + g));
      return tarih > bugunMetni ? null : { tarih, calisti: gunler.has(tarih) };
    }),
  );
}
