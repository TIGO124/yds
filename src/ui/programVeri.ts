import { KONULAR, SORULAR } from '../data/bank';
import { depo } from '../depo';
import { programOlustur, type CalismaProgrami, type ProgramNotu } from '../engine/program';
import { tekrarTakvimi } from '../engine/tekrar';
import type { Ayarlar } from '../types';

export interface ProgramVerisi {
  program: CalismaProgrami;
  /** Bugün tekrar sırası gelen soru sayısı */
  yanlisSayisi: number;
}

/** Güncel istatistiklerden bu haftanın programını hesaplar (bugünden başlayarak 7 gün). */
export async function programVerisi(ayar: Ayarlar, bugun = new Date()): Promise<ProgramVerisi> {
  const plan = await depo.planGaranti();
  const [testler, cevaplar, tekrar] = await Promise.all([depo.testler(), depo.cevaplar(), depo.tekrarListesi()]);
  const cozulmus = new Set(cevaplar.map((c) => c.soru_id));
  const teshisBiten = testler.filter((t) => t.tip === 'teshis' && t.durum === 'bitti').length;
  const sonDeneme = testler.filter((t) => t.tip === 'deneme' && t.durum === 'bitti').pop();
  const sonDenemeGunOnce = sonDeneme ? Math.floor((bugun.getTime() - (sonDeneme.bitis ?? sonDeneme.baslangic)) / 86_400_000) : null;
  const program = programOlustur({
    konular: KONULAR,
    cevaplar,
    yanlisSayisi: tekrar.sirada.length,
    tekrarTakvimi: tekrarTakvimi(tekrar.hepsi, bugun),
    kalanYeniSoru: SORULAR.filter((s) => !cozulmus.has(s.id)).length,
    teshisKalan: Math.max(0, plan.length - teshisBiten),
    bugun,
    gunlukDakika: ayar.gunluk_dakika,
    haftalikGun: ayar.haftalik_gun,
    sinavTarihi: ayar.sinav_tarihi,
    sonDenemeGunOnce,
  });
  return { program, yanlisSayisi: tekrar.sirada.length };
}

export function notMetni(n: ProgramNotu, yanlisSayisi: number): string {
  switch (n) {
    case 'teshis':
      return 'Teşhis testlerin bitince program zayıf konularına göre kişiselleşir. Şimdilik konular sınav ağırlığına göre dağıtıldı.';
    case 'son_hafta':
      return 'Sınava bir haftadan az kaldı: daha çok test çöz, yeni konulara girmek yerine bildiklerini pekiştir.';
    case 'sinav_yarin':
      return 'Sınav yarın! Bugün yalnızca hafif tekrar yap ve erken uyu.';
    case 'tekrar':
      return `Bugün tekrar sırası gelen ${yanlisSayisi} soru var. Yanlışlar 1, 3 ve 7 gün arayla yeniden gelir; kalıcı öğrenmenin yolu bu.`;
    case 'soru_az':
      return 'Yeni soru azaldı; bitince testler en uzun süredir görmediğin sorulardan oluşacak.';
    case 'soru_bitti':
      return 'Tüm yeni soruları çözdün! Testler artık en uzun süredir görmediğin sorulardan geliyor.';
    case 'deneme':
      return 'Bu hafta ana sayfadan 180 dakikalık bir deneme sınavı çöz; gerçek sınavın temposuna alışırsın ve tahmini YDS puanını görürsün.';
    case 'sinav_gecti':
      return 'Girdiğin sınav tarihi geçmiş; yeni bir tarih ekleyebilirsin.';
  }
}

const bicim = new Intl.DateTimeFormat('tr-TR', { day: 'numeric', month: 'long', weekday: 'long' });

export function gunBasligi(tarih: string): string {
  const [y, a, g] = tarih.split('-').map(Number);
  return bicim.format(new Date(y, a - 1, g));
}

export function sureMetni(dakika: number): string {
  const s = Math.floor(dakika / 60);
  const d = dakika % 60;
  return s === 0 ? `${d} dk` : d === 0 ? `${s} sa` : `${s} sa ${d} dk`;
}
