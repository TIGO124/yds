import { useEffect, useState } from 'preact/hooks';
import { bekleyenGuncelleme, guncellemeyiDinle, type Guncelleme } from '../guncelleme';
import { onayla } from './onay';

export function useGuncelleme(): Guncelleme | null {
  const [g, setG] = useState(bekleyenGuncelleme);
  useEffect(() => guncellemeyiDinle(setG), []);
  return g;
}

/** Güncellemeyi uygular. Veriler cihazın veritabanında kalır; yalnızca uygulama dosyaları değişir. */
export async function guncellemeyiUygula(g: Guncelleme): Promise<void> {
  if (g.tur === 'web') return g.uygula();
  const notlar = g.notlar.length ? `\n\nYenilikler:\n• ${g.notlar.join('\n• ')}` : '';
  const evet = await onayla(
    `Sürüm ${g.surum} indirilecek. İndirme bitince dosyayı aç ve "Güncelle"ye dokun.\n\n` +
      `Testlerin ve istatistiklerin korunur. Uygulamayı kaldırma, üzerine kur.${notlar}`,
    { onay: 'İndir' },
  );
  // Capacitor, uygulama dışı adresleri sistem tarayıcısında açar; APK oradan indirilir.
  if (evet) window.location.href = g.adres;
}

// "Sonra" denince bu oturumda bir daha gösterme; Ayarlar'dan yine güncellenebilir.
let kapatildi = false;

export function GuncellemeBandi() {
  const g = useGuncelleme();
  const [, yenile] = useState(0);
  if (!g || kapatildi) return null;
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
