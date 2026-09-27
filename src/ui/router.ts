import { useEffect, useState } from 'preact/hooks';

export interface Rota {
  yol: string[];
  sorgu: URLSearchParams;
}

function coz(): Rota {
  const hash = location.hash.replace(/^#\/?/, '');
  const [yol, sorgu = ''] = hash.split('?');
  return { yol: yol.split('/').filter(Boolean), sorgu: new URLSearchParams(sorgu) };
}

export function useRota(): Rota {
  const [rota, setRota] = useState(coz);
  useEffect(() => {
    const dinle = () => {
      setRota(coz());
      window.scrollTo(0, 0);
    };
    window.addEventListener('hashchange', dinle);
    return () => window.removeEventListener('hashchange', dinle);
  }, []);
  return rota;
}

/** Hash tabanlı gezinme; geçmişe yazmadan geçmek için degistir=true. */
export function git(yol: string, degistir = false): void {
  const hedef = `#${yol.startsWith('/') ? yol : `/${yol}`}`;
  if (degistir) {
    history.replaceState(null, '', hedef);
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  } else {
    location.hash = hedef;
  }
}

/**
 * "#/..." bağlantılarını gezinmeye çevirir. claude.ai çerçevesi bağlantı tıklamalarını kendisi
 * işlediğinden hash bağlantıları orada sayfayı değiştirmiyor; tıklamayı yakalayıp git() ile yönlendir.
 */
export function hashBaglantilariniYakala(): void {
  window.addEventListener(
    'click',
    (e) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as Element | null)?.closest?.('a[href^="#/"]');
      if (!a) return;
      e.preventDefault();
      git(a.getAttribute('href')!.slice(1));
    },
    true,
  );
}
