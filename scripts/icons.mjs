// Uygulama ikonlarını ve Android açılış görsellerini harici araç kullanmadan üretir: npm run icons
// Lacivert (mürekkep) zemin üzerinde kâğıt renginde onay işareti (maskable güvenli alan içinde).
import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

const ZEMIN = [0x1f, 0x3a, 0x5f];
const ON = [0xf4, 0xf1, 0xea];
const hex = (r) => `#${r.map((c) => c.toString(16).padStart(2, '0')).join('')}`;
// Onay işareti (0–1 koordinatlarında) ve kalınlık
const CIZGI = [
  [0.3, 0.52],
  [0.44, 0.66],
  [0.72, 0.36],
];
const KALINLIK = 0.085;

function parcaUzaklik(px, py, [ax, ay], [bx, by]) {
  const dx = bx - ax;
  const dy = by - ay;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

function kapsama(x, y, n, olcek = 1) {
  const ORNEK = 4;
  let ic = 0;
  for (let i = 0; i < ORNEK; i++) {
    for (let j = 0; j < ORNEK; j++) {
      // olcek < 1: şekil merkeze doğru küçülür (Android uyarlanabilir ikon güvenli alanı için)
      const px = 0.5 + ((x + (i + 0.5) / ORNEK) / n - 0.5) / olcek;
      const py = 0.5 + ((y + (j + 0.5) / ORNEK) / n - 0.5) / olcek;
      const d = Math.min(parcaUzaklik(px, py, CIZGI[0], CIZGI[1]), parcaUzaklik(px, py, CIZGI[1], CIZGI[2]));
      if (d <= KALINLIK / 2) ic++;
    }
  }
  return ic / (ORNEK * ORNEK);
}

const crcTablo = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (const b of buf) c = crcTablo[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
function parca(tur, veri) {
  const uzunluk = Buffer.alloc(4);
  uzunluk.writeUInt32BE(veri.length);
  const tv = Buffer.concat([Buffer.from(tur), veri]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(tv));
  return Buffer.concat([uzunluk, tv, crc]);
}

/** satirlar: her satırın başında filtre baytı (0) olan ham piksel verisi; rgba: saydamlık kanalı var mı */
function pngKodla(genislik, yukseklik, rgba, satirlar) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(genislik, 0);
  ihdr.writeUInt32BE(yukseklik, 4);
  ihdr[8] = 8; // bit derinliği
  ihdr[9] = rgba ? 6 : 2; // RGBA / RGB
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    parca('IHDR', ihdr),
    parca('IDAT', deflateSync(satirlar, { level: 9 })),
    parca('IEND', Buffer.alloc(0)),
  ]);
}

/** seffaf: yalnızca işaret, zemin saydam (RGBA); olcek: işaret boyutu */
function png(n, seffaf = false, olcek = 1) {
  const kanal = seffaf ? 4 : 3;
  const satirlar = Buffer.alloc(n * (n * kanal + 1));
  for (let y = 0; y < n; y++) {
    const o = y * (n * kanal + 1);
    satirlar[o] = 0;
    for (let x = 0; x < n; x++) {
      const a = kapsama(x, y, n, olcek);
      const p = o + 1 + x * kanal;
      if (seffaf) {
        for (let c = 0; c < 3; c++) satirlar[p + c] = ON[c];
        satirlar[p + 3] = Math.round(a * 255);
      } else {
        for (let c = 0; c < 3; c++) satirlar[p + c] = Math.round(ZEMIN[c] * (1 - a) + ON[c] * a);
      }
    }
  }
  return pngKodla(n, n, seffaf, satirlar);
}

// Açılış ekranı: kâğıt zemin ortasında köşeleri yuvarlatılmış uygulama ikonu.
const KAGIT = [0xf4, 0xf1, 0xea];
const KOSE = 0.22; // SVG'deki rx="22" ile aynı

/** (u, v) 0–1 koordinatındaki nokta yuvarlatılmış karenin içinde mi? */
function kutuIcinde(u, v) {
  const dx = Math.max(KOSE - u, 0, u - (1 - KOSE));
  const dy = Math.max(KOSE - v, 0, v - (1 - KOSE));
  return dx * dx + dy * dy <= KOSE * KOSE && u >= 0 && u <= 1 && v >= 0 && v <= 1;
}

function kutuKapsama(x, y, n) {
  const ORNEK = 4;
  let ic = 0;
  for (let i = 0; i < ORNEK; i++) {
    for (let j = 0; j < ORNEK; j++) {
      if (kutuIcinde((x + (i + 0.5) / ORNEK) / n, (y + (j + 0.5) / ORNEK) / n)) ic++;
    }
  }
  return ic / (ORNEK * ORNEK);
}

function acilisPng(genislik, yukseklik) {
  const s = Math.round(Math.min(genislik, yukseklik) * 0.28);
  const x0 = Math.round((genislik - s) / 2);
  const y0 = Math.round((yukseklik - s) / 2);
  const satirlar = Buffer.alloc(yukseklik * (genislik * 3 + 1));
  for (let y = 0; y < yukseklik; y++) {
    const o = y * (genislik * 3 + 1);
    for (let x = 0; x < genislik; x++) {
      const p = o + 1 + x * 3;
      let renk = KAGIT;
      if (x >= x0 && x < x0 + s && y >= y0 && y < y0 + s) {
        const kutu = kutuKapsama(x - x0, y - y0, s);
        const isaret = kapsama(x - x0, y - y0, s);
        renk = KAGIT.map((k, c) => {
          const ikon = ZEMIN[c] * (1 - isaret) + ON[c] * isaret;
          return k * (1 - kutu) + ikon * kutu;
        });
      }
      for (let c = 0; c < 3; c++) satirlar[p + c] = Math.round(renk[c]);
    }
  }
  return pngKodla(genislik, yukseklik, false, satirlar);
}

mkdirSync('public', { recursive: true });
for (const [ad, n] of [
  ['icon-192.png', 192],
  ['icon-512.png', 512],
  ['apple-touch-icon.png', 180],
]) {
  writeFileSync(`public/${ad}`, png(n));
}
const nokta = CIZGI.map(([x, y]) => `${x * 100},${y * 100}`).join(' ');
writeFileSync(
  'public/icon.svg',
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" rx="22" fill="${hex(ZEMIN)}"/><polyline points="${nokta}" fill="none" stroke="${hex(ON)}" stroke-width="${KALINLIK * 100}" stroke-linecap="round" stroke-linejoin="round"/></svg>\n`,
);
console.log('İkonlar public/ klasörüne yazıldı.');

// Capacitor Android projesi varsa başlatıcı ikonlarını da üret.
const res = 'android/app/src/main/res';
if (existsSync(res)) {
  const yogunluk = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 };
  for (const [ad, k] of Object.entries(yogunluk)) {
    const dizin = `${res}/mipmap-${ad}`;
    mkdirSync(dizin, { recursive: true });
    writeFileSync(`${dizin}/ic_launcher.png`, png(Math.round(48 * k)));
    writeFileSync(`${dizin}/ic_launcher_round.png`, png(Math.round(48 * k)));
    writeFileSync(`${dizin}/ic_launcher_foreground.png`, png(Math.round(108 * k), true, 0.8));
  }
  writeFileSync(
    `${res}/values/ic_launcher_background.xml`,
    `<?xml version="1.0" encoding="utf-8"?>
<resources>
    <color name="ic_launcher_background">${hex(ZEMIN).toUpperCase()}</color>
</resources>
`,
  );
  console.log('Android başlatıcı ikonları yazıldı.');

  // Açılış görselleri (Capacitor'ın varsayılan logosu yerine)
  const acilis = { mdpi: [320, 480], hdpi: [480, 800], xhdpi: [720, 1280], xxhdpi: [960, 1600], xxxhdpi: [1280, 1920] };
  writeFileSync(`${res}/drawable/splash.png`, acilisPng(480, 320));
  for (const [ad, [g, y]] of Object.entries(acilis)) {
    for (const [yon, en, boy] of [
      ['port', g, y],
      ['land', y, g],
    ]) {
      const dizin = `${res}/drawable-${yon}-${ad}`;
      mkdirSync(dizin, { recursive: true });
      writeFileSync(`${dizin}/splash.png`, acilisPng(en, boy));
    }
  }
  console.log('Android açılış görselleri yazıldı.');
}
