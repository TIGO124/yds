import type { ComponentChildren } from 'preact';
import { useCallback, useEffect, useState } from 'preact/hooks';
import { soruParagrafi } from '../data/bank';
import type { Seviye } from '../engine/mastery';
import type { Soru } from '../types';
import { git } from './router';
import { IkonAyar, IkonEv, IkonGeri, IkonGrafik, IkonTakvim, IkonTekrar } from './ikonlar';
import { GuncellemeBandi } from './guncellemeBandi';

/** Asenkron veri yükleme; yenile() ile tekrar yükler. */
export function useVeri<T>(yukle: () => Promise<T>, bagimliliklar: unknown[] = []) {
  const [veri, setVeri] = useState<T | null>(null);
  const [hata, setHata] = useState<string | null>(null);
  const yenile = useCallback(() => {
    yukle()
      .then((v) => {
        setVeri(v);
        setHata(null);
      })
      .catch((e: unknown) => setHata(e instanceof Error ? e.message : String(e)));
  }, bagimliliklar);
  useEffect(yenile, [yenile]);
  return { veri, hata, yenile };
}

export function Ust({ baslik, geri }: { baslik: string; geri?: string }) {
  return (
    <header class="ust">
      {geri !== undefined && (
        <button class="ikon-dugme" aria-label="Geri" onClick={() => (geri ? git(geri) : history.back())}>
          <IkonGeri />
        </button>
      )}
      <h1>{baslik}</h1>
    </header>
  );
}

const MENU = [
  { yol: '', ad: 'Ana sayfa', Ikon: IkonEv },
  { yol: 'program', ad: 'Program', Ikon: IkonTakvim },
  { yol: 'ilerleme', ad: 'İlerleme', Ikon: IkonGrafik },
  { yol: 'yanlislar', ad: 'Yanlışlar', Ikon: IkonTekrar },
  { yol: 'ayarlar', ad: 'Ayarlar', Ikon: IkonAyar },
];

export function AltMenu({ aktif }: { aktif: string }) {
  return (
    <nav class="alt-menu" aria-label="Ana menü">
      {MENU.map(({ yol, ad, Ikon }) => (
        <a href={`#/${yol}`} class={aktif === yol ? 'aktif' : ''} aria-current={aktif === yol ? 'page' : undefined}>
          <Ikon />
          <span>{ad}</span>
        </a>
      ))}
    </nav>
  );
}

export function Sayfa({ children, menu }: { children: ComponentChildren; menu?: string }) {
  return (
    <>
      <main class={menu !== undefined ? 'sayfa menulu' : 'sayfa'}>
        {/* Test sırasında dikkat dağıtmasın: yalnızca alt menülü sayfalarda göster. */}
        {menu !== undefined && <GuncellemeBandi />}
        {children}
      </main>
      {menu !== undefined && <AltMenu aktif={menu} />}
    </>
  );
}

/** ton: başarı çubuklarında iyi/orta/zayıf (yüzdeden seçilir); 'notr' başarı olmayan oranlar için. */
export function Cubuk({ yuzde, ton }: { yuzde: number; ton?: 'iyi' | 'orta' | 'zayif' | 'notr' }) {
  const t = ton ?? (yuzde < 50 ? 'zayif' : yuzde <= 75 ? 'orta' : 'iyi');
  return (
    <div class="cubuk" role="progressbar" aria-valuenow={yuzde} aria-valuemin={0} aria-valuemax={100}>
      <div class={`dolgu ${t}`} style={{ width: `${Math.max(0, Math.min(100, yuzde))}%` }} />
    </div>
  );
}

/** Parçalı ilerleme: her adım (ör. teşhis testi) bir parça; sıradaki adım vurgulu. */
export function Adimlar({ toplam, biten, etiket }: { toplam: number; biten: number; etiket: string }) {
  return (
    <div class="adimlar" role="progressbar" aria-label={etiket} aria-valuenow={biten} aria-valuemin={0} aria-valuemax={toplam}>
      {Array.from({ length: toplam }, (_, i) => (
        <span class={i < biten ? 'bitti' : i === biten ? 'simdiki' : ''} />
      ))}
    </div>
  );
}

const SEVIYE_AD: Record<Seviye, string> = {
  zayif: 'Zayıf',
  gelisiyor: 'Gelişmekte',
  iyi: 'İyi',
  yetersiz: 'Yetersiz veri',
};

export function SeviyeRozeti({ seviye }: { seviye: Seviye }) {
  return <span class={`rozet ${seviye}`}>{SEVIYE_AD[seviye]}</span>;
}

export function Yukleniyor({ hata }: { hata?: string | null }) {
  return (
    <main class="sayfa">
      <p class={hata ? 'hata-kutu' : 'soluk'} role={hata ? 'alert' : 'status'}>
        {hata ?? 'Yükleniyor…'}
      </p>
    </main>
  );
}

export const TIP_AD = {
  teshis: 'Teşhis testi',
  uyarlanmis: 'Uyarlanmış test',
  kontrol: 'Kontrol testi',
  tekrar: 'Tekrar testi',
  deneme: 'Deneme sınavı',
} as const;

export const HARF = 'ABCDE';

/** Boşluk işaretleri ("----", "(2) ----") satır sonunda bölünmesin. */
export function BoslukluMetin({ metin }: { metin: string }) {
  return (
    <>
      {metin.split(/(\(\d+\) ?-{3,}|-{3,})/).map((p, i) => (i % 2 ? <span class="bosluk-isareti">{p}</span> : p))}
    </>
  );
}

/** Ortak parça; cloze gruplarında sorulan boşluk ("(3) ----") vurgulanır. */
export function ParagrafMetni({ soru, kucuk }: { soru: Soru; kucuk?: boolean }) {
  const metin = soruParagrafi(soru);
  if (!metin) return null;
  const no = /\((\d+)\)/.exec(soru.soru)?.[1];
  const isaret = no ? `(${no}) ----` : null;
  const parcalar = isaret && metin.includes(isaret) ? metin.split(isaret) : null;
  return (
    <p class={`soru-metni paragraf-metni${kucuk ? ' kucuk-soru' : ''}`} lang="en">
      {parcalar ? (
        <>
          <BoslukluMetin metin={parcalar[0]} />
          <mark class="bosluk">{isaret}</mark>
          <BoslukluMetin metin={parcalar.slice(1).join(isaret!)} />
        </>
      ) : (
        <BoslukluMetin metin={metin} />
      )}
    </p>
  );
}
