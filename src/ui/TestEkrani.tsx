import { useEffect, useRef, useState } from 'preact/hooks';
import { SORU_MAP, bolumAdi, soruEtiketi } from '../data/bank';
import { depo } from '../depo';
import { DENEME_DAKIKA } from '../engine/deneme';
import { calisildiBildir } from '../hatirlatma';
import type { Ayarlar, TestKaydi } from '../types';
import { IkonBayrak, IkonCarpi, IkonGeri, IkonIleri } from './ikonlar';
import { DeftereEkle } from './KelimeSecici';
import { onayla } from './onay';
import { BoslukluMetin, HARF, ParagrafMetni, Yukleniyor, testAdi } from './ortak';
import { git } from './router';

const sayacMetni = (ms: number) => {
  const s = Math.ceil(ms / 1000);
  const iki = (x: number) => String(x).padStart(2, '0');
  return `${Math.floor(s / 3600)}:${iki(Math.floor((s % 3600) / 60))}:${iki(s % 60)}`;
};

export function TestEkrani({ id }: { id: number }) {
  const [test, setTest] = useState<TestKaydi | null>(null);
  const [ayar, setAyar] = useState<Ayarlar | null>(null);
  const [isaretli, setIsaretli] = useState<Set<string>>(new Set());
  const [index, setIndex] = useState(0);
  const [bosAcik, setBosAcik] = useState<Set<number>>(new Set());
  const [bitiriliyor, setBitiriliyor] = useState(false);
  const [hata, setHata] = useState<string | null>(null);
  const baslangic = useRef(Date.now());
  /** Cevabı gösterilmiş soruda açıklama okuma süresi soru süresine eklenmez. */
  const cevapAcik = useRef(false);

  useEffect(() => {
    Promise.all([depo.test(id), depo.ayarlar(), depo.isaretler()])
      .then(([t, a, isaretler]) => {
        if (!t) return git('/', true);
        if (t.durum === 'bitti') return git(`/sonuc/${id}`, true);
        setTest(t);
        setAyar(a);
        setIsaretli(new Set(isaretler.map((i) => i.soru_id)));
        setIndex(Math.min(t.aktif_index, t.soru_idleri.length - 1));
        baslangic.current = Date.now();
      })
      .catch((e: unknown) => setHata(String(e)));
  }, [id]);

  /** Bu soruda geçen düşünme süresini döndürür ve sayacı sıfırlar. */
  const gecen = () => {
    const simdi = Date.now();
    const g = simdi - baslangic.current;
    baslangic.current = simdi;
    return cevapAcik.current ? 0 : g;
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
  cevapAcik.current = acik;

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

  const isaretle = () => {
    if (!test) return;
    const soruId = test.soru_idleri[index];
    const yeni = new Set(isaretli);
    const deger = !yeni.has(soruId);
    if (deger) yeni.add(soruId);
    else yeni.delete(soruId);
    setIsaretli(yeni);
    void depo.isaretle(soruId, deger);
  };

  /** zorla: süre dolduğunda onay sormadan bitirir. */
  const bitir = async (zorla = false) => {
    if (!test || bitiriliyor) return;
    const bos = test.secimler.filter((s) => s === null).length;
    const isaretSayisi = test.soru_idleri.filter((s) => isaretli.has(s)).length;
    setBitiriliyor(true);
    const ekler = [bos > 0 && `${bos} soru boş.`, isaretSayisi > 0 && `${isaretSayisi} işaretli soru var.`].filter(Boolean).join(' ');
    const soru = deneme
      ? `Denemeyi bitirmek istiyor musun?${ekler ? ` ${ekler}` : ''} Bitirdikten sonra cevap değiştirilemez.`
      : `${ekler} Testi bitirmek istiyor musun?`;
    if (!zorla && (deneme || ekler) && !(await onayla(soru, { onay: deneme ? 'Denemeyi bitir' : 'Testi bitir' }))) {
      setBitiriliyor(false);
      return;
    }
    try {
      await depo.konumKaydet(id, index, gecen(), index);
      await depo.testiBitir(id);
      calisildiBildir();
      const plan = await depo.planGaranti();
      const raporlu = (test.tip === 'teshis' && test.sira_no === plan.length) || test.tip === 'kontrol';
      git(raporlu ? `/rapor?test=${id}` : `/sonuc/${id}`, true);
    } catch (e) {
      setHata(String(e));
      setBitiriliyor(false);
    }
  };

  const cik = () => {
    void depo.konumKaydet(id, index, gecen(), index);
    git('/');
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

  // Metin üst çubuğun altına kayınca çubuğun alt çizgisi görünsün.
  const [kaydi, setKaydi] = useState(false);
  useEffect(() => {
    const dinle = () => setKaydi(window.scrollY > 4);
    window.addEventListener('scroll', dinle, { passive: true });
    return () => window.removeEventListener('scroll', dinle);
  }, []);

  // Klavye: A–E / 1–5 seçim, ok tuşları gezinme
  useEffect(() => {
    const tus = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if ((e.target as Element | null)?.closest?.('input, textarea, select')) return;
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
  const buIsaretli = isaretli.has(soru.id);

  return (
    <div class="test-ekrani">
      <header class={`test-ust${kaydi ? ' kaydi' : ''}`}>
        <button class="ikon-dugme" aria-label="Testi kaydet ve çık" onClick={cik}>
          <IkonCarpi />
        </button>
        <div class="test-baslik">
          {deneme && kalanMs !== null ? (
            <span class={`sayac${kalanMs < 10 * 60_000 ? ' az' : ''}`} role="timer" aria-label="Kalan süre">
              {sayacMetni(kalanMs)}
            </span>
          ) : (
            <span class="soluk kucuk">{testAdi(test)}</span>
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
        {test.soru_idleri.map((sid, i) => (
          <button
            class={`nokta${i === index ? ' simdiki' : ''}${test.secimler[i] !== null ? ' dolu' : ''}${isaretli.has(sid) ? ' isaretli' : ''}`}
            aria-label={`Soru ${i + 1}${test.secimler[i] !== null ? ', cevaplandı' : ''}${isaretli.has(sid) ? ', işaretli' : ''}`}
            aria-current={i === index ? 'step' : undefined}
            onClick={() => gitIndex(i)}
          >
            {i + 1}
          </button>
        ))}
      </nav>

      <main class="sayfa test-govde" data-soru={soru.id} data-cevap-acik={acik ? '1' : '0'}>
        <div class="soru-ust">
          <p class="konu-etiketi">{ayar.konu_etiketini_goster ? soruEtiketi(soru) : deneme ? bolumAdi(soru.bolum) : ''}</p>
          <button
            class={`isaret-dugme${buIsaretli ? ' secili' : ''}`}
            aria-pressed={buIsaretli}
            onClick={isaretle}
            title="Sonra bakmak için işaretle; Tekrar › Kaydettiklerim'de listelenir."
          >
            <IkonBayrak boyut={18} dolu={buIsaretli} />
            {buIsaretli ? 'İşaretli' : 'İşaretle'}
          </button>
        </div>
        <ParagrafMetni soru={soru} />
        <p class="soru-metni" lang="en">
          <BoslukluMetin metin={soru.soru} />
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
            <DeftereEkle key={soru.id} soru={soru} />
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
