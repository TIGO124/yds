import { useState } from 'preact/hooks';
import { KONULAR, SORU_MAP, bolumAdi, konuAdi, soruEtiketi } from '../data/bank';
import { depo } from '../depo';
import { siradakiTest } from '../engine/adaptive';
import { konuDegisimleri, odakKonulari, oranlar } from '../engine/analysis';
import { DENEME_DAGILIMI, DENEME_DAKIKA, DENEME_SORU, ydsPuani, ydsSeviyesi } from '../engine/deneme';
import type { CevapKaydi, TestKaydi } from '../types';
import { IkonCarpi, IkonTik, IkonTire } from './ikonlar';
import { HARF, ParagrafMetni, Sayfa, TIP_AD, Ust, Yukleniyor, useVeri } from './ortak';
import { git } from './router';

/** Deneme sınavı: ÖSYM usulü puan, seviye, süre ve bölüm bazında doğru/yanlış/boş. */
function DenemeOzeti({ test, cevaplar }: { test: TestKaydi; cevaplar: CevapKaydi[] }) {
  const toplam = cevaplar.length;
  const puan = ydsPuani(test.dogru_sayisi, toplam);
  const dakika = test.bitis ? Math.round((test.bitis - test.baslangic) / 60_000) : 0;
  const satirlar = DENEME_DAGILIMI.map(({ bolum }) => {
    const b = cevaplar.filter((c) => c.bolum === bolum);
    return {
      bolum,
      toplam: b.length,
      dogru: b.filter((c) => c.dogru_mu).length,
      bos: b.filter((c) => c.secilen === null).length,
    };
  }).filter((s) => s.toplam > 0);
  const bos = cevaplar.filter((c) => c.secilen === null).length;

  return (
    <>
      <section class="kart skor-kart">
        <p class="soluk">Deneme sınavı {test.sira_no}</p>
        <p class="skor">{puan.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}</p>
        <p>
          Tahmini YDS puanı · Seviye <strong>{ydsSeviyesi(puan)}</strong>
        </p>
        <p class="soluk kucuk">
          {test.dogru_sayisi} doğru · {toplam - test.dogru_sayisi - bos} yanlış · {bos} boş · {Math.min(dakika, DENEME_DAKIKA)} dk
          {toplam < DENEME_SORU && ` · ${toplam} soruluk deneme, puan ${DENEME_SORU} soruya oranlandı`}
        </p>
      </section>
      <section class="kart">
        <h2>Bölümlere göre</h2>
        <p class="soluk kucuk">YDS'de yanlış cevaplar doğruları götürmez; boş bırakmak yerine tahmin etmek her zaman daha iyidir.</p>
        <div class="tablo-kap">
          <table class="tablo">
            <thead>
              <tr>
                <th>Bölüm</th>
                <th class="sag">D</th>
                <th class="sag">Y</th>
                <th class="sag">B</th>
              </tr>
            </thead>
            <tbody>
              {satirlar.map((s) => (
                <tr>
                  <td>{bolumAdi(s.bolum)}</td>
                  <td class="sag">{s.dogru}</td>
                  <td class="sag">{s.toplam - s.dogru - s.bos}</td>
                  <td class="sag">{s.bos}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}

export function Sonuc({ id }: { id: number }) {
  const [mesaj, setMesaj] = useState<string | null>(null);
  const { veri, hata } = useVeri(async () => {
    const [test, cevaplar, plan, testler] = await Promise.all([
      depo.test(id),
      depo.cevaplar(),
      depo.planGaranti(),
      depo.testler(),
    ]);
    return { test, cevaplar, plan, testler };
  }, [id]);
  if (!veri) return <Yukleniyor hata={hata} />;
  const { test, cevaplar, plan, testler } = veri;
  if (!test || test.durum !== 'bitti') return <Yukleniyor hata="Test bulunamadı ya da henüz bitmedi." />;

  const buTest = cevaplar.filter((c) => c.test_id === id);
  const konuTablosu = oranlar(buTest, (c) => c.konu);
  const degisimler = konuDegisimleri(KONULAR, cevaplar, id);
  const sira = siradakiTest(testler, plan.length);
  const odak = odakKonulari(KONULAR, cevaplar);
  const yuzde = Math.round((test.dogru_sayisi / test.soru_idleri.length) * 100);

  const sonraki = async () => {
    try {
      git(`/test/${await depo.sonrakiTestiBaslat()}`);
    } catch (e) {
      setMesaj(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <Sayfa>
      <Ust baslik="Test sonu analizi" geri="/" />

      {test.tip === 'deneme' ? (
        <DenemeOzeti test={test} cevaplar={buTest} />
      ) : (
        <section class="kart skor-kart">
          <p class="soluk">
            {TIP_AD[test.tip]} {test.tip !== 'tekrar' && test.sira_no}
          </p>
          <p class="skor">
            {test.dogru_sayisi}
            <span>/{test.soru_idleri.length}</span>
          </p>
          <p class="soluk">%{yuzde} doğru</p>
        </section>
      )}

      {test.biten_konular && test.biten_konular.length > 0 && (
        <p class="bilgi-kutu">
          Bu konudaki tüm soruları çözdün: {test.biten_konular.map(konuAdi).join(', ')}. Yerine aynı bölümden sorular geldi.
        </p>
      )}

      <section class="kart">
        <h2>Bu testteki konular</h2>
        <table class="tablo">
          <thead>
            <tr>
              <th>Konu</th>
              <th class="sag">Doğru</th>
            </tr>
          </thead>
          <tbody>
            {konuTablosu.map((o) => (
              <tr>
                <td>{konuAdi(o.kod)}</td>
                <td class="sag">
                  {o.dogru}/{o.toplam}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section class="kart">
        <h2>Genel konu durumu</h2>
        {test.tip === 'tekrar' && <p class="soluk kucuk">Tekrar testleri konu puanlarını etkilemez.</p>}
        <p class="soluk kucuk">Eksiklik yüzdesi (100 − başarı) ve bu testten önceye göre değişim.</p>
        <table class="tablo">
          <thead>
            <tr>
              <th>Konu</th>
              <th class="sag">Eksik</th>
              <th class="sag">Değişim</th>
            </tr>
          </thead>
          <tbody>
            {degisimler.map((d) => (
              <tr>
                <td>{konuAdi(d.konu)}</td>
                <td class="sag">%{d.eksiklikYuzde}</td>
                <td class={`sag degisim ${d.yon === '↑' ? 'kotu' : d.yon === '↓' ? 'iyi' : ''}`}>
                  <span aria-label={d.yon === '↑' ? 'arttı' : d.yon === '↓' ? 'azaldı' : 'değişmedi'}>
                    {d.yon}
                    {d.yon !== '=' && ` ${Math.abs(d.eksiklikYuzde - d.oncekiYuzde)}`}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section class="kart vurgu">
        {sira.tip === 'uyarlanmis' ? (
          <p>
            Bir sonraki test şu konulara odaklanacak: <strong>{odak.map((k) => k.ad).join(', ')}</strong>
          </p>
        ) : sira.tip === 'teshis' ? (
          <p>
            Sıradaki: <strong>Teşhis testi {sira.sira_no}/{plan.length}</strong> (tüm konulardan dengeli karma)
          </p>
        ) : (
          <p>
            Sıradaki: <strong>Kontrol testi</strong> — genel seviyeni yeniden ölçer.
          </p>
        )}
        <button class="dugme birincil genis" onClick={sonraki}>
          Sonraki testi başlat
        </button>
        {mesaj && (
          <p class="hata-kutu" role="alert">
            {mesaj}
          </p>
        )}
      </section>

      <section>
        <h2 class="bolum-basligi">Soru soru inceleme</h2>
        {test.soru_idleri.map((sid, i) => {
          const s = SORU_MAP.get(sid);
          if (!s) return null;
          const secilen = test.secimler[i] ?? null;
          const durum = secilen === null ? 'bos' : secilen === s.dogru ? 'dogru' : 'yanlis';
          return (
            <details class={`inceleme ${durum}`}>
              <summary>
                <span class={`durum-ikon ${durum}`}>
                  {durum === 'dogru' ? <IkonTik boyut={16} /> : durum === 'yanlis' ? <IkonCarpi boyut={16} /> : <IkonTire boyut={16} />}
                </span>
                <span class="inceleme-baslik">
                  <strong>{i + 1}.</strong> {soruEtiketi(s)}
                </span>
                <span class="sr-only">{durum === 'dogru' ? 'Doğru' : durum === 'yanlis' ? 'Yanlış' : 'Boş'}</span>
              </summary>
              <ParagrafMetni soru={s} kucuk />
              <p class="soru-metni kucuk-soru" lang="en">
                {s.soru}
              </p>
              <ul class="inceleme-secenekler">
                {s.secenekler.map((m, j) => (
                  <li class={j === s.dogru ? 'dogru' : j === secilen ? 'yanlis' : ''}>
                    <span class="harf">{HARF[j]}</span> {m}
                  </li>
                ))}
              </ul>
              <p class="kucuk">
                Senin cevabın: <strong>{secilen === null ? 'Boş' : HARF[secilen]}</strong> · Doğru cevap:{' '}
                <strong>{HARF[s.dogru]}</strong>
              </p>
              <p class="aciklama">{s.aciklama}</p>
            </details>
          );
        })}
      </section>
    </Sayfa>
  );
}
