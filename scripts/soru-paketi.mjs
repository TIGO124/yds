// Web derlemesinin yanına soru paketi yazar (Android uygulaması internet olunca buradan günceller).
// Çıktı: dist/soru-paketi-surum.json (küçük) ve dist/soru-paketi.json (tüm banka)
import { writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { bankaSurumu, bankayiOku } from './banka-surumu.mjs';

const kok = join(dirname(fileURLToPath(import.meta.url)), '..');
const banka = bankayiOku(kok);
const { surum, soruSayisi } = bankaSurumu(banka);
const tarih = Date.now();

writeFileSync(join(kok, 'dist', 'soru-paketi.json'), JSON.stringify({ surum, tarih, ...banka }));
writeFileSync(join(kok, 'dist', 'soru-paketi-surum.json'), JSON.stringify({ surum, tarih, soruSayisi }));
console.log(`Soru paketi yazıldı: ${soruSayisi} soru, sürüm ${surum}`);
