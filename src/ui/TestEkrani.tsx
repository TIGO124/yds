import { useEffect, useRef, useState } from 'preact/hooks';
import { SORU_MAP, bolumAdi, soruEtiketi } from '../data/bank';
import { depo } from '../depo';
import { DENEME_DAKIKA } from '../engine/deneme';
import type { Ayarlar, TestKaydi } from '../types';
import { IkonCarpi, IkonGeri, IkonIleri } from './ikonlar';
import { onayla } from './onay';
import { HARF, ParagrafMetni, TIP_AD, Yukleniyor } from './ortak';
import { git } from './router';

const sayacMetni = (ms: number) => {
  const s = Math.ceil(ms / 1000);
  const iki = (x: number) => String(x).padStart(2, '0');
  return `${Math.floor(s / 3600)}:${iki(Math.floor((s % 3600) / 60))}:${iki(s % 60)}`;
};

export function TestEkrani({ id }: { id: number }) {
  const [test, setTest] = useState<TestKaydi | null>(null);
  const [ayar, setAyar] = useState<Ayarlar | null>(null);
  const [index, setIndex] = useState(0);
  const [bosAcik, setBosAcik] = useState<Set<number>>(new Set());
  const [bitiriliyor, setBitiriliyor] = useState(false);
  const [hata, setHata] = useState<string | null>(null);
  const baslangic = useRef(Date.now());

  useEffect(() => {
    Promise.all([depo.test(id), depo.ayarlar()])
      .then(([t, a]) => {
        if (!t) return git('/', true);
        if (t.durum === 'bitti') return git(`/sonuc/${id}`, true);
        setTest(t);
        setAyar(a);
        setIndex(Math.min(t.aktif_index, t.soru_idleri.length - 1));
        baslangic.current = Date.now();
      })
      .catch((e: unknown) => setHata(String(e)));
  }, [id]);

  /** Bu soruda geçen süreyi döndürür ve sayacı sıfırlar. */
  const gecen = () => {
    const simdi = Date.now();
    const g = simdi - baslangic.current;
    baslangic.current = simdi;
    return g;
  };

  // Uygulama arka plana geçince süreyi kaydet; ön plana gelince sayaç yeniden başlar.
  useEffect(() => {
    const dinle = () => {
      if (document.hidden) void depo.konumKaydet(id, index, gecen(), index);
      else baslangic.current = Date.now();
    };
    document.addEventListener('visibilitychange', dinle);
    return () => document.removeEventListener('visibilitychange', dinle);
  }, [id, index]);

  const n = test?.soru_idleri.length ?? 0;
  const deneme = test?.tip === 'deneme';
  // Denemede cevaplar gerçek sınavdaki gibi sonda gösterilir.
  const aninda = ayar?.cevabi_goster === 'aninda' && !deneme;
  const secim = test?.secimler[index] ?? null;
  const acik = aninda && (secim !== null || bosAcik.has(index));

  const sec = (s: number | null) => {
    if (!test || acik) return;
    const secimler = [...test.secimler];
    secimler[index] = s;
    setTest({ ...test, secimler });
    if (s === null && aninda) setBosAcik(new Set(bosAcik).add(index));
    void depo.secimKaydet(id, index, s, gecen(), index);
  };

  const gitIndex = (yeni: number) => {
    if (yeni < 0 || yeni >= n) return;
    void depo.konumKaydet(id, index, gecen(), yeni);
    setIndex(yeni);
    window.scrollTo(0, 0);
  };

  /** zorla: süre dolduğunda onay sormadan bitirir. */
  const bitir = async (zorla = false) => {
    if (!test || bitiriliyor) return;
    const bos = test.secimler.filter((s) => s === null).length;
    setBitiriliyor(true);
    const soru = deneme
      ? `Denemeyi bitirmek istiyor musun?${bos > 0 ? ` ${bos} soru boş.` : ''} Bitirdikten sonra cevap değiştirilemez.`
      : `${bos} soru boş. Testi bitirmek istiyor musun?`;
    if (!zorla && (deneme || bos > 0) && !(await onayla(soru, { onay: deneme ? 'Denemeyi bitir' : 'Testi bitir' }))) {
      setBitiriliyor(false);
      return;
    }
    try {
      await depo.konumKaydet(id, index, gecen(), index);
      await depo.testiBitir(id);
      const plan = await depo.planGaranti();
      const raporlu = (test.tip === 'teshis' && test.sira_no === plan.length) || test.tip === 'kontrol';
      git(raporlu ? `/rapor?test=${id}` : `/sonuc/${id}`, true);
    } catch (e) {
      setHata(String(e));
      setBitiriliyor(false);
    }
  };

  // Deneme sayacı: süre gerçek saatle işler (uygulama kapalıyken de); dolunca test kendiliğinden biter.
  const [kalanMs, setKalanMs] = useState<number | null>(null);
  useEffect(() => {
    if (!test || !deneme) return;
    const bitis = test.baslangic + DENEME_DAKIKA * 60_000;
    const tik = () => {
      const k = bitis - Date.now();
      setKalanMs(Math.max(0, k));
      if (k <= 0) void bitir(true);
    };
    tik();
    const z = setInterval(tik, 1000);
    return () => clearInterval(z);
  }, [test?.id, deneme, bitiriliyor]);

  // Uzun testlerde numara şeridi geçerli soruyu göstersin.
  useEffect(() => {
    document.querySelector('.nokta.simdiki')?.scrollIntoView({ inline: 'center', block: 'nearest' });
  }, [index, test?.id]);

  // Klavye: A–E / 1–5 seçim, ok tuşları gezinme
  useEffect(() => {
    const tus = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const k = e.key.toUpperCase();
      const harf = HARF.indexOf(k);
      if (harf >= 0 && k.length === 1) sec(harf);
      else if (/^[1-5]$/.test(k)) sec(Number(k) - 1);
      else if (e.key === 'ArrowRight') gitIndex(index + 1);
      else if (e.key === 'ArrowLeft') gitIndex(index - 1);
    };
    window.addEventListener('keydown', tus);
    return () => window.removeEventListener('keydown', tus);
  });

  if (!test || !ayar) return <Yukleniyor hata={hata} />;
  const soru = SORU_MAP.get(test.soru_idleri[index]);
  if (!soru) return <Yukleniyor hata="Soru bulunamadı." />;
  const son = index === n - 1;

  return (
    <div class="test-ekrani">
      <header class="test-ust">
        <button class="ikon-dugme" aria-label="Testi kaydet ve çık" onClick={() => git('/')}>
          <IkonCarpi />
        </button>
        <div class="test-baslik">
          {deneme && kalanMs !== null ? (
            <span class={`sayac${kalanMs < 10 * 60_000 ? ' az' : ''}`} role="timer" aria-label="Kalan süre">
              {sayacMetni(kalanMs)}
            </span>
          ) : (
            <span class="soluk kucuk">
              {TIP_AD[test.tip]} {test.tip !== 'tekrar' && test.sira_no}
            </span>
          )}
          <strong>
            Soru {index + 1}/{n}
          </strong>
        </div>
        <button class="dugme metin" onClick={() => bitir()} disabled={bitiriliyor}>
          Bitir
        </button>
      </header>

      <nav class="noktalar" aria-label="Sorular">
        {test.soru_idleri.map((_, i) => (
          <button
            class={`nokta${i === index ? ' simdiki' : ''}${test.secimler[i] !== null ? ' dolu' : ''}`}
            aria-label={`Soru ${i + 1}${test.secimler[i] !== null ? ', cevaplandı' : ''}`}
            aria-current={i === index ? 'step' : undefined}
            onClick={() => gitIndex(i)}
          >
            {i + 1}
          </button>
        ))}
      </nav>

      <main class="sayfa test-govde">
        {ayar.konu_etiketini_goster ? (
          <p class="konu-etiketi">{soruEtiketi(soru)}</p>
        ) : (
          deneme && <p class="konu-etiketi">{bolumAdi(soru.bolum)}</p>
        )}
        <ParagrafMetni soru={soru} />
        <p class="soru-metni" lang="en">
          {soru.soru}
        </p>

        <div class="secenekler" role="radiogroup" aria-label="Seçenekler">
          {soru.secenekler.map((metin, i) => {
            let durum = secim === i ? ' secili' : '';
            if (acik && i === soru.dogru) durum = ' dogru';
            else if (acik && secim === i) durum = ' yanlis';
            return (
              <button
                role="radio"
                aria-checked={secim === i}
                class={`secenek${durum}`}
                onClick={() => sec(secim === i ? null : i)}
                disabled={acik}
              >
                <span class="harf">{HARF[i]}</span>
                <span class="secenek-metni">{metin}</span>
              </button>
            );
          })}
        </div>

        {acik && (
          <div class={`geri-bildirim ${secim === soru.dogru ? 'iyi' : 'zayif'}`} role="status">
            <strong>
              {secim === soru.dogru ? 'Doğru!' : secim === null ? `Boş. Doğru cevap: ${HARF[soru.dogru]}` : `Yanlış. Doğru cevap: ${HARF[soru.dogru]}`}
            </strong>
            <p>{soru.aciklama}</p>
          </div>
        )}
      </main>

      <footer class="test-alt">
        <button class="dugme ikincil" onClick={() => gitIndex(index - 1)} disabled={index === 0} aria-label="Önceki soru">
          <IkonGeri />
        </button>
        <button class="dugme ikincil" onClick={() => sec(null)} disabled={acik || (secim === null && !aninda)}>
          Boş bırak
        </button>
        {son ? (
          <button class="dugme birincil" onClick={() => bitir()} disabled={bitiriliyor}>
            Testi bitir
          </button>
        ) : (
          <button class="dugme birincil" onClick={() => gitIndex(index + 1)} aria-label="Sonraki soru">
            Sonraki <IkonIleri />
          </button>
        )}
      </footer>
    </div>
  );
}
