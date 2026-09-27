import { depo } from './depo';
import { tarihMetni } from './engine/program';
import { calismaGunleri, seriHesapla } from './engine/seri';
import type { Ayarlar } from './types';
import { programVerisi } from './ui/programVeri';

/**
 * Günlük çalışma hatırlatması (yalnızca Android uygulaması; web'de zamanlanmış bildirim yok).
 * Önümüzdeki 7 gün için tek seferlik bildirimler kurulur ve her açılışta yenilenir: o gün çalışıldıysa,
 * dinlenme ya da sınav günüyse bildirim gelmez. Uygulama 7 gün açılmazsa hatırlatmalar kendiliğinden biter.
 */
export const hatirlatmaVar = import.meta.env.MODE === 'android';

/** Test bitince ya da kelime kartı çalışılınca yayınlanır: bugünün hatırlatması iptal edilsin. */
export const CALISILDI = 'yds-calisildi';
export const calisildiBildir = () => window.dispatchEvent(new Event(CALISILDI));

const GUN_SAYISI = 7;
const ILK_ID = 1000;
const KANAL = 'hatirlatma';

/** Bildirim izni; ilk seferde Android izin penceresini açar. Verildiyse true. */
export async function hatirlatmaIzni(): Promise<boolean> {
  if (import.meta.env.MODE !== 'android') return false;
  const { LocalNotifications } = await import('@capacitor/local-notifications');
  let durum = (await LocalNotifications.checkPermissions()).display;
  if (durum === 'prompt' || durum === 'prompt-with-rationale') durum = (await LocalNotifications.requestPermissions()).display;
  return durum === 'granted';
}

/** Kurulu hatırlatmaları siler ve ayara göre yeniden kurar. */
export async function hatirlatmalariKur(ayar: Ayarlar, simdi = new Date()): Promise<void> {
  if (import.meta.env.MODE !== 'android') return;
  const { LocalNotifications } = await import('@capacitor/local-notifications');
  await LocalNotifications.cancel({ notifications: Array.from({ length: GUN_SAYISI }, (_, i) => ({ id: ILK_ID + i })) });
  if (!ayar.hatirlatma || (await LocalNotifications.checkPermissions()).display !== 'granted') return;

  const [saat, dakika] = ayar.hatirlatma.split(':').map(Number);
  const [cevaplar, gunluk, pv] = await Promise.all([depo.cevaplar(), depo.gunluk(), programVerisi(ayar, simdi)]);
  const seri = seriHesapla(calismaGunleri(cevaplar.map((c) => c.tarih), gunluk.map((g) => g.tarih)), simdi);
  const bosGunler = new Set(pv.program.gunler.filter((g) => g.dinlenme || g.etkinlikler.some((e) => e.tur === 'sinav')).map((g) => g.tarih));

  const bildirimler = [];
  for (let i = 0; i < GUN_SAYISI; i++) {
    const an = new Date(simdi.getFullYear(), simdi.getMonth(), simdi.getDate() + i, saat, dakika);
    if (an.getTime() <= simdi.getTime() + 60_000 || bosGunler.has(tarihMetni(an)) || (i === 0 && seri.bugun)) continue;
    // Seri o gün bozulacaksa ona değin: bugün (dünden süren seri) ya da yarın (bugün çalışıldıysa).
    const seriTehlikede = seri.guncel > 0 && ((i === 0 && !seri.bugun) || (i === 1 && seri.bugun));
    bildirimler.push({
      id: ILK_ID + i,
      channelId: KANAL,
      title: 'YDS Çalışma',
      body: seriTehlikede
        ? `${seri.guncel} günlük serini sürdürmek için kısa bir test ya da kelime tekrarı yeter.`
        : 'Bugünkü YDS çalışman seni bekliyor.',
      schedule: { at: an, allowWhileIdle: true },
      // Kesin saat için "Alarmlar ve hatırlatıcılar" izni istenmesin; birkaç dakikalık kayma sorun değil.
      isExactNotification: false,
    });
  }
  if (bildirimler.length === 0) return;
  // Android 8 öncesinde kanal yoktur, çağrı reddedilir; bildirim yine de kurulur.
  await LocalNotifications.createChannel({ id: KANAL, name: 'Çalışma hatırlatması', description: 'Günlük YDS çalışma hatırlatması', importance: 3 }).catch(
    () => undefined,
  );
  await LocalNotifications.schedule({ notifications: bildirimler });
}
