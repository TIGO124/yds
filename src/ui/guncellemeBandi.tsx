import { useEffect, useState } from 'preact/hooks';
import {
  apkGuncelle,
  bekleyenGuncelleme,
  guncelIndirme,
  guncellemeyiDinle,
  indirmeyiDinle,
  type Guncelleme,
  type Indirme,
} from '../guncelleme';
import { onayla } from './onay';

export function useGuncelleme(): Guncelleme | null {
  const [g, setG] = useState(bekleyenGuncelleme);
  useEffect(() => guncellemeyiDinle(setG), []);
  return g;
}

export function useIndirme(): Indirme | null {
  const [d, setD] = useState(guncelIndirme);
  useEffect(() => indirmeyiDinle(setD), []);
  return d;
}

/** Güncellemeyi uygular. Veriler cihazın veritabanında kalır; yalnızca uygulama dosyaları değişir. */
export async function guncellemeyiUygula(g: Guncelleme): Promise<void> {
  if (g.tur === 'web') return g.uygula();
  if (guncelIndirme()?.tur === 'indiriliyor') return;
  const notlar = g.notlar.length ? `\n\nYenilikler:\n• ${g.notlar.join('\n• ')}` : '';
  const evet = await onayla(
    `Sürüm ${g.surum} uygulamanın içinde indirilecek; bitince Android "Güncelle" onayını soracak.\n\n` +
      `Testlerin ve istatistiklerin korunur. İlk seferde Android, YDS Çalışma'nın güncelleme kurmasına izin vermeni isteyebilir; ` +
      `izni verdikten sonra geri dön.${notlar}`,
    { onay: 'Güncelle' },
  );
  if (evet) await apkGuncelle(g);
}

/** İndirme ve kurulum durumu metni (bant ve Ayarlar ortak). */
export function indirmeMetni(g: Extract<Guncelleme, { tur: 'android' }>, d: Indirme): string {
  if (d.tur === 'indiriliyor') return `Sürüm ${g.surum} indiriliyor${d.yuzde === null ? '…' : ` · %${d.yuzde}`}`;
  if (d.tur === 'kurulum') return 'Kurulum ekranı açıldı. Açılmadıysa ya da vazgeçtiysen yeniden dene.';
  return d.mesaj;
}

export function IndirmeCubugu({ d }: { d: Indirme }) {
  if (d.tur !== 'indiriliyor') return null;
  return (
    <span class={`bant-ilerleme${d.yuzde === null ? ' belirsiz' : ''}`} role="progressbar" aria-valuenow={d.yuzde ?? undefined} aria-valuemin={0} aria-valuemax={100}>
      <span style={{ width: `${d.yuzde ?? 30}%` }} />
    </span>
  );
}

// "Sonra" denince bu oturumda bir daha gösterme; Ayarlar'dan yine güncellenebilir.
let kapatildi = false;

export function GuncellemeBandi() {
  const g = useGuncelleme();
  const d = useIndirme();
  const [, yenile] = useState(0);
  if (!g) return null;

  if (g.tur === 'android' && d) {
    return (
      <div class={`guncelleme-bandi${d.tur === 'hata' ? ' hata' : ''}`} role="status">
        <span>{indirmeMetni(g, d)}</span>
        <IndirmeCubugu d={d} />
        {d.tur !== 'indiriliyor' && (
          <div class="bant-dugmeler">
            <button class="dugme birincil" onClick={() => void apkGuncelle(g)}>
              Yeniden dene
            </button>
          </div>
        )}
      </div>
    );
  }

  if (kapatildi) return null;
  return (
    <div class="guncelleme-bandi" role="status">
      <span>{g.tur === 'web' ? 'Yeni sürüm hazır.' : `Yeni sürüm ${g.surum} çıktı.`}</span>
      <div class="bant-dugmeler">
        <button class="dugme birincil" onClick={() => void guncellemeyiUygula(g)}>
          Güncelle
        </button>
        <button
          class="dugme metin"
          onClick={() => {
            kapatildi = true;
            yenile((n) => n + 1);
          }}
        >
          Sonra
        </button>
      </div>
    </div>
  );
}
