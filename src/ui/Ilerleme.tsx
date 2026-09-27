import { useState } from 'preact/hooks';
import { KONULAR, SORULAR, konuAdi } from '../data/bank';
import { depo } from '../depo';
import { konuGecmisi } from '../engine/analysis';
import { ydsPuani, ydsSeviyesi } from '../engine/deneme';
import { konuDurumlari } from '../engine/mastery';
import { Cubuk, Sayfa, Ust, Yukleniyor, useVeri } from './ortak';

function CizgiGrafik({ degerler }: { degerler: number[] }) {
  const G = 320;
  const Y = 170;
  const p = { sol: 34, sag: 10, ust: 10, alt: 26 };
  const w = G - p.sol - p.sag;
  const h = Y - p.ust - p.alt;
  const x = (i: number) => p.sol + (degerler.length <= 1 ? w / 2 : (i / (degerler.length - 1)) * w);
  const y = (v: number) => p.ust + h - (v / 100) * h;
  const noktalar = degerler.map((v, i) => `${x(i)},${y(v)}`).join(' ');
  const son = degerler[degerler.length - 1];

  return (
    <svg class="grafik" viewBox={`0 0 ${G} ${Y}`} role="img" aria-label={`Başarı grafiği, ${degerler.length} test, son değer yüzde ${son}`}>
      {[0, 50, 75, 100].map((v) => (
        <g>
          <line x1={p.sol} x2={G - p.sag} y1={y(v)} y2={y(v)} class={v === 50 || v === 75 ? 'esik' : 'izgara'} />
          <text x={p.sol - 6} y={y(v) + 4} text-anchor="end" class="eksen">
            {v}
          </text>
        </g>
      ))}
      <polyline points={noktalar} class="cizgi" />
      {degerler.map((v, i) => (
        <circle cx={x(i)} cy={y(v)} r={degerler.length > 30 ? 1.5 : 3} class="nokta-g" />
      ))}
      <text x={x(0)} y={Y - 6} text-anchor="middle" class="eksen">
        1
      </text>
      {degerler.length > 1 && (
        <text x={x(degerler.length - 1)} y={Y - 6} text-anchor="middle" class="eksen">
          {degerler.length}
        </text>
      )}
    </svg>
  );
}

export function Ilerleme() {
  const [secili, setSecili] = useState<string | null>(null);
  const { veri, hata } = useVeri(async () => {
    const [cevaplar, testler] = await Promise.all([depo.cevaplar(), depo.testler()]);
    return { cevaplar, testler };
  });
  if (!veri) return <Yukleniyor hata={hata} />;
  const { cevaplar, testler } = veri;

  const bitenler = testler.filter((t) => t.durum === 'bitti');
  const denemeler = bitenler.filter((t) => t.tip === 'deneme');
  const sayilanTestler = bitenler.filter((t) => t.tip !== 'tekrar').map((t) => t.id!);
  const sayilan = cevaplar.filter((c) => c.test_tipi !== 'tekrar');
  const dogru = sayilan.filter((c) => c.dogru_mu).length;
  const durumlar = konuDurumlari(KONULAR, cevaplar);
  const cozulmus = new Set(cevaplar.map((c) => c.soru_id));
  const gecmis = konuGecmisi(KONULAR, cevaplar, sayilanTestler);
  const seciliKonu = secili ?? [...durumlar.values()].sort((a, b) => b.eksiklik - a.eksiklik)[0]?.konu;

  return (
    <Sayfa menu="ilerleme">
      <Ust baslik="İlerleme" />

      <section class="istatistik-satiri" aria-label="Toplamlar">
        <div class="istatistik">
          <strong>{bitenler.length}</strong>
          <span>çözülen test</span>
        </div>
        <div class="istatistik">
          <strong>{cozulmus.size}</strong>
          <span>çözülen soru</span>
        </div>
        <div class="istatistik">
          <strong>%{sayilan.length ? Math.round((dogru / sayilan.length) * 100) : 0}</strong>
          <span>doğru oranı</span>
        </div>
      </section>

      {denemeler.length > 0 && (
        <section class="kart">
          <h2>Deneme sınavların</h2>
          <div class="tablo-kap">
            <table class="tablo">
              <thead>
                <tr>
                  <th>Deneme</th>
                  <th>Tarih</th>
                  <th class="sag">Puan</th>
                  <th class="sag">Seviye</th>
                </tr>
              </thead>
              <tbody>
                {denemeler.map((t) => {
                  const puan = ydsPuani(t.dogru_sayisi, t.soru_idleri.length);
                  return (
                    <tr>
                      <td>
                        <a href={`#/sonuc/${t.id}`}>{t.sira_no}</a>
                      </td>
                      <td>{new Date(t.bitis ?? t.baslangic).toLocaleDateString('tr-TR')}</td>
                      <td class="sag">{puan.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}</td>
                      <td class="sag">{ydsSeviyesi(puan)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {sayilanTestler.length > 0 && seciliKonu && (
        <section class="kart">
          <h2>Zaman içinde başarı</h2>
          <label class="alan">
            <span class="soluk kucuk">Konu</span>
            <select value={seciliKonu} onChange={(e) => setSecili((e.target as HTMLSelectElement).value)}>
              {KONULAR.map((k) => (
                <option value={k.kod}>{k.ad}</option>
              ))}
            </select>
          </label>
          <CizgiGrafik degerler={gecmis.get(seciliKonu) ?? []} />
          <p class="soluk kucuk">Yatay eksen: test numarası · Dikey: başarı yüzdesi (kesikli çizgiler %50 ve %75)</p>
        </section>
      )}

      <section class="kart">
        <h2>Konular</h2>
        <ul class="konu-listesi">
          {KONULAR.map((k) => {
            const d = durumlar.get(k.kod)!;
            const toplam = SORULAR.filter((s) => s.konu === k.kod).length;
            const cozulen = SORULAR.filter((s) => s.konu === k.kod && cozulmus.has(s.id)).length;
            return (
              <li>
                <button class="satir-dugme" onClick={() => setSecili(k.kod)} aria-label={`${k.ad} grafiğini göster`}>
                  <div class="satir-ust">
                    <span>{konuAdi(k.kod)}</span>
                    <span class="soluk">{d.deneme ? `%${Math.round(d.ustalik * 100)}` : '—'}</span>
                  </div>
                  <div class="satir-ust soluk kucuk">
                    <span>{cozulen} çözüldü</span>
                    <span>{toplam - cozulen} yeni soru kaldı</span>
                  </div>
                  <Cubuk yuzde={d.deneme ? Math.round(d.ustalik * 100) : 0} />
                </button>
              </li>
            );
          })}
        </ul>
      </section>
    </Sayfa>
  );
}
