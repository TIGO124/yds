import { bolumAdi } from '../data/bank';
import { bolumSureleri, dakikaSaniye, enUzunlar, hizliYanlislar, type SureliCevap } from '../engine/sure';
import type { TestKaydi } from '../types';

const DURUM_AD = { dogru: 'doğru', yanlis: 'yanlış', bos: 'boş' } as const;
const durum = (c: SureliCevap) => (c.secilen === null ? 'bos' : c.dogru_mu ? 'dogru' : 'yanlis');

/** Test sonu süre analizi: bölüm ortalamaları, en uzun düşünülen ve aceleyle yanlış yapılan sorular. */
export function SureAnalizi({
  test,
  cevaplar,
  soruyaGit,
}: {
  test: TestKaydi;
  cevaplar: SureliCevap[];
  soruyaGit: (index: number) => void;
}) {
  const olculen = cevaplar.filter((c) => c.sure_ms > 0);
  if (olculen.length === 0) return null;
  const toplamMs = olculen.reduce((t, c) => t + c.sure_ms, 0);
  const bolumler = bolumSureleri(cevaplar);
  const uzunlar = enUzunlar(cevaplar, 3);
  const hizlilar = hizliYanlislar(cevaplar);
  const yavaslar = bolumler.filter((b) => b.tempo === 'yavas');
  const sira = (c: SureliCevap) => test.soru_idleri.indexOf(c.soru_id);

  const satir = (c: SureliCevap) => (
    <li>
      <button class="satir-dugme" onClick={() => soruyaGit(sira(c))}>
        <span class="satir-ust">
          <span>
            {sira(c) + 1}. soru · {bolumAdi(c.bolum)}
          </span>
          <span class={`soluk sure-deger ${durum(c)}`}>
            {dakikaSaniye(c.sure_ms)} · {DURUM_AD[durum(c)]}
          </span>
        </span>
      </button>
    </li>
  );

  return (
    <section class="kart">
      <h2>Süre</h2>
      <p class="soluk kucuk">
        Toplam {dakikaSaniye(toplamMs)} · soru başına ortalama {dakikaSaniye(toplamMs / olculen.length)} (dk:sn)
      </p>
      {test.tip === 'deneme' &&
        yavaslar.map((b) => (
          <p class="uyari-kutu">
            {bolumAdi(b.bolum)} temposu geride: soru başına {dakikaSaniye(b.ortalamaMs)}, önerilen {dakikaSaniye(b.hedefMs!)}.
          </p>
        ))}
      <div class="tablo-kap">
        <table class="tablo">
          <thead>
            <tr>
              <th>Bölüm</th>
              <th class="sag">Ortalama</th>
              <th class="sag">Önerilen</th>
            </tr>
          </thead>
          <tbody>
            {bolumler.map((b) => (
              <tr>
                <td>{bolumAdi(b.bolum)}</td>
                <td class={`sag tempo ${b.tempo ?? ''}`}>
                  {dakikaSaniye(b.ortalamaMs)}
                  {b.tempo === 'yavas' && <span class="sr-only"> (yavaş)</span>}
                </td>
                <td class="sag soluk">{b.hedefMs ? dakikaSaniye(b.hedefMs) : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h3>En uzun düşündüğün sorular</h3>
      <ul class="sure-listesi">
        {uzunlar.map(satir)}
      </ul>

      {hizlilar.length > 0 && (
        <>
          <h3>Aceleyle yanlış</h3>
          <p class="soluk kucuk">Çok kısa sürede işaretleyip yanlış yaptığın sorular. Soruyu sonuna kadar okumadan şık seçmiş olabilirsin.</p>
          <ul class="sure-listesi">
            {hizlilar.map(satir)}
          </ul>
        </>
      )}
    </section>
  );
}
