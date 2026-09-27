import { useEffect, useState } from 'preact/hooks';
import { depo } from './depo';
import { tarihMetni } from './engine/program';
import type { Ayarlar } from './types';
import { AnaSayfa } from './ui/AnaSayfa';
import { AyarlarEkrani } from './ui/AyarlarEkrani';
import { Ilerleme } from './ui/Ilerleme';
import { Bildirim } from './ui/bildirim';
import { OnayKutusu } from './ui/onay';
import { Yukleniyor } from './ui/ortak';
import { Program } from './ui/Program';
import { useRota } from './ui/router';
import { SeviyeRaporu } from './ui/SeviyeRaporu';
import { Sonuc } from './ui/Sonuc';
import { TestEkrani } from './ui/TestEkrani';
import { Yanlislar } from './ui/Yanlislar';

const sistemKoyu = () => matchMedia('(prefers-color-scheme: dark)');

function temaUygula(tema: Ayarlar['tema']) {
  const kok = document.documentElement;
  // claude.ai kendi tema seçimini data-theme ile işaretler; "Sistem" seçiliyken ona dokunma.
  if (tema === 'sistem') {
    if (import.meta.env.MODE !== 'artifact') kok.removeAttribute('data-theme');
  }
  else kok.setAttribute('data-theme', tema === 'koyu' ? 'dark' : 'light');
  const koyu = tema === 'koyu' || (tema === 'sistem' && sistemKoyu().matches);
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', koyu ? '#0e0f1a' : '#f7f5fc');
}

function Ekran({ ayar, degistir }: { ayar: Ayarlar; degistir: (a: Partial<Ayarlar>) => void }) {
  const rota = useRota();
  const [sayfa, param] = rota.yol;
  const id = Number(param);
  switch (sayfa) {
    case 'test':
      return <TestEkrani key={id} id={id} />;
    case 'sonuc':
      return <Sonuc key={id} id={id} />;
    case 'rapor': {
      const t = Number(rota.sorgu.get('test'));
      return <SeviyeRaporu testId={Number.isFinite(t) && t > 0 ? t : null} />;
    }
    case 'program':
      return <Program ayar={ayar} degistir={degistir} />;
    case 'ilerleme':
      return <Ilerleme />;
    case 'yanlislar':
      return <Yanlislar />;
    case 'ayarlar':
      return <AyarlarEkrani ayar={ayar} degistir={degistir} />;
    default:
      return <AnaSayfa ayar={ayar} />;
  }
}

export function App() {
  const [ayar, setAyar] = useState<Ayarlar | null>(null);
  const [hata, setHata] = useState<string | null>(null);
  // Uygulama gece açık kalıp ertesi gün öne gelince "Bugün" ve program yeniden hesaplansın.
  const [gun, setGun] = useState(() => tarihMetni(new Date()));

  useEffect(() => {
    const kontrol = () => {
      if (document.visibilityState === 'visible') setGun(tarihMetni(new Date()));
    };
    document.addEventListener('visibilitychange', kontrol);
    window.addEventListener('focus', kontrol);
    const zamanlayici = setInterval(kontrol, 60_000);
    return () => {
      document.removeEventListener('visibilitychange', kontrol);
      window.removeEventListener('focus', kontrol);
      clearInterval(zamanlayici);
    };
  }, []);

  useEffect(() => {
    depo
      .ayarlar()
      .then(setAyar)
      .catch(() => setHata('Cihaz depolaması açılamadı. Gizli pencere kullanıyorsan normal pencerede aç ya da tarayıcının site verisi iznini kontrol et.'));
  }, []);

  useEffect(() => {
    if (!ayar) return;
    temaUygula(ayar.tema);
    // Sistem teması değişince tarayıcı çubuğu rengini de güncelle.
    const mq = sistemKoyu();
    const dinle = () => temaUygula(ayar.tema);
    mq.addEventListener?.('change', dinle);
    return () => mq.removeEventListener?.('change', dinle);
  }, [ayar?.tema]);

  if (!ayar) return <Yukleniyor hata={hata} />;

  const degistir = (d: Partial<Ayarlar>) => {
    setAyar((onceki) => ({ ...onceki!, ...d }));
    depo.ayarKaydet(d).catch((e) => console.error('Ayar kaydedilemedi', e));
  };

  return (
    <>
      <Ekran key={gun} ayar={ayar} degistir={degistir} />
      <OnayKutusu />
      <Bildirim />
    </>
  );
}
