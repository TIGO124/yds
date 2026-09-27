// dist-artifact/ çıktısını tek bir HTML dosyasına gömer (claude.ai Artifact olarak yayın için).
// Çıktı: dist-artifact/yds.html
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const kok = 'dist-artifact';
const kaynak = readFileSync(join(kok, 'index.html'), 'utf8');
const oku = (yol) => readFileSync(join(kok, yol.replace(/^\.\//, '')), 'utf8');

// Artifact iskeleti doctype/html/head/body ile charset ve viewport'u kendisi ekler: yalnızca içerik kalsın.
// Bölme, betikler gömülmeden önce yapılır (betik içindeki "<body>" gibi metinler karışmasın).
let bas = kaynak.match(/<head>([\s\S]*?)<\/head>/)[1];
const govde = kaynak.match(/<body>([\s\S]*?)<\/body>/)[1].trim();
// <title> ilk 8 KB içinde olmalı: en başa alınır.
const baslik = bas.match(/<title>[\s\S]*?<\/title>/)[0];
bas = bas
  .replace(baslik, '')
  .replace(/<meta charset[^>]*>\s*/, '')
  .replace(/<meta name="viewport"[^>]*>\s*/, '')
  .replace(/<link rel="apple-touch-icon"[^>]*>\s*/, '')
  .replace(/<link rel="modulepreload"[^>]*>\s*/g, '');

// İkon: svg veri adresi olarak
const svg = readFileSync(join(kok, 'icon.svg'), 'utf8');
bas = bas.replace(/<link rel="icon"[^>]*>/, `<link rel="icon" type="image/svg+xml" href="data:image/svg+xml,${encodeURIComponent(svg)}" />`);
// Stil dosyaları
bas = bas.replace(/<link rel="stylesheet"[^>]*href="([^"]+)"[^>]*>/g, (_, yol) => `<style>${oku(yol)}</style>`);
// Betikler #app'ten sonra: </script dizisi satır içi betiği erken kapatmasın
const betikler = [];
bas = bas.replace(/<script type="module"[^>]*src="([^"]+)"[^>]*><\/script>\s*/g, (_, yol) => {
  betikler.push(`<script type="module">${oku(yol).replace(/<\/script/gi, '<\\/script')}</script>`);
  return '';
});

const html = `${baslik}\n${bas.trim()}\n${govde}\n${betikler.join('\n')}\n`;
if (/(src|href)="\.\/assets/.test(html)) throw new Error('Gömülmemiş dosya başvurusu kaldı');
writeFileSync(join(kok, 'yds.html'), html);
console.log(`dist-artifact/yds.html yazıldı (${(Buffer.byteLength(html) / 1024).toFixed(0)} KB)`);
