import { BOLUMLER, KONULAR, konuAdi } from '../data/bank';
import { depo } from '../depo';
import { seviyeRaporu } from '../engine/analysis';
import { Cubuk, Sayfa, SeviyeRozeti, Ust, Yukleniyor, useVeri } from './ortak';

export function SeviyeRaporu({ testId }: { testId: number | null }) {
  const { veri, hata } = useVeri(() => depo.cevaplar());
  if (!veri) return <Yukleniyor hata={hata} />;
  const r = seviyeRaporu(KONULAR, BOLUMLER, veri);

  return (
    <Sayfa>
      <Ust baslik="Seviye Raporu" geri="/" />
      {testId !== null && (
        <a class="dugme ikincil genis" href={`#/sonuc/${testId}`}>
          Son testin analizini gör
        </a>
      )}

      <section class="kart skor-kart">
        <p class="soluk">Genel başarı</p>
        <p class="skor">%{r.genelYuzde}</p>
        <p class="soluk">{r.cozulen} soru üzerinden</p>
      </section>

      {r.enZayif.length > 0 && (
        <section class="kart vurgu">
          <h2>En çok eksiğin olan 3 konu</h2>
          <ol class="oneri-listesi">
            {r.enZayif.map((k) => (
              <li>
                <strong>{k.ad}</strong>
                <p>{k.oneri}</p>
              </li>
            ))}
          </ol>
        </section>
      )}

      <section class="kart">
        <h2>Bölümlere göre başarı</h2>
        <ul class="konu-listesi">
          {r.bolumler.map((b) => (
            <li>
              <div class="satir-ust">
                <span>{b.ad}</span>
                <span class="soluk">
                  %{b.yuzde} · {b.dogru}/{b.toplam}
                </span>
              </div>
              <Cubuk yuzde={b.yuzde} />
            </li>
          ))}
        </ul>
      </section>

      <section class="kart">
        <h2>Konular (eksikliğe göre)</h2>
        <p class="soluk kucuk">Zayıf: %50 altı · Gelişmekte: %50–75 · İyi: %75 üstü · 5'ten az soruda: yetersiz veri</p>
        <ul class="konu-listesi">
          {r.konular.map((k) => (
            <li>
              <div class="satir-ust">
                <span>{konuAdi(k.konu)}</span>
                <SeviyeRozeti seviye={k.seviye} />
              </div>
              <div class="satir-ust soluk kucuk">
                <span>
                  Başarı %{Math.round(k.ustalik * 100)} · {k.deneme} soru
                </span>
                <span>%{Math.round(k.eksiklik * 100)} eksik</span>
              </div>
              <Cubuk yuzde={Math.round(k.ustalik * 100)} />
            </li>
          ))}
        </ul>
      </section>
    </Sayfa>
  );
}
