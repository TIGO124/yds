import type { Konu } from '../types';
import { CONFIG } from './config';
import { konuAgirliklari, konuDurumlari, type CevapOzeti } from './mastery';

/** Haftalık ders programı: istatistiklerden (konu eksikliği, yanlışlar, teşhis durumu) üretilir. */
export interface ProgramGirdisi {
  konular: readonly Konu[];
  /** Kronolojik cevaplar */
  cevaplar: readonly CevapOzeti[];
  yanlisSayisi: number;
  kalanYeniSoru: number;
  teshisKalan: number;
  bugun: Date;
  gunlukDakika: number;
  haftalikGun: number;
  /** YYYY-AA-GG */
  sinavTarihi: string | null;
}

export type Etkinlik =
  | { tur: 'test'; dakika: number; adet: number; teshis: boolean }
  | { tur: 'tekrar'; dakika: number }
  | { tur: 'konu'; dakika: number; konu: string }
  | { tur: 'sinav' };

export interface ProgramGunu {
  tarih: string;
  /** 0 = pazar … 6 = cumartesi */
  haftaGunu: number;
  dinlenme: boolean;
  etkinlikler: Etkinlik[];
}

export interface OdakKonu {
  konu: string;
  eksiklikYuzde: number;
  deneme: number;
  blok: number;
}

export type Asama = 'teshis' | 'normal' | 'son_hafta';
export type ProgramNotu = 'teshis' | 'tekrar' | 'soru_az' | 'soru_bitti' | 'sinav_gecti' | 'son_hafta' | 'sinav_yarin';

export interface CalismaProgrami {
  asama: Asama;
  sinavaKalanGun: number | null;
  gunler: ProgramGunu[];
  odak: OdakKonu[];
  haftalikDakika: number;
  notlar: ProgramNotu[];
}

/** Dinlenme günü seçim önceliği: pazar, çarşamba, cumartesi, cuma, salı, perşembe, pazartesi */
const DINLENME_ONCELIGI = [0, 3, 6, 5, 2, 4, 1];

const iki = (n: number) => String(n).padStart(2, '0');
export const tarihMetni = (d: Date) => `${d.getFullYear()}-${iki(d.getMonth() + 1)}-${iki(d.getDate())}`;

function gunFarki(bugun: Date, hedef: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(hedef);
  if (!m) return null;
  const h = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  const b = new Date(bugun.getFullYear(), bugun.getMonth(), bugun.getDate());
  return Math.round((h.getTime() - b.getTime()) / 86_400_000);
}

/** Pürüzsüz ağırlıklı sıralama: ağır konular daha sık, ama art arda yığılmadan gelir. */
function agirlikliSira(konular: readonly string[], agirlik: (k: string) => number, adet: number): string[] {
  const guncel = new Map(konular.map((k) => [k, 0]));
  const toplam = konular.reduce((t, k) => t + agirlik(k), 0);
  const sira: string[] = [];
  for (let i = 0; i < adet && konular.length > 0; i++) {
    let enIyi = konular[0];
    for (const k of konular) {
      guncel.set(k, guncel.get(k)! + agirlik(k));
      if (guncel.get(k)! > guncel.get(enIyi)!) enIyi = k;
    }
    guncel.set(enIyi, guncel.get(enIyi)! - toplam);
    sira.push(enIyi);
  }
  return sira;
}

/** Kalan süreyi konu bloklarına böler (son blok artanı alır). */
function bloklar(dakika: number): number[] {
  const sonuc: number[] = [];
  let kalan = dakika;
  while (kalan >= CONFIG.PROGRAM_MIN_BLOK) {
    const blok = kalan >= CONFIG.PROGRAM_KONU_BLOK + CONFIG.PROGRAM_MIN_BLOK ? CONFIG.PROGRAM_KONU_BLOK : kalan;
    sonuc.push(blok);
    kalan -= blok;
  }
  return sonuc;
}

export function programOlustur(g: ProgramGirdisi): CalismaProgrami {
  const T = Math.max(CONFIG.PROGRAM_TEST_DAKIKA, Math.round(g.gunlukDakika));
  const calismaGunu = Math.min(7, Math.max(1, Math.round(g.haftalikGun)));
  const dinlenmeGunleri = new Set(DINLENME_ONCELIGI.slice(0, 7 - calismaGunu));
  const notlar: ProgramNotu[] = [];

  let sinavaKalanGun = g.sinavTarihi ? gunFarki(g.bugun, g.sinavTarihi) : null;
  if (sinavaKalanGun !== null && sinavaKalanGun < 0) {
    notlar.push('sinav_gecti');
    sinavaKalanGun = null;
  }

  const asama: Asama =
    g.teshisKalan > 0 ? 'teshis' : sinavaKalanGun !== null && sinavaKalanGun <= CONFIG.PROGRAM_SON_HAFTA ? 'son_hafta' : 'normal';
  if (asama === 'teshis') notlar.push('teshis');
  if (asama === 'son_hafta') notlar.push('son_hafta');
  if (sinavaKalanGun === 1) notlar.push('sinav_yarin');
  if (g.yanlisSayisi > 0) notlar.push('tekrar');
  if (g.kalanYeniSoru === 0) notlar.push('soru_bitti');
  else if (g.kalanYeniSoru < 100) notlar.push('soru_az');

  // 1. geçiş: günlerin iskeleti (testler, tekrarlar, konu blok süreleri)
  let teshisKalan = g.teshisKalan;
  let yeniTestKalan = Math.ceil(g.kalanYeniSoru / CONFIG.TEST_BOYUTU);
  let calismaSirasi = 0;
  const iskelet: { gun: ProgramGunu; konuBloklari: number[] }[] = [];

  for (let i = 0; i < 7; i++) {
    const d = new Date(g.bugun.getFullYear(), g.bugun.getMonth(), g.bugun.getDate() + i);
    const gun: ProgramGunu = { tarih: tarihMetni(d), haftaGunu: d.getDay(), dinlenme: false, etkinlikler: [] };
    iskelet.push({ gun, konuBloklari: [] });

    if (sinavaKalanGun !== null && i === sinavaKalanGun) {
      gun.etkinlikler.push({ tur: 'sinav' });
      continue;
    }
    if ((sinavaKalanGun !== null && i > sinavaKalanGun) || dinlenmeGunleri.has(gun.haftaGunu)) {
      gun.dinlenme = true;
      continue;
    }

    let kalan = T;
    const sinavArifesi = sinavaKalanGun !== null && i === sinavaKalanGun - 1;

    // Testler
    if (!sinavArifesi) {
      const pay = teshisKalan > 0 || asama === 'son_hafta' ? 0.7 : CONFIG.PROGRAM_TEST_PAYI;
      let adet = Math.max(1, Math.floor((T * pay) / CONFIG.PROGRAM_TEST_DAKIKA));
      adet = Math.min(adet, Math.floor(kalan / CONFIG.PROGRAM_TEST_DAKIKA), yeniTestKalan);
      const teshisAdet = Math.min(adet, teshisKalan);
      if (teshisAdet > 0) {
        gun.etkinlikler.push({ tur: 'test', adet: teshisAdet, teshis: true, dakika: teshisAdet * CONFIG.PROGRAM_TEST_DAKIKA });
        teshisKalan -= teshisAdet;
      }
      const uyarlanmisAdet = adet - teshisAdet;
      if (uyarlanmisAdet > 0) {
        gun.etkinlikler.push({ tur: 'test', adet: uyarlanmisAdet, teshis: false, dakika: uyarlanmisAdet * CONFIG.PROGRAM_TEST_DAKIKA });
      }
      yeniTestKalan -= adet;
      kalan -= adet * CONFIG.PROGRAM_TEST_DAKIKA;
    }

    // Yanlış tekrarı: çok yanlış varsa her gün, yoksa gün aşırı; sınav arifesinde mutlaka
    const tekrarGunu = g.yanlisSayisi >= 20 || calismaSirasi % 2 === 0 || sinavArifesi;
    if (g.yanlisSayisi > 0 && tekrarGunu && kalan >= CONFIG.PROGRAM_TEKRAR_DAKIKA) {
      gun.etkinlikler.push({ tur: 'tekrar', dakika: CONFIG.PROGRAM_TEKRAR_DAKIKA });
      kalan -= CONFIG.PROGRAM_TEKRAR_DAKIKA;
    }

    // Sınav arifesi hafif geçer: en fazla bir konu tekrarı
    iskelet[i].konuBloklari = sinavArifesi ? bloklar(Math.min(kalan, CONFIG.PROGRAM_KONU_BLOK)) : bloklar(kalan);
    calismaSirasi++;
  }

  // 2. geçiş: konu bloklarını eksiklik ağırlığına göre dağıt
  const durumlar = konuDurumlari(g.konular, g.cevaplar);
  const agirliklar = konuAgirliklari(g.konular, durumlar);
  const toplamBlok = iskelet.reduce((t, x) => t + x.konuBloklari.length, 0);
  const agirlikSirasi = [...g.konular]
    .sort((a, b) => agirliklar.get(b.kod)! - agirliklar.get(a.kod)!)
    .map((k) => k.kod);
  const secilenler = agirlikSirasi.slice(0, Math.max(1, Math.min(CONFIG.PROGRAM_ODAK_KONU, toplamBlok)));
  const sira = agirlikliSira(secilenler, (k) => agirliklar.get(k)!, toplamBlok);

  for (const { gun, konuBloklari } of iskelet) {
    const bugunkuler = new Set<string>();
    for (const dakika of konuBloklari) {
      // Aynı gün aynı konu iki kez gelmesin: sıradaki farklı konuyu öne al;
      // sırada farklı konu kalmadıysa ağırlık sırasındaki ilk farklı konuyu seç.
      const j = sira.findIndex((k) => !bugunkuler.has(k));
      let konu: string;
      if (j >= 0) [konu] = sira.splice(j, 1);
      else {
        sira.shift();
        konu = agirlikSirasi.find((k) => !bugunkuler.has(k)) ?? agirlikSirasi[0];
      }
      bugunkuler.add(konu);
      gun.etkinlikler.push({ tur: 'konu', konu, dakika });
    }
  }

  const blokSayisi = new Map<string, number>();
  let haftalikDakika = 0;
  for (const { gun } of iskelet) {
    for (const e of gun.etkinlikler) {
      if (e.tur === 'konu') blokSayisi.set(e.konu, (blokSayisi.get(e.konu) ?? 0) + 1);
      if (e.tur !== 'sinav') haftalikDakika += e.dakika;
    }
  }

  const odak = [...blokSayisi]
    .map(([konu, blok]) => {
      const d = durumlar.get(konu)!;
      return { konu, blok, deneme: d.deneme, eksiklikYuzde: Math.round(d.eksiklik * 100) };
    })
    .sort((a, b) => b.blok - a.blok || b.eksiklikYuzde - a.eksiklikYuzde);

  return { asama, sinavaKalanGun, gunler: iskelet.map((x) => x.gun), odak, haftalikDakika, notlar };
}
