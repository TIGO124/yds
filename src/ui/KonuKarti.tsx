import { useState } from 'preact/hooks';
import { BOLUMLER, KONULAR, KONU_MAP, KONU_NOTLARI, SORULAR, bolumAdi } from '../data/bank';
import { depo } from '../depo';
import { konuDurumlari, seviye } from '../engine/mastery';
import { Cubuk, Sayfa, SeviyeRozeti, Ust, Yukleniyor, useVeri } from './ortak';
import { konuTestiBaslat } from './Program';

/** Konu kartı: kısa konu anlatımı, örnekler, sık hatalar ve konuya özel kısa test. */
export function KonuSayfasi({ kod }: { kod: string }) {
  const [hata, setHata] = useState<string | null>(null);
  const { veri, hata: yuklemeHatasi } = useVeri(() => depo.cevaplar(), [kod]);
  const konu = KONU_MAP.get(kod);
  if (!konu) return <Yukleniyor hata="Konu bulunamadı." />;
  if (!veri) return <Yukleniyor hata={yuklemeHatasi} />;
  const durum = konuDurumlari(KONULAR, veri).get(kod)!;
  const not = KONU_NOTLARI[kod];
  const cozulmus = new Set(veri.map((c) => c.soru_id));
  const yeni = SORULAR.filter((s) => s.konu === kod && !cozulmus.has(s.id)).length;

  return (
    <Sayfa>
      <Ust baslik={konu.ad} geri="" />
      <section class="kart">
        <div class="satir-ust">
          <span class="soluk kucuk">{bolumAdi(konu.bolum)}</span>
          <SeviyeRozeti seviye={seviye(durum)} />
        </div>
        <div class="satir-ust">
          <span>Başarı %{Math.round(durum.ustalik * 100)}</span>
          <span class="soluk kucuk">
            {durum.deneme} soru çözüldü · {yeni} yeni soru
          </span>
        </div>
        <Cubuk yuzde={durum.deneme ? Math.round(durum.ustalik * 100) : 0} />
        <button class="dugme birincil genis" onClick={() => konuTestiBaslat(kod, setHata)}>
          Bu konudan 5 soru çöz
        </button>
        {hata && (
          <p class="hata-kutu" role="alert">
            {hata}
          </p>
        )}
      </section>

      {not && (
        <>
          <section class="kart konu-notu">
            <p class="konu-ozet">{not.ozet}</p>
            <h3>Kurallar</h3>
            <ul class="madde-listesi">
              {not.kurallar.map((k) => (
                <li>{k}</li>
              ))}
            </ul>
          </section>

          <section class="kart konu-notu">
            <h2>Örnekler</h2>
            <ul class="ornek-listesi">
              {not.ornekler.map((o) => (
                <li>
                  <p class="ornek-en" lang="en">
                    {o.en}
                  </p>
                  <p class="ornek-tr">{o.tr}</p>
                </li>
              ))}
            </ul>
          </section>

          <section class="kart konu-notu">
            <h2>Sık yapılan hatalar</h2>
            <ul class="madde-listesi hatali">
              {not.hatalar.map((h) => (
                <li>{h}</li>
              ))}
            </ul>
          </section>
        </>
      )}

      <section class="kart">
        <h2>Çalışma önerisi</h2>
        <p>{konu.oneri}</p>
      </section>
    </Sayfa>
  );
}

/** Tüm konu kartları, bölümlere göre. */
export function KonuListesi() {
  const { veri, hata } = useVeri(() => depo.cevaplar());
  if (!veri) return <Yukleniyor hata={hata} />;
  const durumlar = konuDurumlari(KONULAR, veri);

  return (
    <Sayfa>
      <Ust baslik="Konu kartları" geri="" />
      <p class="soluk kucuk">Her kartta kısa konu anlatımı, örnek cümleler ve sık yapılan hatalar var; kartın altından o konuya özel 5 soruluk test çözebilirsin.</p>
      {BOLUMLER.map((b) => {
        const konular = KONULAR.filter((k) => k.bolum === b.kod);
        if (konular.length === 0) return null;
        return (
          <section class="kart">
            <h2>{b.ad}</h2>
            <ul class="konu-listesi">
              {konular.map((k) => {
                const d = durumlar.get(k.kod)!;
                return (
                  <li>
                    <a class="satir-dugme satir-baglanti" href={`#/konu/${k.kod}`}>
                      <span class="satir-ust">
                        <span>{k.ad}</span>
                        <span class="soluk">{d.deneme ? `%${Math.round(d.ustalik * 100)}` : '—'}</span>
                      </span>
                      <Cubuk yuzde={d.deneme ? Math.round(d.ustalik * 100) : 0} />
                    </a>
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
    </Sayfa>
  );
}
