import { render } from 'preact';
import { App } from './app';
import { kayitliPaketiUygula, yeniSorulariDenetle } from './data/guncelleme';
import { depo } from './depo';
import './styles/temel.css';
import './styles/ekranlar.css';
import './styles/program.css';
import { bildir } from './ui/bildirim';
import { hashBaglantilariniYakala } from './ui/router';

// Tarayıcının depolamayı silmemesi için kalıcı depolama iste (özellikle iOS).
navigator.storage?.persist?.().catch(() => undefined);

hashBaglantilariniYakala();

async function baslat() {
  const android = import.meta.env.MODE === 'android';
  if (android) {
    // Geri tuşu sayfalar arasında geri gider, ilk sayfada uygulamayı kapatır.
    void import('@capacitor/app').then(({ App }) =>
      App.addListener('backButton', ({ canGoBack }) => (canGoBack ? history.back() : App.exitApp())),
    );
    // Daha önce indirilmiş yeni sorular (internet gerekmez).
    await kayitliPaketiUygula(depo);
  }

  render(<App />, document.getElementById('app')!);

  // Android uygulaması internet varsa yeni soru paketini arka planda denetler.
  // (Web sürümü yeni soruları service worker güncellemesiyle alır.)
  if (android && navigator.onLine) {
    const sonuc = await yeniSorulariDenetle(depo);
    if (sonuc.durum === 'guncellendi' && sonuc.yeni > 0) bildir(`${sonuc.yeni} yeni soru eklendi. İlerlemen korundu.`);
  }
}

void baslat();
