import { useEffect, useRef, useState } from 'preact/hooks';
import { SORU_MAP } from '../data/bank';
import { depo } from '../depo';
import { anlamBul, baglamCumlesi, kelimeAnahtari, soruBaglami } from '../engine/kelime';
import type { Soru } from '../types';
import { bildir } from './bildirim';

interface Taslak {
  kelime: string;
  anlam: string;
  baglam: string;
  soru_id: string | null;
}

async function kaydet(t: Taslak): Promise<boolean> {
  try {
    const sonuc = await depo.kelimeEkle(t);
    const k = kelimeAnahtari(t.kelime);
    bildir(sonuc === 'eklendi' ? `"${k}" kelime defterine eklendi.` : `"${k}" zaten defterinde.`);
    return true;
  } catch (e) {
    bildir(e instanceof Error ? e.message : String(e));
    return false;
  }
}

/** Kelime/kalıp sorusunun doğru cevabını tek dokunuşla deftere ekler (anlam açıklamadan alınır). */
export function DeftereEkle({ soru }: { soru: Soru }) {
  const [eklendi, setEklendi] = useState(false);
  if (!soru.konu.startsWith('kel.')) return null;
  const kelime = soru.secenekler[soru.dogru];
  const ekle = async () => {
    const tamam = await kaydet({ kelime, anlam: anlamBul(soru.aciklama, kelime), baglam: soruBaglami(soru.soru, kelime), soru_id: soru.id });
    if (tamam) setEklendi(true);
  };
  return (
    <button class="dugme metin deftere-ekle" onClick={ekle} disabled={eklendi}>
      {eklendi ? 'Deftere eklendi' : `"${kelime}" kelimesini deftere ekle`}
    </button>
  );
}

/**
 * İngilizce metinde (lang="en") bir kelime ya da kısa kalıp seçilince alt kısımda "Deftere ekle" çubuğu
 * gösterir. Soru kabında data-soru ve data-cevap-acik varsa anlam açıklamadan doldurulur (cevap açıksa).
 */
export function KelimeSecici() {
  const [secim, setSecim] = useState<Taslak | null>(null);
  const [form, setForm] = useState<Taslak | null>(null);
  const temizle = useRef<ReturnType<typeof setTimeout>>();
  const anlamAlani = useRef<HTMLInputElement>(null);
  const formAcik = form !== null;
  useEffect(() => {
    if (formAcik) anlamAlani.current?.focus();
  }, [formAcik]);

  useEffect(() => {
    let bekle: ReturnType<typeof setTimeout> | undefined;
    const dinle = () => {
      clearTimeout(bekle);
      bekle = setTimeout(() => {
        const sel = document.getSelection();
        const metin = sel?.toString().replace(/\s+/g, ' ').trim() ?? '';
        const dugum = sel && sel.rangeCount > 0 ? sel.anchorNode : null;
        const kap = (dugum instanceof Element ? dugum : dugum?.parentElement)?.closest<HTMLElement>('[lang="en"]');
        if (!metin || !kap || metin.length > 60 || metin.split(' ').length > 5 || !/\p{L}/u.test(metin)) {
          // Çubuğa dokunmak seçimi kaldırabilir: çubuk hemen kaybolmasın.
          clearTimeout(temizle.current);
          temizle.current = setTimeout(() => setSecim(null), 700);
          return;
        }
        clearTimeout(temizle.current);
        const soruKap = kap.closest<HTMLElement>('[data-soru]');
        const soru = soruKap ? SORU_MAP.get(soruKap.dataset.soru!) : undefined;
        const cevapAcik = soruKap?.dataset.cevapAcik === '1';
        setSecim({
          kelime: metin,
          anlam: soru && cevapAcik ? anlamBul(soru.aciklama, metin) : '',
          baglam: baglamCumlesi(kap.textContent ?? '', metin),
          soru_id: soru?.id ?? null,
        });
      }, 250);
    };
    document.addEventListener('selectionchange', dinle);
    return () => {
      document.removeEventListener('selectionchange', dinle);
      clearTimeout(bekle);
      clearTimeout(temizle.current);
    };
  }, []);

  if (form) {
    const gonder = async (e: Event) => {
      e.preventDefault();
      if (await kaydet(form)) setForm(null);
    };
    return (
      <div class="onay-arka" onClick={() => setForm(null)}>
        <form class="onay-kutu kelime-formu" role="dialog" aria-modal="true" aria-label="Kelime defterine ekle" onClick={(e) => e.stopPropagation()} onSubmit={gonder}>
          <label class="alan">
            <span class="soluk kucuk">Kelime ya da kalıp</span>
            <input value={form.kelime} lang="en" onInput={(e) => setForm({ ...form, kelime: (e.target as HTMLInputElement).value })} />
          </label>
          <label class="alan">
            <span class="soluk kucuk">Anlamı (isteğe bağlı)</span>
            <input
              value={form.anlam}
              placeholder="ör. kanıt"
              ref={anlamAlani}
              onInput={(e) => setForm({ ...form, anlam: (e.target as HTMLInputElement).value })}
            />
          </label>
          {form.baglam && (
            <p class="baglam" lang="en">
              {form.baglam}
            </p>
          )}
          <div class="onay-dugmeler">
            <button type="button" class="dugme ikincil" onClick={() => setForm(null)}>
              Vazgeç
            </button>
            <button type="submit" class="dugme birincil" disabled={!kelimeAnahtari(form.kelime)}>
              Deftere ekle
            </button>
          </div>
        </form>
      </div>
    );
  }

  if (!secim) return null;
  return (
    <div class="kelime-cubugu" role="status">
      <span lang="en">"{secim.kelime}"</span>
      <button
        class="dugme birincil"
        onPointerDown={(e) => e.preventDefault()}
        onClick={() => {
          setForm(secim);
          setSecim(null);
          document.getSelection()?.removeAllRanges();
        }}
      >
        Deftere ekle
      </button>
    </div>
  );
}
