import { useState } from 'preact/hooks';
import { BOLUMLER, KONULAR, SORULAR, konuAdi } from '../data/bank';
import { depo } from '../depo';
import { siradakiTest } from '../engine/adaptive';
import { seviyeRaporu } from '../engine/analysis';
import { CONFIG } from '../engine/config';
import type { Ayarlar } from '../types';
import { IkonHedef } from './ikonlar';
import { Cubuk, Sayfa, Yukleniyor, useVeri } from './ortak';
import { GunKarti } from './Program';
import { programVerisi } from './programVeri';
import { git } from './router';

const DEVAM_AD = {
  teshis: 'Teşhis testine',
  uyarlanmis: 'Uyarlanmış teste',
  kontrol: 'Kontrol testine',
  tekrar: 'Tekrar testine',
} as const;

export function AnaSayfa({ ayar }: { ayar: Ayarlar }) {
  const [mesaj, setMesaj] = useState<string | null>(null);
  const [mesgul, setMesgul] = useState(false);
  const { veri, hata } = useVeri(async () => {
    const plan = await depo.planGaranti();
    const [testler, cevaplar, aktif, pv] = await Promise.all([
      depo.testler(),
      depo.cevaplar(),
      depo.aktifTest(),
      programVerisi(ayar),
    ]);
    return { plan, testler, cevaplar, aktif, bugunku: pv.program.gunler[0] };
  });
  if (!veri) return <Yukleniyor hata={hata} />;

  const { plan, testler, cevaplar, aktif, bugunku } = veri;
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

  return (
    <Sayfa menu="">
      <header class="karsilama">
        <p class="soluk">YDS Çalışma</p>
        <h1>{sira.tip === 'teshis' ? 'Teşhis aşaması' : 'Uyarlanmış mod'}</h1>
      </header>

      <section class="kart vurgu">
        {sira.tip === 'teshis' ? (
          <>
            <p class="etiket-ust">Seviye tespiti</p>
            <p class="buyuk-metin">
              Teşhis testi {sira.sira_no}/{plan.length}
            </p>
            <Cubuk yuzde={(teshisBiten / plan.length) * 100} ton="iyi" />
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
          <button class="dugme birincil genis" onClick={baslat} disabled={mesgul || kalanYeni === 0}>
            {kalanYeni === 0 ? 'Tüm soruları çözdün' : 'Sonraki testi başlat'}
          </button>
        )}
        {mesaj && (
          <p class="hata-kutu" role="alert">
            {mesaj}
          </p>
        )}
      </section>

      <GunKarti gun={bugunku} onHata={setMesaj} />
      <a class="dugme metin" href="#/program">
        Haftalık programın tamamı
      </a>

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
          <div class="kart-baslik">
            <IkonHedef />
            <h2>En zayıf 3 konu</h2>
          </div>
          <ul class="konu-listesi">
            {rapor.enZayif.map((k) => {
              const r = rapor.konular.find((x) => x.konu === k.kod)!;
              return (
                <li>
                  <div class="satir-ust">
                    <span>{konuAdi(k.kod)}</span>
                    <span class="soluk">%{Math.round(r.eksiklik * 100)} eksik</span>
                  </div>
                  <Cubuk yuzde={Math.round(r.ustalik * 100)} />
                </li>
              );
            })}
          </ul>
          <a class="dugme ikincil genis" href="#/rapor">
            Seviye raporunu gör
          </a>
        </section>
      )}
    </Sayfa>
  );
}
