import { useState } from 'preact/hooks';
import { SORU_MAP, konuAdi, soruParagrafi } from '../data/bank';
import { depo } from '../depo';
import { CONFIG } from '../engine/config';
import { Sayfa, Ust, Yukleniyor, useVeri } from './ortak';
import { git } from './router';

export function Yanlislar() {
  const [mesaj, setMesaj] = useState<string | null>(null);
  const { veri, hata } = useVeri(async () => {
    const [ids, aktif] = await Promise.all([depo.yanlislar(), depo.aktifTest()]);
    return { ids, aktif };
  });
  if (!veri) return <Yukleniyor hata={hata} />;
  const { ids, aktif } = veri;

  const gruplar = new Map<string, string[]>();
  for (const id of ids) {
    const k = SORU_MAP.get(id)!.konu;
    gruplar.set(k, [...(gruplar.get(k) ?? []), id]);
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
      <Ust baslik="Yanlışlarım" />
      <section class="kart vurgu">
        <p class="buyuk-metin">{ids.length} soru</p>
        <p class="soluk kucuk">
          Son denemende yanlış yaptığın ya da boş bıraktığın sorular. Tekrar testleri {CONFIG.TEST_BOYUTU} soruluktur ve konu
          puanlarını etkilemez; doğru çözdüğün soru listeden çıkar.
        </p>
        <button class="dugme birincil genis" onClick={baslat} disabled={ids.length === 0}>
          {aktif?.tip === 'tekrar' ? 'Tekrar testine devam et' : 'Tekrar testi başlat'}
        </button>
        {mesaj && (
          <p class="hata-kutu" role="alert">
            {mesaj}
          </p>
        )}
      </section>

      {[...gruplar].map(([konu, liste]) => (
        <section class="kart">
          <h2>
            {konuAdi(konu)} <span class="soluk">({liste.length})</span>
          </h2>
          <ul class="yanlis-listesi">
            {liste.map((id) => (
              <li lang="en">{(soruParagrafi(SORU_MAP.get(id)!) ?? SORU_MAP.get(id)!.soru).split('\n')[0].slice(0, 110)}…</li>
            ))}
          </ul>
        </section>
      ))}
    </Sayfa>
  );
}
