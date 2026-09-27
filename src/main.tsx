import { render } from 'preact';
import { App } from './app';
import './styles/temel.css';
import './styles/ekranlar.css';
import './styles/program.css';
import { hashBaglantilariniYakala } from './ui/router';

// Tarayıcının depolamayı silmemesi için kalıcı depolama iste (özellikle iOS).
navigator.storage?.persist?.().catch(() => undefined);

hashBaglantilariniYakala();

// Android uygulaması: geri tuşu sayfalar arasında geri gider, ilk sayfada uygulamayı kapatır.
if (import.meta.env.MODE === 'android') {
  void import('@capacitor/app').then(({ App }) =>
    App.addListener('backButton', ({ canGoBack }) => (canGoBack ? history.back() : App.exitApp())),
  );
}

render(<App />, document.getElementById('app')!);
