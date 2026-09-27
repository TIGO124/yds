import { useState } from 'preact/hooks';
import { hatirlatmaIzni } from '../hatirlatma';
import type { Ayarlar } from '../types';

const VARSAYILAN_SAAT = '20:00';

/** Android uygulaması: günlük çalışma hatırlatması (açma/kapama ve saat). */
export function HatirlatmaAyari({ ayar, degistir }: { ayar: Ayarlar; degistir: (a: Partial<Ayarlar>) => void }) {
  const [hata, setHata] = useState<string | null>(null);
  const [mesgul, setMesgul] = useState(false);

  const ac = async (acik: boolean) => {
    setHata(null);
    if (!acik) return degistir({ hatirlatma: null });
    setMesgul(true);
    try {
      if (await hatirlatmaIzni()) degistir({ hatirlatma: VARSAYILAN_SAAT });
      else setHata('Bildirim izni verilmedi. Android Ayarlar › Uygulamalar › YDS Çalışma › Bildirimler bölümünden izin verebilirsin.');
    } catch (e) {
      setHata(`Hatırlatma açılamadı: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setMesgul(false);
    }
  };

  return (
    <section class="kart">
      <h2>Hatırlatma</h2>
      <label class="anahtar-satir">
        <span>
          Günlük çalışma hatırlatması
          <small class="soluk">O gün çalıştıysan, dinlenme ya da sınav günündeysen bildirim gelmez.</small>
        </span>
        <input
          type="checkbox"
          role="switch"
          checked={!!ayar.hatirlatma}
          disabled={mesgul}
          onChange={(e) => ac((e.target as HTMLInputElement).checked)}
        />
      </label>
      {ayar.hatirlatma && (
        <label class="alan">
          <span class="soluk kucuk">Saat</span>
          <input
            type="time"
            value={ayar.hatirlatma}
            onChange={(e) => {
              const v = (e.target as HTMLInputElement).value;
              if (/^\d{2}:\d{2}$/.test(v)) degistir({ hatirlatma: v });
            }}
          />
        </label>
      )}
      {hata && (
        <p class="hata-kutu" role="alert">
          {hata}
        </p>
      )}
    </section>
  );
}
