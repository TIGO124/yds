// VS düello: takma ad, rakip arama ve maç ekranına geçiş.
import { useEffect, useRef, useState } from 'preact/hooks';
import { SORULAR } from '../data/bank';
import { VS_DURUMU, vsBaglantisi } from '../vs/baglan';
import type { VsBaglanti } from '../vs/baglanti';
import { rakipAra } from '../vs/istemci';
import { VS, adTemizle } from '../vs/oyun';
import { Sayfa, Ust } from './ortak';
import { VsMacEkrani } from './VsMac';

const AD_ANAHTARI = 'vs-ad';
const ISTATISTIK_ANAHTARI = 'vs-istatistik';

export interface VsIstatistik {
  oynanan: number;
  galibiyet: number;
  beraberlik: number;
  /** Aynı maç iki kez sayılmasın */
  son: string | null;
}

// localStorage yalnızca kolaylık için: gizli pencerede ya da engelliyse sessizce yok sayılır.
function yerelOku<T>(anahtar: string, varsayilan: T): T {
  try {
    const v = localStorage.getItem(anahtar);
    return v === null ? varsayilan : (JSON.parse(v) as T);
  } catch {
    return varsayilan;
  }
}
function yerelYaz(anahtar: string, deger: unknown): void {
  try {
    localStorage.setItem(anahtar, JSON.stringify(deger));
  } catch {
    // depolama kapalı
  }
}

export const istatistikOku = (): VsIstatistik => yerelOku(ISTATISTIK_ANAHTARI, { oynanan: 0, galibiyet: 0, beraberlik: 0, son: null });

export function istatistikKaydet(macId: string, sonuc: 'galibiyet' | 'maglubiyet' | 'beraberlik'): void {
  const i = istatistikOku();
  if (i.son === macId) return;
  yerelYaz(ISTATISTIK_ANAHTARI, {
    oynanan: i.oynanan + 1,
    galibiyet: i.galibiyet + (sonuc === 'galibiyet' ? 1 : 0),
    beraberlik: i.beraberlik + (sonuc === 'beraberlik' ? 1 : 0),
    son: macId,
  });
}

const sureMetni = (ms: number) => {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

type Durum = { tip: 'lobi' } | { tip: 'baglaniyor' } | { tip: 'araniyor'; baslangic: number } | { tip: 'mac'; macId: string };

export function VsEkrani({ otomatik }: { otomatik: boolean }) {
  const kayitliAd = yerelOku<string>(AD_ANAHTARI, '');
  const [ad, setAd] = useState(() => kayitliAd || `Oyuncu ${Math.floor(100 + Math.random() * 900)}`);
  const [durum, setDurum] = useState<Durum>({ tip: 'lobi' });
  const [hata, setHata] = useState<string | null>(null);
  const [not, setNot] = useState<string | null>(null);
  const [, setTik] = useState(0);
  const baglanti = useRef<VsBaglanti | null>(null);
  const iptal = useRef<(() => void) | null>(null);

  const ara = async () => {
    const temiz = adTemizle(ad);
    if (!temiz) {
      setHata('Rakibin göreceği bir takma ad yaz.');
      return;
    }
    setAd(temiz);
    yerelYaz(AD_ANAHTARI, temiz);
    setHata(null);
    setDurum({ tip: 'baglaniyor' });
    try {
      const b = (baglanti.current = await vsBaglantisi());
      setDurum({ tip: 'araniyor', baslangic: Date.now() });
      iptal.current = rakipAra(b, temiz, () => SORULAR, (o) => {
        iptal.current = null;
        if (o.tip === 'eslesti') setDurum({ tip: 'mac', macId: o.macId });
        else {
          setHata(o.mesaj);
          setDurum({ tip: 'lobi' });
        }
      });
    } catch (e) {
      setHata(e instanceof Error ? e.message : String(e));
      setDurum({ tip: 'lobi' });
    }
  };

  const vazgec = () => {
    iptal.current?.();
    iptal.current = null;
    setNot(null);
    setDurum({ tip: 'lobi' });
  };

  // Ana sayfadaki "Rakip bul": takma ad daha önce seçildiyse aramaya hemen başla.
  useEffect(() => {
    if (otomatik && kayitliAd && VS_DURUMU !== 'kapali') void ara();
    return () => iptal.current?.();
  }, []);

  // Arama süresi sayacı
  useEffect(() => {
    if (durum.tip !== 'araniyor') return;
    const z = setInterval(() => setTik((t) => t + 1), 1000);
    return () => clearInterval(z);
  }, [durum.tip]);

  if (durum.tip === 'mac' && baglanti.current) {
    return (
      <VsMacEkrani
        key={durum.macId}
        b={baglanti.current}
        macId={durum.macId}
        yenidenAra={(mesaj) => {
          setNot(mesaj);
          void ara();
        }}
      />
    );
  }

  const istatistik = istatistikOku();

  return (
    <Sayfa>
      <Ust baslik="VS düello" geri="/" />
      {VS_DURUMU === 'kapali' ? (
        <section class="kart">
          <p>VS sunucusu henüz kurulmadı; bu sürümde düello açık değil.</p>
        </section>
      ) : durum.tip === 'araniyor' || durum.tip === 'baglaniyor' ? (
        <section class="kart vurgu vs-arama" aria-live="polite">
          <p class="etiket-ust">{durum.tip === 'baglaniyor' ? 'Sunucuya bağlanılıyor' : 'Rakip aranıyor'}</p>
          <p class="buyuk-metin">
            {durum.tip === 'araniyor' ? sureMetni(Date.now() - durum.baslangic) : '…'}
            <span class="vs-nokta" aria-hidden="true" />
          </p>
          {not && <p class="soluk kucuk">{not}</p>}
          <p class="soluk kucuk">Başka bir cihazda biri VS'de "Rakip bul"a bastığında maç kendiliğinden başlar.</p>
          <button class="dugme ikincil genis" onClick={vazgec}>
            Vazgeç
          </button>
        </section>
      ) : (
        <section class="kart vurgu">
          <p class="etiket-ust">Nasıl oynanır</p>
          <ul class="vs-kurallar">
            <li>
              Rastgele bir rakiple aynı {VS.SORU_SAYISI} soruyu aynı anda çözersiniz; her soruya {VS.SORU_SURE / 1000} saniye.
            </li>
            <li>Doğru cevap 100 puan, hızlıysan 50'ye kadar ek puan.</li>
            <li>İkiniz de cevaplayınca doğru şık gösterilir ve sıradaki soruya geçilir.</li>
          </ul>
          <div class="alan">
            <label class="soluk kucuk" for="vs-ad">
              Takma adın (rakibin görür)
            </label>
            <input id="vs-ad" value={ad} maxLength={16} autocomplete="nickname" onInput={(e) => setAd(e.currentTarget.value)} />
          </div>
          <button class="dugme birincil genis" onClick={() => void ara()}>
            Rakip bul
          </button>
          {VS_DURUMU === 'yerel' && (
            <p class="soluk kucuk">Geliştirme modu: aynı tarayıcıda iki sekme aç, ikisinde de "Rakip bul"a bas.</p>
          )}
        </section>
      )}
      {hata && (
        <p class="hata-kutu" role="alert">
          {hata}
        </p>
      )}
      {istatistik.oynanan > 0 && (
        <section class="istatistik-satiri" aria-label="VS özeti">
          <div class="istatistik">
            <strong>{istatistik.oynanan}</strong>
            <span>maç</span>
          </div>
          <div class="istatistik">
            <strong>{istatistik.galibiyet}</strong>
            <span>galibiyet</span>
          </div>
          <div class="istatistik">
            <strong>{istatistik.oynanan - istatistik.galibiyet - istatistik.beraberlik}</strong>
            <span>mağlubiyet</span>
          </div>
        </section>
      )}
    </Sayfa>
  );
}
