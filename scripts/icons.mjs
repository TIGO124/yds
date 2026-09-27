// Uygulama ikonlarını harici araç kullanmadan üretir: npm run icons
// Mor zemin üzerinde beyaz onay işareti (maskable güvenli alan içinde).
import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

const ZEMIN = [0x6d, 0x28, 0xd9];
const ON = [0xff, 0xff, 0xff];
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

/** seffaf: yalnızca beyaz işaret, zemin saydam (RGBA); olcek: işaret boyutu */
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
        satirlar.fill(255, p, p + 3);
        satirlar[p + 3] = Math.round(a * 255);
      } else {
        for (let c = 0; c < 3; c++) satirlar[p + c] = Math.round(ZEMIN[c] * (1 - a) + ON[c] * a);
      }
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(n, 0);
  ihdr.writeUInt32BE(n, 4);
  ihdr[8] = 8; // bit derinliği
  ihdr[9] = seffaf ? 6 : 2; // RGBA / RGB
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    parca('IHDR', ihdr),
    parca('IDAT', deflateSync(satirlar, { level: 9 })),
    parca('IEND', Buffer.alloc(0)),
  ]);
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
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" rx="22" fill="#6d28d9"/><polyline points="${nokta}" fill="none" stroke="#fff" stroke-width="${KALINLIK * 100}" stroke-linecap="round" stroke-linejoin="round"/></svg>\n`,
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
    <color name="ic_launcher_background">#6D28D9</color>
</resources>
`,
  );
  console.log('Android başlatıcı ikonları yazıldı.');
}
