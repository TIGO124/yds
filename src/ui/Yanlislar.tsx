import { useState } from 'preact/hooks';
import { SORU_MAP, konuAdi, soruParagrafi } from '../data/bank';
import { depo } from '../depo';
import { OGRENILDI, kacGunSonra, siradakiler, sonrakiMetni, type SoruTekrari } from '../engine/tekrar';
import { BoslukluMetin, Sayfa, Ust, Yukleniyor, useVeri } from './ortak';
import { git } from './router';

/** Tekrar merkezi: aralıklı soru tekrarı, kelime kartları ve kaydedilen sorular. */
export function Yanlislar() {
  const [mesaj, setMesaj] = useState<string | null>(null);
  const { veri, hata } = useVeri(async () => {
    const [tekrar, aktif, kelimeler, isaretler] = await Promise.all([
      depo.tekrarListesi(),
      depo.aktifTest(),
      depo.kelimeler(),
      depo.isaretler(),
    ]);
    return { tekrar, aktif, kelimeler, isaretler };
  });
  if (!veri) return <Yukleniyor hata={hata} />;
  const { tekrar, aktif, kelimeler, isaretler } = veri;
  const simdi = new Date();
  const kartSirada = siradakiler(kelimeler, simdi.getTime()).length;
  const ilkBekleyen = tekrar.sirada.length === 0 ? tekrar.hepsi[0] : undefined;
  const bekleyenGun = ilkBekleyen ? kacGunSonra(ilkBekleyen.sonraki, simdi) : 0;
  const bekleyenAdet = ilkBekleyen ? tekrar.hepsi.filter((d) => kacGunSonra(d.sonraki, simdi) === bekleyenGun).length : 0;

  const gruplar = new Map<string, SoruTekrari[]>();
  for (const d of tekrar.hepsi) {
    const k = SORU_MAP.get(d.soru_id)!.konu;
    gruplar.set(k, [...(gruplar.get(k) ?? []), d]);
  }

  const baslat = async () => {
    if (aktif && aktif.tip !== 'tekrar') {
      setMesaj('Önce devam eden testi bitir.');
      return;
    }
    const id = await depo.tekrarTestiBaslat();
    if (id !== null) git(`/test/${id}`);
  };

  return (
    <Sayfa menu="yanlislar">
      <Ust baslik="Tekrar" />
      <section class="kart vurgu">
        <p class="etiket-ust">Aralıklı tekrar</p>
        <p class="buyuk-metin">{tekrar.sirada.length} soru sırada</p>
        <p class="soluk kucuk">
          Yanlış ya da boş bıraktığın sorular 1, 3 ve 7 gün arayla yeniden gelir; üst üste {OGRENILDI} kez doğru çözdüğünde
          listeden çıkar. Tekrar testleri konu puanlarını etkilemez.
        </p>
        {ilkBekleyen && (
          <p class="kucuk">
            Sıradaki tekrar: <strong>{sonrakiMetni(ilkBekleyen.sonraki, simdi).toLocaleLowerCase('tr')}</strong> · {bekleyenAdet} soru
          </p>
        )}
        <button class="dugme birincil genis" onClick={baslat} disabled={aktif?.tip !== 'tekrar' && tekrar.sirada.length === 0}>
          {aktif?.tip === 'tekrar' ? 'Tekrar testine devam et' : 'Tekrar testi başlat'}
        </button>
        {mesaj && (
          <p class="hata-kutu" role="alert">
            {mesaj}
          </p>
        )}
      </section>

      <section class="kart">
        <div class="satir-ust">
          <h2>Kelime kartları</h2>
          <span class="soluk kucuk">{kelimeler.length} kelime</span>
        </div>
        <p class="soluk kucuk">
          {kartSirada > 0
            ? `${kartSirada} kart bugün sırada.`
            : kelimeler.length > 0
              ? 'Bugün sırası gelen kart yok.'
              : 'İngilizce bir metinde kelimeyi seçip "Deftere ekle"ye dokunarak defterini oluştur.'}
        </p>
        <div class="dugme-satiri">
          {kartSirada > 0 && (
            <a class="dugme birincil" href="#/kartlar">
              Kartları çalış
            </a>
          )}
          <a class="dugme ikincil" href="#/kelimeler">
            Kelime defteri
          </a>
        </div>
      </section>

      <section class="kart">
        <div class="satir-ust">
          <h2>Kaydettiklerim</h2>
          <span class="soluk kucuk">{isaretler.length} soru</span>
        </div>
        <p class="soluk kucuk">Test sırasında işaretlediğin ya da sonuç ekranında kaydettiğin sorular.</p>
        <a class="dugme ikincil genis" href="#/kaydedilenler">
          Listeyi aç
        </a>
      </section>

      {tekrar.hepsi.length > 0 && <h2 class="bolum-basligi">Tekrar listesi ({tekrar.hepsi.length})</h2>}
      {[...gruplar].map(([konu, liste]) => (
        <section class="kart">
          <h2>
            {konuAdi(konu)} <span class="soluk">({liste.length})</span>
          </h2>
          <ul class="yanlis-listesi">
            {liste.map((d) => {
              const s = SORU_MAP.get(d.soru_id)!;
              const metin = (soruParagrafi(s) ?? s.soru).trim();
              const kisa = metin.split('\n')[0].slice(0, 110).trimEnd();
              return (
                <li>
                  <span lang="en">
                    <BoslukluMetin metin={kisa.length < metin.length ? `${kisa}…` : kisa} />
                  </span>
                  <span class={`tekrar-durum${d.sonraki <= simdi.getTime() ? ' sirada' : ''}`}>
                    {sonrakiMetni(d.sonraki, simdi)} · {d.kutu}/{OGRENILDI} doğru
                  </span>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </Sayfa>
  );
}
