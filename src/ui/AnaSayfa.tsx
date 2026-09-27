import { useState } from 'preact/hooks';
import { BOLUMLER, KONULAR, SORULAR, konuAdi } from '../data/bank';
import { depo } from '../depo';
import { siradakiTest } from '../engine/adaptive';
import { seviyeRaporu } from '../engine/analysis';
import { CONFIG } from '../engine/config';
import { DENEME_DAKIKA, DENEME_SORU, denemeYeniSoruAcigi, ydsPuani, ydsSeviyesi } from '../engine/deneme';
import { calismaGunleri, seriHesapla } from '../engine/seri';
import { siradakiler } from '../engine/tekrar';
import type { Ayarlar } from '../types';
import { KameraDugmesi } from './Fotograflar';
import { IkonIleri } from './ikonlar';
import { onayla } from './onay';
import { Adimlar, Cubuk, Sayfa, Yukleniyor, useVeri } from './ortak';
import { GunKarti } from './Program';
import { programVerisi } from './programVeri';
import { git } from './router';

const DEVAM_AD = {
  teshis: 'Teşhis testine',
  uyarlanmis: 'Uyarlanmış teste',
  kontrol: 'Kontrol testine',
  tekrar: 'Tekrar testine',
  deneme: 'Deneme sınavına',
  konu: 'Konu testine',
} as const;

export function AnaSayfa({ ayar }: { ayar: Ayarlar }) {
  const [mesaj, setMesaj] = useState<string | null>(null);
  const [mesgul, setMesgul] = useState(false);
  const { veri, hata } = useVeri(async () => {
    const plan = await depo.planGaranti();
    const [testler, cevaplar, aktif, pv, tekrar, kelimeler, gunluk] = await Promise.all([
      depo.testler(),
      depo.cevaplar(),
      depo.aktifTest(),
      programVerisi(ayar),
      depo.tekrarListesi(),
      depo.kelimeler(),
      depo.gunluk(),
    ]);
    return { plan, testler, cevaplar, aktif, bugunku: pv.program.gunler[0], tekrar, kelimeler, gunluk };
  });
  if (!veri) return <Yukleniyor hata={hata} />;

  const { plan, testler, cevaplar, aktif, bugunku, tekrar, kelimeler, gunluk } = veri;
  const seri = seriHesapla(
    calismaGunleri(
      cevaplar.map((c) => c.tarih),
      gunluk.map((g) => g.tarih),
    ),
    new Date(),
  );
  const tekrarSirada = tekrar.sirada.length;
  const kartSirada = siradakiler(kelimeler, Date.now()).length;
  const sira = siradakiTest(testler, plan.length);
  const cozulmus = new Set(cevaplar.map((c) => c.soru_id));
  const kalanYeni = SORULAR.filter((s) => !cozulmus.has(s.id)).length;
  const bitenTestler = testler.filter((t) => t.durum === 'bitti');
  const teshisBiten = bitenTestler.filter((t) => t.tip === 'teshis').length;
  const rapor = seviyeRaporu(KONULAR, BOLUMLER, cevaplar);
  const uyBiten = bitenTestler.filter((t) => t.tip === 'uyarlanmis').length;
  const koBiten = bitenTestler.filter((t) => t.tip === 'kontrol').length;
  const kontroleKalan = (koBiten + 1) * CONFIG.KONTROL_ARALIGI - uyBiten;

  const baslat = async () => {
    setMesgul(true);
    setMesaj(null);
    try {
      git(`/test/${await depo.sonrakiTestiBaslat()}`);
    } catch (e) {
      setMesaj(e instanceof Error ? e.message : String(e));
    } finally {
      setMesgul(false);
    }
  };

  const cevapli = aktif ? aktif.secimler.filter((s) => s !== null).length : 0;
  const sonDeneme = bitenTestler.filter((t) => t.tip === 'deneme').pop();
  const sonDenemePuani = sonDeneme ? ydsPuani(sonDeneme.dogru_sayisi, sonDeneme.soru_idleri.length) : null;

  const denemeBaslat = async () => {
    setMesaj(null);
    const acik = denemeYeniSoruAcigi(SORULAR, cozulmus);
    const eskiNotu = acik > 0 ? ` Yeni soru yetmediği için yaklaşık ${acik} soru daha önce çözdüklerinden, en uzun süredir görmediklerinden gelecek.` : '';
    const tamam = await onayla(
      `${DENEME_SORU} soru, ${DENEME_DAKIKA} dakika. Süre başladıktan sonra durmaz; uygulamayı kapatsan da işlemeye devam eder.${eskiNotu} Başlayalım mı?`,
      { onay: 'Denemeye başla' },
    );
    if (!tamam) return;
    try {
      git(`/test/${(await depo.denemeBaslat()).id}`);
    } catch (e) {
      setMesaj(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <Sayfa menu="">
      <header class="karsilama">
        <KameraDugmesi />
        <p class="soluk">YDS Çalışma</p>
        <h1>{sira.tip === 'teshis' ? 'Teşhis aşaması' : 'Uyarlanmış mod'}</h1>
        {seri.guncel > 0 && (
          <p class="seri-satiri">
            <strong>{seri.guncel} günlük seri</strong>
            <span class="soluk">{seri.bugun ? ' · bugün tamam' : ' · bugün de çalışırsan sürer'}</span>
          </p>
        )}
      </header>

      <section class="kart vurgu">
        {sira.tip === 'teshis' ? (
          <>
            <p class="etiket-ust">Seviye tespiti</p>
            <p class="buyuk-metin">
              Teşhis testi {sira.sira_no}
              <span class="soluk"> / {plan.length}</span>
            </p>
            <Adimlar toplam={plan.length} biten={teshisBiten} etiket="Teşhis testleri" />
            <p class="soluk kucuk">İlk {plan.length} test tüm konuları dengeli ölçer.</p>
          </>
        ) : (
          <>
            <p class="etiket-ust">Sıradaki</p>
            <p class="buyuk-metin">
              {sira.tip === 'kontrol' ? 'Kontrol testi' : `Uyarlanmış test ${sira.sira_no}`}
            </p>
            <p class="soluk kucuk">
              {sira.tip === 'kontrol'
                ? 'Genel seviyeni yeniden ölçen dengeli karma test.'
                : `Eksik konularına odaklanır. Kontrol testine ${kontroleKalan} test kaldı.`}
            </p>
          </>
        )}
        {aktif ? (
          <button class="dugme birincil genis" onClick={() => git(`/test/${aktif.id}`)}>
            {DEVAM_AD[aktif.tip]} devam et ({cevapli}/{aktif.soru_idleri.length})
          </button>
        ) : (
          <button class="dugme birincil genis" onClick={baslat} disabled={mesgul}>
            Sonraki testi başlat
          </button>
        )}
        {kalanYeni === 0 && !aktif && (
          <p class="soluk kucuk">Tüm yeni soruları çözdün; testler artık en uzun süredir görmediğin sorulardan geliyor.</p>
        )}
        {mesaj && (
          <p class="hata-kutu" role="alert">
            {mesaj}
          </p>
        )}
      </section>

      {(tekrarSirada > 0 || kartSirada > 0) && (
        <section class="kart">
          <h2>Bugünkü tekrar</h2>
          <ul class="etkinlik-listesi">
            {tekrarSirada > 0 && (
              <li class="etkinlik">
                <div class="satir-ust">
                  <strong>{tekrarSirada} soru tekrar sırasında</strong>
                  <a class="dugme metin" href="#/yanlislar">
                    Tekrar et <IkonIleri boyut={18} />
                  </a>
                </div>
              </li>
            )}
            {kartSirada > 0 && (
              <li class="etkinlik">
                <div class="satir-ust">
                  <strong>{kartSirada} kelime kartı</strong>
                  <a class="dugme metin" href="#/kartlar">
                    Kartları çalış <IkonIleri boyut={18} />
                  </a>
                </div>
              </li>
            )}
          </ul>
        </section>
      )}

      <GunKarti gun={bugunku} onHata={setMesaj} />
      <a class="dugme metin devam" href="#/program">
        Haftalık programın tamamı <IkonIleri boyut={18} />
      </a>

      <section class="kart">
        <div class="satir-ust">
          <h2>Deneme sınavı</h2>
          {sonDenemePuani !== null && (
            <span class="soluk kucuk">
              Son: {sonDenemePuani.toLocaleString('tr-TR')} ({ydsSeviyesi(sonDenemePuani)})
            </span>
          )}
        </div>
        <p class="soluk kucuk">
          Gerçek YDS düzeninde {DENEME_SORU} soru, {DENEME_DAKIKA} dakika. Sonunda tahmini YDS puanını ve bölüm sonuçlarını görürsün.
        </p>
        {aktif?.tip !== 'deneme' && (
          <button class="dugme ikincil genis" onClick={denemeBaslat} disabled={!!aktif}>
            {aktif ? 'Önce yarım kalan testi bitir' : 'Deneme sınavına başla'}
          </button>
        )}
      </section>

      <section class="istatistik-satiri" aria-label="Özet">
        <div class="istatistik">
          <strong>{kalanYeni}</strong>
          <span>kalan yeni soru</span>
        </div>
        <div class="istatistik">
          <strong>{bitenTestler.length}</strong>
          <span>çözülen test</span>
        </div>
        <div class="istatistik">
          <strong>%{rapor.genelYuzde}</strong>
          <span>genel doğru</span>
        </div>
      </section>

      {rapor.enZayif.length > 0 && (
        <section class="kart">
          <h2>En zayıf 3 konu</h2>
          <ol class="konu-listesi sirali">
            {rapor.enZayif.map((k) => {
              const r = rapor.konular.find((x) => x.konu === k.kod)!;
              return (
                <li>
                  <a class="satir-dugme satir-baglanti" href={`#/konu/${k.kod}`}>
                    <span class="satir-ust">
                      <span>{konuAdi(k.kod)}</span>
                      <span class="soluk">%{Math.round(r.eksiklik * 100)} eksik</span>
                    </span>
                    <Cubuk yuzde={Math.round(r.ustalik * 100)} />
                  </a>
                </li>
              );
            })}
          </ol>
          <p class="soluk kucuk">Konuya dokun: kısa konu anlatımı ve o konudan 5 soruluk test.</p>
          <a class="dugme ikincil genis" href="#/rapor">
            Seviye raporunu gör
          </a>
        </section>
      )}
    </Sayfa>
  );
}
