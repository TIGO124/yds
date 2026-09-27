// Soru bankasının içerik sürümü: satır sonlarından bağımsız (JSON ayrıştırılıp yeniden yazılır),
// böylece Windows'ta ve GitHub Actions'ta (Linux) aynı içerik aynı sürümü verir.
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

export function bankayiOku(kok) {
  const veri = join(kok, 'src', 'data');
  const oku = (yol) => JSON.parse(readFileSync(yol, 'utf8'));
  const dosyalar = readdirSync(join(veri, 'sorular')).filter((f) => f.endsWith('.json')).sort();
  return {
    taksonomi: oku(join(veri, 'konular.json')),
    paragraflar: oku(join(veri, 'paragraflar.json')),
    sorular: dosyalar.flatMap((f) => oku(join(veri, 'sorular', f))),
  };
}

export function bankaSurumu(banka) {
  const ozet = createHash('sha256').update(JSON.stringify(banka)).digest('hex').slice(0, 16);
  return { surum: ozet, soruSayisi: banka.sorular.length };
}
