import { useEffect, useRef, useState } from 'preact/hooks';

// Uygulama içi onay kutusu: window.confirm bazı gömülü/sandbox ortamlarda engellenir
// ve telefonlarda görünümü tutarsızdır.
interface Istek {
  mesaj: string;
  onay: string;
  tehlike: boolean;
  coz: (evet: boolean) => void;
}

let goster: ((i: Istek) => void) | null = null;

export function onayla(mesaj: string, secenek: { onay?: string; tehlike?: boolean } = {}): Promise<boolean> {
  return new Promise((coz) => {
    if (!goster) return coz(window.confirm(mesaj));
    goster({ mesaj, onay: secenek.onay ?? 'Tamam', tehlike: !!secenek.tehlike, coz });
  });
}

export function OnayKutusu() {
  const [istek, setIstek] = useState<Istek | null>(null);
  const onayDugmesi = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    goster = setIstek;
    return () => {
      goster = null;
    };
  }, []);

  useEffect(() => {
    if (!istek) return;
    onayDugmesi.current?.focus();
    const tus = (e: KeyboardEvent) => {
      if (e.key === 'Escape') kapat(false);
    };
    window.addEventListener('keydown', tus);
    return () => window.removeEventListener('keydown', tus);
  }, [istek]);

  if (!istek) return null;
  function kapat(evet: boolean) {
    istek!.coz(evet);
    setIstek(null);
  }

  return (
    <div class="onay-arka" onClick={() => kapat(false)}>
      <div
        class="onay-kutu"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="onay-metni"
        onClick={(e) => e.stopPropagation()}
      >
        <p id="onay-metni">{istek.mesaj}</p>
        <div class="onay-dugmeler">
          <button class="dugme ikincil" onClick={() => kapat(false)}>
            Vazgeç
          </button>
          <button ref={onayDugmesi} class={`dugme ${istek.tehlike ? 'tehlike' : 'birincil'}`} onClick={() => kapat(true)}>
            {istek.onay}
          </button>
        </div>
      </div>
    </div>
  );
}
