// Web derlemesinin yanına Android sürüm bilgisini ve APK'yı koyar.
// Android uygulaması açılışta dist/surum.json'a bakar; sürüm daha yeniyse APK'yı indirmeyi önerir.
// APK ve sürümü `npm run surum` ile indir/ klasörüne yazılır (bkz. surum-yayinla.mjs).
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const kok = join(dirname(fileURLToPath(import.meta.url)), '..');
const apk = join(kok, 'indir', 'YDS-Calisma.apk');
const apkBilgi = join(kok, 'indir', 'apk.json');

let bilgi = { surum: JSON.parse(readFileSync(join(kok, 'package.json'), 'utf8')).version, apk: null, notlar: [] };
if (existsSync(apk) && existsSync(apkBilgi)) {
  const { surum, notlar } = JSON.parse(readFileSync(apkBilgi, 'utf8'));
  mkdirSync(join(kok, 'dist', 'indir'), { recursive: true });
  copyFileSync(apk, join(kok, 'dist', 'indir', 'YDS-Calisma.apk'));
  bilgi = { surum, apk: 'indir/YDS-Calisma.apk', notlar: notlar ?? [] };
}

writeFileSync(join(kok, 'dist', 'surum.json'), JSON.stringify({ ...bilgi, tarih: Date.now() }));
console.log(`Sürüm bilgisi yazıldı: ${bilgi.surum}${bilgi.apk ? ' (APK ile)' : ' (APK yok)'}`);
