import { Capacitor, registerPlugin, type PluginListenerHandle } from '@capacitor/core';

/** Android kabuğundaki uygulamaya özel eklenti: android/app/src/main/java/app/yds/calisma/ApkGuncellemePlugin.java */
interface ApkGuncellemeEklentisi {
  /** APK'yı indirir, doğrular ve Android kurulum ekranını açar. */
  indirVeKur(secenek: { adres: string; surumKodu: number }): Promise<{ durum: 'kuruluyor' | 'izin_verilmedi' }>;
  /** İndirme yüzdesi; boyut bilinmiyorsa -1. */
  addListener(olay: 'ilerleme', dinleyici: (veri: { yuzde: number }) => void): Promise<PluginListenerHandle>;
}

export const ApkGuncelleme = registerPlugin<ApkGuncellemeEklentisi>('ApkGuncelleme');

/** 1.2.0 öncesi APK'larda eklenti yok; o zaman tarayıcıyla indirmeye düşülür. */
export const apkGuncellemeVar = () => Capacitor.isPluginAvailable('ApkGuncelleme');
