import { useEffect, useState } from 'preact/hooks';

// Kısa süreli bildirim (ör. "12 yeni soru eklendi"); ekran bileşenlerinden bağımsız çağrılabilir.
const OLAY = 'yds-bildirim';

export function bildir(mesaj: string): void {
  window.dispatchEvent(new CustomEvent<string>(OLAY, { detail: mesaj }));
}

/** Bildirimi gösterir; onDegisim ile ekranın yeniden çizilmesini isteyebilir. */
export function Bildirim({ onGeldi }: { onGeldi?: () => void }) {
  const [mesaj, setMesaj] = useState<string | null>(null);

  useEffect(() => {
    let zamanlayici: ReturnType<typeof setTimeout> | undefined;
    const dinle = (e: Event) => {
      setMesaj((e as CustomEvent<string>).detail);
      onGeldi?.();
      clearTimeout(zamanlayici);
      zamanlayici = setTimeout(() => setMesaj(null), 6000);
    };
    window.addEventListener(OLAY, dinle);
    return () => {
      window.removeEventListener(OLAY, dinle);
      clearTimeout(zamanlayici);
    };
  }, []);

  if (!mesaj) return null;
  return (
    <div class="bildirim" role="status" onClick={() => setMesaj(null)}>
      {mesaj}
    </div>
  );
}
