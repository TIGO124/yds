// VS maç ekranı: geri sayım, eş zamanlı sorular, açıklama arası ve sonuç.
import type { ComponentChildren } from 'preact';
import { useEffect, useMemo, useState } from 'preact/hooks';
import { bolumAdi } from '../data/bank';
import type { VsBaglanti } from '../vs/baglanti';
import { MacOturumu, type MacDurumu } from '../vs/istemci';
import { VS, asamaHesapla, cevaplar, dogruSayisi, kapananSoru, puan, rakipUid, skor, type Mac } from '../vs/oyun';
import { IkonCarpi } from './ikonlar';
import { onayla } from './onay';
import { BoslukluMetin, HARF } from './ortak';
import { git } from './router';
import { istatistikKaydet } from './VsEkrani';

interface Props {
  b: VsBaglanti;
  macId: string;
  /** Rakip maça gelmedi: yeniden rakip aranır */
  yenidenAra: (mesaj: string) => void;
}

const bittiMi = (d: MacDurumu) =>
  (d.tip === 'oyun' && d.asama.tip === 'bitti') || d.tip === 'rakip_cikti' || d.tip === 'rakip_koptu';

export function VsMacEkrani({ b, macId, yenidenAra }: Props) {
  const [, setSurum] = useState(0);
  const oturum = useMemo(() => new MacOturumu(b, macId, () => setSurum((s) => s + 1)), [b, macId]);
  const [simdi, setSimdi] = useState(() => b.simdi());

  useEffect(() => {
    oturum.baslat();
    const z = setInterval(() => setSimdi(b.simdi()), 100);
    return () => {
      clearInterval(z);
      // Oyun bitmeden ekrandan çıkılırsa (geri tuşu) rakip hükmen kazanır.
      if (oturum.mac && !bittiMi(oturum.durum())) {
        if (oturum.mac.basla !== undefined) istatistikKaydet(macId, 'maglubiyet');
        void oturum.cik();
      } else oturum.kapat();
    };
  }, [oturum]);

  const durum = oturum.durum(simdi);
  const mac = oturum.mac;

  useEffect(() => {
    if (durum.tip === 'iptal') yenidenAra('Rakip maça bağlanamadı; yeni rakip aranıyor.');
  }, [durum.tip]);

  const soruIndex = durum.tip === 'oyun' && (durum.asama.tip === 'soru' || durum.asama.tip === 'aciklama') ? durum.asama.i : -1;

  // Klavye: A–E / 1–5 ile cevap
  useEffect(() => {
    if (soruIndex < 0) return;
    const tus = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if ((e.target as Element | null)?.closest?.('input, textarea')) return;
      const k = e.key.toUpperCase();
      const harf = HARF.indexOf(k);
      if (harf >= 0 && k.length === 1) oturum.cevapla(soruIndex, harf);
      else if (/^[1-5]$/.test(k)) oturum.cevapla(soruIndex, Number(k) - 1);
    };
    window.addEventListener('keydown', tus);
    return () => window.removeEventListener('keydown', tus);
  }, [soruIndex, oturum]);

  const cik = async () => {
    const bitti = bittiMi(durum);
    if (!bitti && mac?.basla !== undefined && !(await onayla('Oyundan çıkarsan rakibin hükmen kazanır. Çıkılsın mı?', { onay: 'Oyundan çık' })))
      return;
    if (bitti) oturum.kapat();
    else {
      if (mac?.basla !== undefined) istatistikKaydet(macId, 'maglubiyet');
      await oturum.cik();
    }
    git('/');
  };

  if (!mac || durum.tip === 'yukleniyor' || durum.tip === 'iptal' || (durum.tip === 'oyun' && durum.asama.tip === 'hazirlaniyor')) {
    return (
      <VsCerceve cik={cik}>
        <section class="kart vs-arama" aria-live="polite">
          <p class="etiket-ust">Rakip bulundu</p>
          <p class="buyuk-metin">{mac ? rakipAdi(mac, oturum.uid) : '…'}</p>
          <p class="soluk kucuk">Bağlantı kuruluyor…</p>
        </section>
      </VsCerceve>
    );
  }

  if (bittiMi(durum)) {
    // Hükmen bitişte yalnızca oynanmış sorular listelenir.
    const oynanan = durum.tip === 'oyun' ? mac.sorular.length : kapananSoru(asamaHesapla(mac, simdi), mac.sorular.length);
    return <VsSonuc mac={mac} uid={oturum.uid} durum={durum} macId={macId} oynanan={oynanan} yeni={() => yenidenAra('')} />;
  }
  if (durum.tip !== 'oyun') return null;
  const a = durum.asama;

  if (a.tip === 'geri_sayim') {
    return (
      <VsCerceve cik={cik}>
        <section class="vs-geri-sayim" aria-live="assertive">
          <p class="soluk">Rakibin</p>
          <h1>{rakipAdi(mac, oturum.uid)}</h1>
          <p class="vs-sayi">{Math.max(1, Math.ceil((a.bitis - simdi) / 1000))}</p>
          <p class="soluk kucuk">
            {mac.sorular.length} soru · soru başına {VS.SORU_SURE / 1000} sn
          </p>
        </section>
      </VsCerceve>
    );
  }

  if (a.tip !== 'soru' && a.tip !== 'aciklama') return null;
  const i = a.i;
  const soru = mac.sorular[i];
  const rakip = rakipUid(mac, oturum.uid);
  const benim = cevaplar(mac, oturum.uid).get(i);
  const onun = cevaplar(mac, rakip).get(i);
  const acik = a.tip === 'aciklama';
  const kapanan = kapananSoru(a, mac.sorular.length);
  const kalan = a.tip === 'soru' ? Math.max(0, a.bitis - simdi) : 0;

  return (
    <VsCerceve cik={cik} mac={mac} uid={oturum.uid} kapanan={kapanan} baslik={`Soru ${i + 1}/${mac.sorular.length}`}>
      <div class="vs-sure" role="timer" aria-label={`Kalan süre ${Math.ceil(kalan / 1000)} saniye`}>
        <div class={`vs-sure-dolgu${kalan < 10_000 ? ' az' : ''}`} style={{ width: `${(kalan / VS.SORU_SURE) * 100}%` }} />
      </div>
      <main class="sayfa test-govde vs-govde">
        <div class="soru-ust">
          <p class="konu-etiketi">{bolumAdi(soru.bolum)}</p>
          <span class={`vs-sure-metni${kalan < 10_000 && !acik ? ' az' : ''}`}>{acik ? '' : `${Math.ceil(kalan / 1000)} sn`}</span>
        </div>
        <p class="soru-metni" lang="en">
          <BoslukluMetin metin={soru.soru} />
        </p>
        <div class="secenekler" role="radiogroup" aria-label="Seçenekler">
          {soru.secenekler.map((metin, j) => {
            let sinif = benim?.s === j ? ' secili' : '';
            if (acik && j === soru.dogru) sinif = ' dogru';
            else if (acik && benim?.s === j) sinif = ' yanlis';
            return (
              <button
                role="radio"
                aria-checked={benim?.s === j}
                class={`secenek${sinif}`}
                disabled={acik || !!benim}
                onClick={() => oturum.cevapla(i, j)}
              >
                <span class="harf">{HARF[j]}</span>
                <span class="secenek-metni">{metin}</span>
                {acik && onun?.s === j && <span class="vs-rakip-isareti">{rakipAdi(mac, oturum.uid)}</span>}
              </button>
            );
          })}
        </div>
        {acik ? (
          <div class={`geri-bildirim ${benim?.s === soru.dogru ? 'iyi' : 'zayif'}`} role="status">
            <strong>
              {benim?.s === soru.dogru ? `Doğru! +${puan(soru, benim)} puan` : benim ? `Yanlış. Doğru cevap: ${HARF[soru.dogru]}` : `Süre doldu. Doğru cevap: ${HARF[soru.dogru]}`}
            </strong>
            <p class="kucuk">
              {rakipAdi(mac, oturum.uid)}: {onun ? (onun.s === soru.dogru ? `doğru, +${puan(soru, onun)}` : 'yanlış') : 'cevaplamadı'}
            </p>
            <p>{soru.aciklama}</p>
          </div>
        ) : (
          <p class="soluk kucuk vs-bekleme" aria-live="polite">
            {oturum.rakipKopuk
              ? 'Rakibin bağlantısı koptu; biraz bekleniyor…'
              : benim
                ? onun
                  ? ''
                  : `${rakipAdi(mac, oturum.uid)} düşünüyor…`
                : onun
                  ? `${rakipAdi(mac, oturum.uid)} cevapladı!`
                  : ''}
          </p>
        )}
      </main>
    </VsCerceve>
  );
}

const durumSinifi = (c: { s: number } | undefined, dogru: number) => (!c ? 'bos' : c.s === dogru ? 'iyi' : 'zayif');

const rakipAdi = (mac: Mac, uid: string) => mac.oyuncular[rakipUid(mac, uid)]?.ad ?? 'Rakip';

function VsCerceve({
  children,
  cik,
  mac,
  uid,
  kapanan = 0,
  baslik,
}: {
  children: ComponentChildren;
  cik: () => void;
  mac?: Mac;
  uid?: string;
  kapanan?: number;
  baslik?: string;
}) {
  return (
    <div class="test-ekrani">
      <header class="test-ust vs-ust">
        <button class="ikon-dugme" aria-label="Oyundan çık" onClick={cik}>
          <IkonCarpi />
        </button>
        {mac && uid ? (
          <div class="vs-skor" aria-label="Skor">
            <span class="vs-oyuncu ben">
              <small>Sen</small>
              <strong>{skor(mac, uid, kapanan)}</strong>
            </span>
            <span class="vs-ayrac">{baslik}</span>
            <span class="vs-oyuncu">
              <small>{rakipAdi(mac, uid)}</small>
              <strong>{skor(mac, rakipUid(mac, uid), kapanan)}</strong>
            </span>
          </div>
        ) : (
          <strong>VS düello</strong>
        )}
        <span class="vs-bosluk" />
      </header>
      {children}
    </div>
  );
}

function VsSonuc(p: { mac: Mac; uid: string; durum: MacDurumu; macId: string; oynanan: number; yeni: () => void }) {
  const { mac, uid, durum, macId, yeni } = p;
  // Sonuç ekranı açıkken zaman ilerlese de liste değişmesin.
  const [oynanan] = useState(p.oynanan);
  const rakip = rakipUid(mac, uid);
  const ben = skor(mac, uid);
  const o = skor(mac, rakip);
  const hukmen = durum.tip === 'rakip_cikti' || durum.tip === 'rakip_koptu';
  const sonuc = hukmen || ben > o ? 'galibiyet' : ben < o ? 'maglubiyet' : 'beraberlik';
  useEffect(() => istatistikKaydet(macId, sonuc), [macId]);
  const benimC = cevaplar(mac, uid);
  const onunC = cevaplar(mac, rakip);
  const ad = mac.oyuncular[rakip]?.ad ?? 'Rakip';

  return (
    <main class="sayfa">
      <section class={`kart vurgu vs-sonuc ${sonuc}`}>
        <p class="etiket-ust">{hukmen ? (durum.tip === 'rakip_cikti' ? `${ad} oyundan ayrıldı` : `${ad} bağlantısını kaybetti`) : 'Maç bitti'}</p>
        <h1>{sonuc === 'galibiyet' ? (hukmen ? 'Hükmen kazandın' : 'Kazandın!') : sonuc === 'maglubiyet' ? 'Kaybettin' : 'Berabere'}</h1>
        <div class="vs-sonuc-skor">
          <div>
            <small>Sen</small>
            <strong>{ben}</strong>
            <span class="soluk kucuk">{dogruSayisi(mac, uid)} doğru</span>
          </div>
          <span class="soluk">–</span>
          <div>
            <small>{ad}</small>
            <strong>{o}</strong>
            <span class="soluk kucuk">{dogruSayisi(mac, rakip)} doğru</span>
          </div>
        </div>
        <button class="dugme birincil genis" onClick={yeni}>
          Yeni rakip bul
        </button>
        <a class="dugme ikincil genis" href="#/">
          Ana sayfa
        </a>
      </section>

      {oynanan > 0 && (
        <section class="kart">
          <h2>Sorular</h2>
          <ol class="vs-soru-listesi">
            {mac.sorular.slice(0, oynanan).map((s, i) => {
              const bc = benimC.get(i);
              const oc = onunC.get(i);
              const isaret = (c: typeof bc) => (!c ? '–' : c.s === s.dogru ? '✓' : '✗');
              return (
                <li>
                  <details>
                    <summary>
                      <span class="vs-soru-kisa" lang="en">
                        {s.soru}
                      </span>
                      <span class="vs-isaretler">
                        <span class={durumSinifi(bc, s.dogru)} title="Sen">
                          {isaret(bc)}
                        </span>
                        <span class={durumSinifi(oc, s.dogru)} title={ad}>
                          {isaret(oc)}
                        </span>
                      </span>
                    </summary>
                    <p class="kucuk">
                      <strong>
                        Doğru cevap: {HARF[s.dogru]}) {s.secenekler[s.dogru]}
                      </strong>
                    </p>
                    <p class="soluk kucuk">{s.aciklama}</p>
                  </details>
                </li>
              );
            })}
          </ol>
          <p class="soluk kucuk">Satırdaki ilk işaret senin, ikincisi {ad} adlı rakibinin cevabı.</p>
        </section>
      )}
    </main>
  );
}
