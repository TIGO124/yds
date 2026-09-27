import { KONULAR, SORULAR } from '../data/bank';
import { depo } from '../depo';
import { programOlustur, type CalismaProgrami, type ProgramNotu } from '../engine/program';
import type { Ayarlar } from '../types';

export interface ProgramVerisi {
  program: CalismaProgrami;
  yanlisSayisi: number;
}

/** Güncel istatistiklerden bu haftanın programını hesaplar (bugünden başlayarak 7 gün). */
export async function programVerisi(ayar: Ayarlar, bugun = new Date()): Promise<ProgramVerisi> {
  const plan = await depo.planGaranti();
  const [testler, cevaplar, yanlislar] = await Promise.all([depo.testler(), depo.cevaplar(), depo.yanlislar()]);
  const cozulmus = new Set(cevaplar.map((c) => c.soru_id));
  const teshisBiten = testler.filter((t) => t.tip === 'teshis' && t.durum === 'bitti').length;
  const program = programOlustur({
    konular: KONULAR,
    cevaplar,
    yanlisSayisi: yanlislar.length,
    kalanYeniSoru: SORULAR.filter((s) => !cozulmus.has(s.id)).length,
    teshisKalan: Math.max(0, plan.length - teshisBiten),
    bugun,
    gunlukDakika: ayar.gunluk_dakika,
    haftalikGun: ayar.haftalik_gun,
    sinavTarihi: ayar.sinav_tarihi,
  });
  return { program, yanlisSayisi: yanlislar.length };
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
      return `${yanlisSayisi} yanlış/boş sorun var; tekrar oturumlarında bunları yeniden çöz.`;
    case 'soru_az':
      return 'Yeni soru azaldı; yanlışlarını tekrar etmeye ağırlık ver.';
    case 'soru_bitti':
      return 'Tüm yeni soruları çözdün! Programda test yerine tekrar ve konu çalışması var.';
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
