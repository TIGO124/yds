import { useState } from 'preact/hooks';
import { SORU_MAP, soruEtiketi, soruParagrafi } from '../data/bank';
import { depo } from '../depo';
import { CONFIG } from '../engine/config';
import { IkonBayrak } from './ikonlar';
import { DeftereEkle } from './KelimeSecici';
import { BoslukluMetin, HARF, ParagrafMetni, Sayfa, Ust, Yukleniyor, useVeri } from './ortak';
import { git } from './router';

/** "Sonra bak" diye işaretlenen sorular: cevap ve açıklamayla birlikte. */
export function Kaydedilenler() {
  const [mesaj, setMesaj] = useState<string | null>(null);
  const [kaldirilan, setKaldirilan] = useState<Set<string>>(new Set());
  const { veri, hata } = useVeri(async () => {
    const [isaretler, aktif] = await Promise.all([depo.isaretler(), depo.aktifTest()]);
    return { isaretler, aktif };
  });
  if (!veri) return <Yukleniyor hata={hata} />;
  const { isaretler, aktif } = veri;
  // Devam eden testteki sorunun cevabı test bitene kadar gösterilmez.
  const gizli = (id: string) => !!aktif?.soru_idleri.includes(id);
  const liste = isaretler.filter((i) => SORU_MAP.has(i.soru_id) && !kaldirilan.has(i.soru_id));
  const cozulebilir = liste.map((i) => i.soru_id).filter((id) => !gizli(id));

  const kaldir = (id: string) => {
    setKaldirilan(new Set(kaldirilan).add(id));
    void depo.isaretle(id, false);
  };

  const baslat = async () => {
    if (aktif && aktif.tip !== 'tekrar') {
      setMesaj('Önce devam eden testi bitir.');
      return;
    }
    const id = await depo.tekrarTestiBaslat(cozulebilir);
    if (id !== null) git(`/test/${id}`);
  };

  return (
    <Sayfa>
      <Ust baslik="Kaydettiklerim" geri="" />
      <section class="kart">
        <p class="buyuk-metin">{liste.length} soru</p>
        <p class="soluk kucuk">
          Kaydettiğin sorulardan {CONFIG.TEST_BOYUTU} soruluk bir tekrar testi çözebilirsin; tekrar testleri konu puanlarını
          etkilemez.
        </p>
        <button class="dugme birincil genis" onClick={baslat} disabled={aktif?.tip !== 'tekrar' && cozulebilir.length === 0}>
          {aktif?.tip === 'tekrar' ? 'Tekrar testine devam et' : 'Bu sorulardan test çöz'}
        </button>
        {mesaj && (
          <p class="hata-kutu" role="alert">
            {mesaj}
          </p>
        )}
      </section>

      {liste.length === 0 ? (
        <p class="soluk orta">
          Henüz kaydettiğin soru yok. Test sırasında "İşaretle"ye ya da sonuç ekranında "Kaydet"e dokunarak ekleyebilirsin.
        </p>
      ) : (
        <div class="inceleme-listesi">
          {liste.map(({ soru_id }) => {
            const s = SORU_MAP.get(soru_id)!;
            const ilkSatir = ((soruParagrafi(s) ?? s.soru).trim().split('\n')[0] ?? '').slice(0, 80);
            return (
              <details class="inceleme" data-soru={s.id} data-cevap-acik={gizli(s.id) ? '0' : '1'}>
                <summary>
                  <span class="durum-ikon kayitli">
                    <IkonBayrak boyut={14} dolu />
                  </span>
                  <span class="inceleme-baslik">
                    <strong>{soruEtiketi(s)}</strong>
                    <span class="soluk kucuk ozet-satiri" lang="en">
                      <BoslukluMetin metin={ilkSatir} />…
                    </span>
                  </span>
                </summary>
                <ParagrafMetni soru={s} kucuk />
                <p class="soru-metni kucuk-soru" lang="en">
                  <BoslukluMetin metin={s.soru} />
                </p>
                {gizli(s.id) ? (
                  <p class="bilgi-kutu">Bu soru devam eden testinde; cevabı ve açıklaması test bitince görünür.</p>
                ) : (
                  <>
                    <ul class="inceleme-secenekler">
                      {s.secenekler.map((m, j) => (
                        <li class={j === s.dogru ? 'dogru' : ''}>
                          <span class="harf">{HARF[j]}</span> {m}
                        </li>
                      ))}
                    </ul>
                    <p class="aciklama">{s.aciklama}</p>
                  </>
                )}
                <div class="dugme-satiri">
                  <button class="dugme metin" onClick={() => kaldir(s.id)}>
                    Listeden çıkar
                  </button>
                  {!gizli(s.id) && <DeftereEkle soru={s} />}
                </div>
              </details>
            );
          })}
        </div>
      )}
    </Sayfa>
  );
}
