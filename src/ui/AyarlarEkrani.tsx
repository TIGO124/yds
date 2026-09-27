import { useEffect, useState } from 'preact/hooks';
import { SORULAR } from '../data/bank';
import { yeniSorulariDenetle } from '../data/guncelleme';
import { depo } from '../depo';
import { apkGuncelle, guncellemeleriDenetle, UYGULAMA_SURUMU } from '../guncelleme';
import type { Ayarlar } from '../types';
import { hatirlatmaVar } from '../hatirlatma';
import { IndirmeCubugu, guncellemeyiUygula, indirmeMetni, useGuncelleme, useIndirme } from './guncellemeBandi';
import { HatirlatmaAyari } from './HatirlatmaAyari';
import { onayla } from './onay';
import { Sayfa, Ust } from './ortak';

/** Capacitor ile paketlenmiş Android uygulamasında mı çalışıyoruz? */
const yerelUygulama = () =>
  !!(window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor?.isNativePlatform?.();

/** claude.ai üzerinde paylaşılan sürüm: dosya indirme ve dosya seçme engelli. */
const ARTIFACT = import.meta.env.MODE === 'artifact';

/** Android uygulaması: yeni soru paketini elle denetleme. */
function SoruGuncelleme() {
  const [durum, setDurum] = useState<{ tur: 'bilgi' | 'hata'; metin: string } | null>(null);
  const [mesgul, setMesgul] = useState(false);
  const denetle = async () => {
    setMesgul(true);
    setDurum(null);
    const s = await yeniSorulariDenetle(depo);
    setMesgul(false);
    if (s.durum === 'guncel') setDurum({ tur: 'bilgi', metin: 'Soru bankan güncel.' });
    else if (s.durum === 'guncellendi') setDurum({ tur: 'bilgi', metin: `${s.yeni} yeni soru eklendi. İlerlemen korundu.` });
    else setDurum({ tur: 'hata', metin: `Denetlenemedi: ${s.mesaj}. İnternet bağlantını kontrol edip yeniden dene.` });
  };
  return (
    <section class="kart">
      <h2>Yeni sorular</h2>
      <p class="soluk kucuk">
        Uygulama açılırken internet varsa yeni soruları kendiliğinden indirir. Testlerin ve istatistiklerin korunur.
      </p>
      <button class="dugme ikincil genis" onClick={denetle} disabled={mesgul}>
        {mesgul ? 'Denetleniyor…' : 'Yeni soruları şimdi denetle'}
      </button>
      {durum && (
        <p class={durum.tur === 'hata' ? 'hata-kutu' : 'bilgi-kutu'} role="status">
          {durum.metin}
        </p>
      )}
    </section>
  );
}

/** Uygulama sürümü ve güncelleme. Güncelleme yalnızca uygulamayı değiştirir, veriler cihazda kalır. */
function UygulamaGuncelleme() {
  const g = useGuncelleme();
  const d = useIndirme();
  const [durum, setDurum] = useState<{ tur: 'bilgi' | 'hata'; metin: string } | null>(null);
  const [mesgul, setMesgul] = useState(false);
  const denetle = async () => {
    setMesgul(true);
    setDurum(null);
    try {
      const s = await guncellemeleriDenetle();
      if (s === 'guncel') setDurum({ tur: 'bilgi', metin: 'En son sürümü kullanıyorsun.' });
      else if (s === 'desteklenmiyor')
        setDurum({ tur: 'bilgi', metin: 'Bu sürüm her açılışta en son hâliyle yüklenir; ayrıca güncellemen gerekmez.' });
    } catch (e) {
      const neden = e instanceof DOMException && e.name === 'AbortError' ? 'Bağlantı zaman aşımına uğradı' : String((e as Error)?.message ?? e);
      setDurum({ tur: 'hata', metin: `Denetlenemedi: ${neden}. İnternet bağlantını kontrol et.` });
    } finally {
      setMesgul(false);
    }
  };
  return (
    <section class="kart">
      <h2>Uygulama güncellemesi</h2>
      <p class="soluk kucuk">
        Sürüm {UYGULAMA_SURUMU}. Güncelleme yalnızca uygulamayı yeniler; testlerin, istatistiklerin ve ayarların cihazında
        korunur.
      </p>
      {g ? (
        <>
          {g.tur === 'android' && d && (
            <p class={d.tur === 'hata' ? 'hata-kutu' : 'bilgi-kutu'} role="status">
              {indirmeMetni(g, d)}
              <IndirmeCubugu d={d} />
            </p>
          )}
          <button
            class="dugme birincil genis"
            disabled={d?.tur === 'indiriliyor'}
            onClick={() => void (g.tur === 'android' && d ? apkGuncelle(g) : guncellemeyiUygula(g))}
          >
            {g.tur === 'web'
              ? 'Yeni sürüme geç'
              : d?.tur === 'indiriliyor'
                ? 'İndiriliyor…'
                : d
                  ? 'Yeniden dene'
                  : `${g.surum} sürümüne güncelle`}
          </button>
        </>
      ) : ARTIFACT ? (
        <p class="soluk kucuk">Bu sayfa her açılışta en son yayınlanan sürümle yüklenir.</p>
      ) : (
        <button class="dugme ikincil genis" onClick={denetle} disabled={mesgul}>
          {mesgul ? 'Denetleniyor…' : 'Güncellemeleri denetle'}
        </button>
      )}
      {durum && !g && (
        <p class={durum.tur === 'hata' ? 'hata-kutu' : 'bilgi-kutu'} role="status">
          {durum.metin}
        </p>
      )}
    </section>
  );
}

export function AyarlarEkrani({ ayar, degistir }: { ayar: Ayarlar; degistir: (a: Partial<Ayarlar>) => void }) {
  const [mesaj, setMesaj] = useState<{ tur: 'bilgi' | 'hata'; metin: string } | null>(null);
  const [kalici, setKalici] = useState<boolean | null>(null);

  useEffect(() => {
    navigator.storage?.persisted?.().then(setKalici).catch(() => setKalici(null));
  }, []);

  const [yapistir, setYapistir] = useState<string | null>(null);
  /** Pano engelliyse yedek metni elle kopyalansın diye gösterilir. */
  const [elleKopyala, setElleKopyala] = useState<string | null>(null);
  const dosyaAdi = () => `yds-yedek-${new Date().toISOString().slice(0, 10)}.json`;
  const ozet = (v: { cevaplar: unknown[]; testler: unknown[] }) => `${v.cevaplar.length} cevap, ${v.testler.length} test`;

  /** Önce paylaşım menüsü (iOS/Android), olmazsa dosya indirme. Android uygulamasında indirme olmadığından panoya kopyalanır. */
  const yedekAl = async () => {
    const veri = await depo.yedekAl();
    const metin = JSON.stringify(veri);
    const dosya = new File([metin], dosyaAdi(), { type: 'application/json' });
    try {
      if (navigator.canShare?.({ files: [dosya] })) {
        await navigator.share({ files: [dosya], title: 'YDS yedeği' });
        setMesaj({ tur: 'bilgi', metin: `Yedek paylaşıldı (${ozet(veri)}).` });
        return;
      }
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return;
    }
    if (yerelUygulama()) return yedegiKopyala();
    const url = URL.createObjectURL(dosya);
    const a = document.createElement('a');
    a.href = url;
    a.download = dosya.name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setMesaj({ tur: 'bilgi', metin: `Yedek indirildi (${ozet(veri)}).` });
  };

  const yedegiKopyala = async () => {
    const veri = await depo.yedekAl();
    const metin = JSON.stringify(veri);
    try {
      await navigator.clipboard.writeText(metin);
      setElleKopyala(null);
      setMesaj({ tur: 'bilgi', metin: `Yedek panoya kopyalandı (${ozet(veri)}). Notlar uygulamasına ya da kendine mesaj olarak yapıştırıp sakla.` });
    } catch {
      setElleKopyala(metin);
      setMesaj({ tur: 'hata', metin: 'Panoya otomatik kopyalanamadı. Aşağıdaki metnin tamamını seçip kopyala ve sakla.' });
    }
  };

  const yukle = async (metin: string) => {
    try {
      const veri = JSON.parse(metin);
      const onay = await onayla('Mevcut ilerlemenin yerine yedekteki veriler yüklenecek. Devam edilsin mi?', { onay: 'Yükle' });
      if (!onay) return;
      await depo.yedektenYukle(veri);
      degistir(await depo.ayarlar());
      setYapistir(null);
      setMesaj({ tur: 'bilgi', metin: 'Yedek yüklendi. Tüm ilerleme geri getirildi.' });
    } catch (err) {
      setMesaj({
        tur: 'hata',
        metin: err instanceof SyntaxError ? 'Metin geçerli bir yedek (JSON) değil.' : String(err instanceof Error ? err.message : err),
      });
    }
  };

  const yedektenYukle = async (e: Event) => {
    const input = e.target as HTMLInputElement;
    const dosya = input.files?.[0];
    input.value = '';
    if (dosya) await yukle(await dosya.text());
  };

  const sifirla = async () => {
    const ilk = await onayla('Tüm testler ve cevaplar silinecek; kelime defterin ve kaydettiğin sorular kalır. Bu işlem geri alınamaz. Önce yedek almanı öneririz.', {
      onay: 'Devam et',
      tehlike: true,
    });
    if (!ilk || !(await onayla('Emin misin? İlerlemen tamamen sıfırlanacak.', { onay: 'Sıfırla', tehlike: true }))) return;
    await depo.sifirla();
    setMesaj({ tur: 'bilgi', metin: 'İlerleme sıfırlandı. Teşhis testleri yeniden başlayacak.' });
  };

  return (
    <Sayfa menu="ayarlar">
      <Ust baslik="Ayarlar" />

      <section class="kart">
        <h2>Test</h2>
        <label class="anahtar-satir">
          <span>
            Konu etiketini göster
            <small class="soluk">Etiket bazen ipucu verebilir.</small>
          </span>
          <input
            type="checkbox"
            role="switch"
            checked={ayar.konu_etiketini_goster}
            onChange={(e) => degistir({ konu_etiketini_goster: (e.target as HTMLInputElement).checked })}
          />
        </label>
        <fieldset class="secim-grubu">
          <legend>Doğru cevabı göster</legend>
          {(
            [
              ['test_sonunda', 'Test sonunda'],
              ['aninda', 'Anında'],
            ] as const
          ).map(([deger, ad]) => (
            <label class={ayar.cevabi_goster === deger ? 'secili' : ''}>
              <input type="radio" name="cevap" checked={ayar.cevabi_goster === deger} onChange={() => degistir({ cevabi_goster: deger })} />
              {ad}
            </label>
          ))}
        </fieldset>
      </section>

      <section class="kart">
        <h2>Görünüm</h2>
        <fieldset class="secim-grubu">
          <legend>Tema</legend>
          {(
            [
              ['sistem', 'Sistem'],
              ['acik', 'Açık'],
              ['koyu', 'Koyu'],
            ] as const
          ).map(([deger, ad]) => (
            <label class={ayar.tema === deger ? 'secili' : ''}>
              <input type="radio" name="tema" checked={ayar.tema === deger} onChange={() => degistir({ tema: deger })} />
              {ad}
            </label>
          ))}
        </fieldset>
      </section>

      {hatirlatmaVar && <HatirlatmaAyari ayar={ayar} degistir={degistir} />}

      <section class="kart">
        <h2>Yedekleme</h2>
        <p class="soluk kucuk">
          İlerlemen yalnızca bu cihazda saklanır. Özellikle iPhone'da tarayıcı verisi silinebileceği için düzenli yedek al.
          {kalici === true && ' Depolama kalıcı olarak işaretlendi.'}
        </p>
        {/* Android uygulamasında ve claude.ai'de dosya kaydedilemiyor: yalnızca panoya kopyalama kalır. */}
        {!ARTIFACT && !yerelUygulama() && (
          <button class="dugme ikincil genis" onClick={yedekAl}>
            İlerlemeyi yedekle (dosya)
          </button>
        )}
        <button class="dugme ikincil genis" onClick={yedegiKopyala}>
          Yedeği panoya kopyala
        </button>
        {elleKopyala !== null && (
          <textarea
            class="yedek-metni"
            rows={4}
            readOnly
            aria-label="Yedek metni"
            value={elleKopyala}
            onFocus={(e) => (e.target as HTMLTextAreaElement).select()}
          />
        )}
        {!ARTIFACT && (
          <label class="dugme ikincil genis dosya-dugme">
            Dosyadan yükle
            <input type="file" accept="application/json,.json,text/plain" onChange={yedektenYukle} />
          </label>
        )}
        {yapistir === null ? (
          <button class="dugme metin" onClick={() => setYapistir('')}>
            Kopyalanmış yedeği yapıştırarak yükle
          </button>
        ) : (
          <div class="alan">
            <label class="soluk kucuk" for="yedek-metni">
              Yedek metnini buraya yapıştır
            </label>
            <textarea
              id="yedek-metni"
              class="yedek-metni"
              rows={4}
              value={yapistir}
              onInput={(e) => setYapistir((e.target as HTMLTextAreaElement).value)}
            />
            <button class="dugme birincil genis" onClick={() => yukle(yapistir)} disabled={!yapistir.trim()}>
              Metinden yükle
            </button>
          </div>
        )}
        {mesaj && (
          <p class={mesaj.tur === 'hata' ? 'hata-kutu' : 'bilgi-kutu'} role="status">
            {mesaj.metin}
          </p>
        )}
      </section>

      <section class="kart">
        <h2>Tehlikeli alan</h2>
        <button class="dugme tehlike genis" onClick={sifirla}>
          İlerlemeyi sıfırla
        </button>
      </section>

      <UygulamaGuncelleme />
      {import.meta.env.MODE === 'android' && <SoruGuncelleme />}

      <p class="soluk kucuk orta">Soru bankası: {SORULAR.length} soru · Tüm veriler cihazında, internet gerekmez.</p>
    </Sayfa>
  );
}
