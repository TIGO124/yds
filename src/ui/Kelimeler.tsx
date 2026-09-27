import { useEffect, useState } from 'preact/hooks';
import { depo } from '../depo';
import { OGRENILDI, siradakiler, sonrakiMetni } from '../engine/tekrar';
import { calisildiBildir } from '../hatirlatma';
import type { KelimeKaydi } from '../types';
import { bildir } from './bildirim';
import { onayla } from './onay';
import { Sayfa, Ust, Yukleniyor, useVeri } from './ortak';

/** Bağlam cümlesinde kelimeyi vurgular. */
function Baglam({ metin, kelime }: { metin: string; kelime: string }) {
  const i = metin.toLocaleLowerCase('en-US').indexOf(kelime);
  if (i < 0) return <>{metin}</>;
  return (
    <>
      {metin.slice(0, i)}
      <mark>{metin.slice(i, i + kelime.length)}</mark>
      {metin.slice(i + kelime.length)}
    </>
  );
}

const durumMetni = (k: KelimeKaydi, simdi: Date) => (k.kutu >= OGRENILDI ? 'Öğrenildi' : sonrakiMetni(k.sonraki, simdi));

/** Kelime defteri: elle ekleme, anlam düzenleme, silme ve kart çalışmasına geçiş. */
export function KelimeDefteri() {
  const [yeni, setYeni] = useState({ kelime: '', anlam: '' });
  const [mesaj, setMesaj] = useState<string | null>(null);
  const [duzenlenen, setDuzenlenen] = useState<{ kelime: string; anlam: string } | null>(null);
  const { veri, hata, yenile } = useVeri(() => depo.kelimeler());
  if (!veri) return <Yukleniyor hata={hata} />;
  const simdi = new Date();
  const sirada = siradakiler(veri, simdi.getTime()).length;
  const ogrenilen = veri.filter((k) => k.kutu >= OGRENILDI).length;

  const ekle = async (e: Event) => {
    e.preventDefault();
    try {
      const sonuc = await depo.kelimeEkle(yeni);
      setMesaj(sonuc === 'eklendi' ? null : 'Bu kelime zaten defterinde.');
      setYeni({ kelime: '', anlam: '' });
      yenile();
    } catch (err) {
      setMesaj(err instanceof Error ? err.message : String(err));
    }
  };

  const sil = async (k: KelimeKaydi) => {
    if (!(await onayla(`"${k.kelime}" defterden silinsin mi?`, { onay: 'Sil', tehlike: true }))) return;
    await depo.kelimeSil(k.kelime);
    yenile();
  };

  const anlamKaydet = async () => {
    if (!duzenlenen) return;
    await depo.kelimeAnlami(duzenlenen.kelime, duzenlenen.anlam);
    setDuzenlenen(null);
    yenile();
  };

  return (
    <Sayfa>
      <Ust baslik="Kelime defteri" geri="" />
      <section class="kart vurgu">
        <p class="buyuk-metin">{sirada} kart sırada</p>
        <p class="soluk kucuk">
          Defterde {veri.length} kelime, {ogrenilen} tanesi öğrenildi. Bildiğin kart 3 ve 7 gün sonra, bilemediğin ertesi gün yeniden
          gelir; üst üste {OGRENILDI} kez bildiğin kelime öğrenilmiş sayılır.
        </p>
        <a class={`dugme birincil genis${sirada === 0 ? ' pasif' : ''}`} href={sirada > 0 ? '#/kartlar' : undefined} aria-disabled={sirada === 0}>
          Kartları çalış
        </a>
      </section>

      <form class="kart" onSubmit={ekle}>
        <h2>Kelime ekle</h2>
        <p class="soluk kucuk">Sorularda bir kelimeyi seçince çıkan "Deftere ekle" çubuğunu da kullanabilirsin.</p>
        <div class="program-ayarlar">
          <label class="alan">
            <span class="soluk kucuk">Kelime ya da kalıp</span>
            <input lang="en" value={yeni.kelime} onInput={(e) => setYeni({ ...yeni, kelime: (e.target as HTMLInputElement).value })} />
          </label>
          <label class="alan">
            <span class="soluk kucuk">Anlamı</span>
            <input value={yeni.anlam} onInput={(e) => setYeni({ ...yeni, anlam: (e.target as HTMLInputElement).value })} />
          </label>
        </div>
        <button class="dugme ikincil genis" type="submit" disabled={!yeni.kelime.trim()}>
          Ekle
        </button>
        {mesaj && (
          <p class="bilgi-kutu" role="status">
            {mesaj}
          </p>
        )}
      </form>

      {veri.length > 0 && (
        <section class="kart">
          <h2>Kelimeler</h2>
          <ul class="kelime-listesi">
            {veri.map((k) => (
              <li>
                <div class="satir-ust">
                  <strong class="kelime" lang="en">
                    {k.kelime}
                  </strong>
                  <span class={`tekrar-durum${k.kutu < OGRENILDI && k.sonraki <= simdi.getTime() ? ' sirada' : ''}`}>{durumMetni(k, simdi)}</span>
                </div>
                {duzenlenen?.kelime === k.kelime ? (
                  <div class="anlam-duzenle">
                    <input
                      class="alan-girdi"
                      value={duzenlenen.anlam}
                      aria-label={`${k.kelime} anlamı`}
                      onInput={(e) => setDuzenlenen({ ...duzenlenen, anlam: (e.target as HTMLInputElement).value })}
                    />
                    <button class="dugme birincil kucuk-dugme" onClick={anlamKaydet}>
                      Kaydet
                    </button>
                  </div>
                ) : (
                  <p class={k.anlam ? '' : 'soluk'}>{k.anlam || 'Anlam eklenmedi'}</p>
                )}
                {k.baglam && (
                  <p class="baglam" lang="en">
                    <Baglam metin={k.baglam} kelime={k.kelime} />
                  </p>
                )}
                <div class="dugme-satiri">
                  <button class="dugme metin" onClick={() => setDuzenlenen({ kelime: k.kelime, anlam: k.anlam })}>
                    Anlamı düzenle
                  </button>
                  <button class="dugme metin tehlike-metin" onClick={() => sil(k)}>
                    Sil
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}
    </Sayfa>
  );
}

/** Kart çalışması: önce kelime ve bağlam, dokununca anlam; "Bildim / Bilemedim" kutuyu belirler. */
export function KelimeKartlari() {
  const [kartlar, setKartlar] = useState<KelimeKaydi[] | null>(null);
  const [hata, setHata] = useState<string | null>(null);
  const [sira, setSira] = useState(0);
  const [acik, setAcik] = useState(false);
  const [anlam, setAnlam] = useState('');
  const [sonuc, setSonuc] = useState({ bildi: 0, bilemedi: 0 });
  const [mesgul, setMesgul] = useState(false);

  useEffect(() => {
    depo
      .siradakiKartlar()
      .then(setKartlar)
      .catch((e: unknown) => setHata(String(e)));
  }, []);

  const kart = kartlar?.[sira];
  const bitti = kartlar !== null && sira >= kartlar.length;

  useEffect(() => {
    if (bitti && kartlar!.length > 0) calisildiBildir();
  }, [bitti]);

  const cevapla = async (bildi: boolean) => {
    if (!kart || mesgul) return;
    setMesgul(true);
    try {
      if (!kart.anlam && anlam.trim()) await depo.kelimeAnlami(kart.kelime, anlam);
      await depo.kartCevapla(kart.kelime, bildi);
    } catch (e) {
      bildir(e instanceof Error ? e.message : String(e));
    }
    setSonuc({ bildi: sonuc.bildi + (bildi ? 1 : 0), bilemedi: sonuc.bilemedi + (bildi ? 0 : 1) });
    setAcik(false);
    setAnlam('');
    setSira(sira + 1);
    setMesgul(false);
  };

  // Klavye: boşluk/Enter anlamı gösterir; sonra ← bilemedim, → bildim.
  useEffect(() => {
    const tus = (e: KeyboardEvent) => {
      if ((e.target as Element | null)?.closest?.('input, textarea')) return;
      if (!acik && (e.key === ' ' || e.key === 'Enter')) {
        e.preventDefault();
        setAcik(true);
      } else if (acik && e.key === 'ArrowLeft') void cevapla(false);
      else if (acik && e.key === 'ArrowRight') void cevapla(true);
    };
    window.addEventListener('keydown', tus);
    return () => window.removeEventListener('keydown', tus);
  });

  if (!kartlar) return <Yukleniyor hata={hata} />;

  if (bitti) {
    return (
      <Sayfa>
        <Ust baslik="Kelime kartları" geri="/kelimeler" />
        <section class="kart skor-kart">
          {kartlar.length === 0 ? (
            <p>Şu an sırası gelen kart yok.</p>
          ) : (
            <>
              <p class="soluk">Oturum bitti</p>
              <p class="skor">
                {sonuc.bildi}
                <span>/{kartlar.length}</span>
              </p>
              <p class="soluk">
                {sonuc.bilemedi > 0 ? `${sonuc.bilemedi} kelime yarın yeniden gelecek.` : 'Hepsini bildin!'}
              </p>
            </>
          )}
        </section>
        <a class="dugme ikincil genis" href="#/kelimeler">
          Kelime defterine dön
        </a>
        <a class="dugme metin" href="#/">
          Ana sayfa
        </a>
      </Sayfa>
    );
  }

  return (
    <Sayfa>
      <Ust baslik={`Kart ${sira + 1}/${kartlar.length}`} geri="/kelimeler" />
      <section class="kart kelime-karti" lang="en">
        <p class="kart-kelime">{kart!.kelime}</p>
        {kart!.baglam && (
          <p class="baglam">
            <Baglam metin={kart!.baglam} kelime={kart!.kelime} />
          </p>
        )}
      </section>

      {acik ? (
        <>
          <section class="kart kart-arka">
            {kart!.anlam ? (
              <p class="kart-anlam">{kart!.anlam}</p>
            ) : (
              <label class="alan">
                <span class="soluk kucuk">Anlamı henüz eklenmemiş; yazarsan kaydedilir.</span>
                <input value={anlam} onInput={(e) => setAnlam((e.target as HTMLInputElement).value)} />
              </label>
            )}
          </section>
          <div class="kart-dugmeleri">
            <button class="dugme ikincil" onClick={() => cevapla(false)} disabled={mesgul}>
              Bilemedim
            </button>
            <button class="dugme birincil" onClick={() => cevapla(true)} disabled={mesgul}>
              Bildim
            </button>
          </div>
        </>
      ) : (
        <button class="dugme birincil genis" onClick={() => setAcik(true)}>
          Anlamını göster
        </button>
      )}
    </Sayfa>
  );
}
