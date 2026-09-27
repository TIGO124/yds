import { useEffect, useRef, useState } from 'preact/hooks';
import { depo } from '../depo';
import { fotografHazirla, jpegAdresi } from '../fotograf';
import type { FotografKaydi } from '../types';
import { bildir } from './bildirim';
import { IkonKamera } from './ikonlar';
import { onayla } from './onay';
import { Sayfa, Ust, Yukleniyor, useVeri } from './ortak';
import { git } from './router';

const tarihBicimi = new Intl.DateTimeFormat('tr-TR', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' });

/**
 * Kamerayı açan düğme. <input capture> telefonda doğrudan kamerayı açar (Android uygulamasında Capacitor
 * sistem kamerasını başlatır); bilgisayarda dosya seçici açılır. Çekilen fotoğraf küçültülüp cihazda saklanır.
 */
export function KameraDugmesi({ genis }: { genis?: boolean }) {
  const girdi = useRef<HTMLInputElement>(null);
  const [mesgul, setMesgul] = useState(false);
  // claude.ai üzerinde dosya seçme engelli.
  if (import.meta.env.MODE === 'artifact') return null;

  const secildi = async (e: Event) => {
    const input = e.target as HTMLInputElement;
    const dosya = input.files?.[0];
    input.value = '';
    if (!dosya) return;
    setMesgul(true);
    try {
      const id = await depo.fotografEkle(await fotografHazirla(dosya));
      bildir('Fotoğraf kaydedildi.');
      git(`/fotograf/${id}`);
    } catch (err) {
      bildir(err instanceof Error ? err.message : 'Fotoğraf kaydedilemedi.');
    } finally {
      setMesgul(false);
    }
  };

  return (
    <>
      <input ref={girdi} class="gizli-girdi" type="file" accept="image/*" capture="environment" tabIndex={-1} aria-hidden="true" onChange={secildi} />
      {genis ? (
        <button class="dugme birincil genis" onClick={() => girdi.current?.click()} disabled={mesgul}>
          <IkonKamera /> {mesgul ? 'Kaydediliyor…' : 'Fotoğraf çek'}
        </button>
      ) : (
        <button class="ikon-dugme kamera-dugmesi" aria-label="Fotoğraf çek" title="Fotoğraf çek" onClick={() => girdi.current?.click()} disabled={mesgul}>
          <IkonKamera />
        </button>
      )}
    </>
  );
}

/** Küçük resimlerin gösterim adresleri; bileşen kapanınca bırakılır. */
function useKucukResimler(liste: FotografKaydi[] | null): Map<number, string> {
  const [adresler, setAdresler] = useState<Map<number, string>>(new Map());
  useEffect(() => {
    if (!liste) return;
    const m = new Map(liste.map((f) => [f.id!, jpegAdresi(f.kucuk)]));
    setAdresler(m);
    return () => m.forEach((u) => URL.revokeObjectURL(u));
  }, [liste]);
  return adresler;
}

export function FotografListesi() {
  const { veri, hata } = useVeri(() => depo.fotograflar());
  const adresler = useKucukResimler(veri);
  if (!veri) return <Yukleniyor hata={hata} />;

  return (
    <Sayfa>
      <Ust baslik="Fotoğraflarım" geri="" />
      <section class="kart">
        <p class="soluk kucuk">
          Kitaptaki soruların ya da notlarının fotoğrafını çek; burada saklanır. Fotoğraflar yalnızca bu cihazda durur ve yedeğe
          dahil değildir.
        </p>
        <KameraDugmesi genis />
      </section>
      {veri.length === 0 ? (
        <p class="soluk orta">Henüz fotoğraf yok.</p>
      ) : (
        <ul class="fotograf-izgarasi">
          {veri.map((f) => (
            <li>
              <a href={`#/fotograf/${f.id}`} aria-label={f.not || tarihBicimi.format(f.tarih)}>
                {adresler.get(f.id!) && <img src={adresler.get(f.id!)} alt="" loading="lazy" />}
                {f.not && <span class="fotograf-notu">{f.not}</span>}
              </a>
            </li>
          ))}
        </ul>
      )}
    </Sayfa>
  );
}

export function FotografSayfasi({ id }: { id: number }) {
  const { veri, hata } = useVeri(() => depo.fotograf(id), [id]);
  const [adres, setAdres] = useState<string | null>(null);
  const [not, setNot] = useState<string | null>(null);
  const [yakin, setYakin] = useState(false);

  useEffect(() => {
    if (!veri) return;
    const u = jpegAdresi(veri.veri);
    setAdres(u);
    return () => URL.revokeObjectURL(u);
  }, [veri]);

  if (veri === undefined && !hata) return <Yukleniyor hata="Fotoğraf bulunamadı." />;
  if (!veri) return <Yukleniyor hata={hata} />;
  const guncelNot = not ?? veri.not;

  const notuKaydet = async () => {
    await depo.fotografNotu(id, guncelNot);
    veri.not = guncelNot.trim();
    setNot(null);
    bildir('Not kaydedildi.');
  };

  const sil = async () => {
    if (!(await onayla('Bu fotoğraf silinsin mi? Geri alınamaz.', { onay: 'Sil', tehlike: true }))) return;
    await depo.fotografSil(id);
    git('/fotograflar', true);
  };

  return (
    <Sayfa>
      <Ust baslik="Fotoğraf" geri="/fotograflar" />
      <figure class={`fotograf-buyuk${yakin ? ' yakin' : ''}`}>
        {adres && (
          <img
            src={adres}
            alt={veri.not || 'Çekilen fotoğraf'}
            width={veri.genislik}
            height={veri.yukseklik}
            onClick={() => setYakin(!yakin)}
          />
        )}
      </figure>
      <p class="soluk kucuk">
        {tarihBicimi.format(veri.tarih)} · {yakin ? 'Küçültmek' : 'Yakınlaştırmak'} için fotoğrafa dokun.
      </p>
      <label class="alan">
        <span class="soluk kucuk">Not</span>
        <textarea
          class="yedek-metni fotograf-not-alani"
          rows={3}
          value={guncelNot}
          placeholder="ör. Kitap s. 42, 7. soru: tekrar bak"
          onInput={(e) => setNot((e.target as HTMLTextAreaElement).value)}
        />
      </label>
      <button class="dugme ikincil genis" onClick={notuKaydet} disabled={not === null || not.trim() === veri.not}>
        Notu kaydet
      </button>
      <button class="dugme tehlike genis" onClick={sil}>
        Fotoğrafı sil
      </button>
    </Sayfa>
  );
}
