/**
 * Kısa formatlı soru partisini src/data/sorular/<bolum>.json dosyasına ekler.
 * Kullanım: npm run add-questions -- parti.json
 *
 * Parti formatı (tek nesne ya da dizi):
 * { "bolum": "gr", "items": [
 *   ["gr.zaman", "alt konu", 2, "soru ----", ["DOĞRU", "çeldirici", "...", "...", "..."], "açıklama"],
 *   ["bozan", "alt konu", 2, "(I) ... (V) ...", ["I","II","III","IV","V"], "açıklama", 2]  // 7. öğe: sabit doğru indeks
 * ]}
 * Ortak paragraflı okuma soruları:
 * { "bolum": "okuma", "paragraflar": [ { "metin": "parça", "items": [ ...aynı öğe biçimi... ] } ] }
 *
 * Sabit indeks yoksa ilk şık doğrudur; doğru şık, dosyada en az kullanılan konuma yerleştirilir
 * ve çeldiriciler karıştırılır (A–E dengesi). Kimlikler konu başına sıradan devam eder.
 */
import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Paragraf, Soru, Zorluk } from '../src/types';
import { karistir, metinTohumu, mulberry32 } from '../src/engine/rng';

type Oge = [string, string, number, string, string[], string, number?];
type Parti = { bolum: string; items?: Oge[]; paragraflar?: { metin: string; items: Oge[] }[] };

const kok = join(dirname(fileURLToPath(import.meta.url)), '..');
const veriDizini = join(kok, 'src', 'data');
const soruDizini = join(veriDizini, 'sorular');
const paragrafDosyasi = join(veriDizini, 'paragraflar.json');

const dosya = process.argv[2];
if (!dosya) {
  console.error('Kullanım: npm run add-questions -- parti.json');
  process.exit(1);
}
const okunan = JSON.parse(readFileSync(dosya, 'utf8')) as Parti | Parti[];
const partiler = Array.isArray(okunan) ? okunan : [okunan];

// Konu başına en büyük mevcut numara (tüm dosyalarda)
const enBuyuk = new Map<string, number>();
for (const f of readdirSync(soruDizini).filter((f) => f.endsWith('.json'))) {
  for (const s of JSON.parse(readFileSync(join(soruDizini, f), 'utf8')) as Soru[]) {
    const n = Number(s.id.slice(s.id.lastIndexOf('-') + 1));
    enBuyuk.set(s.konu, Math.max(enBuyuk.get(s.konu) ?? 0, n));
  }
}

const paragraflar: Paragraf[] = existsSync(paragrafDosyasi) ? JSON.parse(readFileSync(paragrafDosyasi, 'utf8')) : [];
let paragrafNo = paragraflar.reduce((m, p) => Math.max(m, Number(p.id.slice(2))), 0);

for (const parti of partiler) {
  const hedef = join(soruDizini, `${parti.bolum}.json`);
  const mevcut: Soru[] = existsSync(hedef) ? JSON.parse(readFileSync(hedef, 'utf8')) : [];
  const konumSayac = [0, 0, 0, 0, 0];
  for (const s of mevcut) konumSayac[s.dogru]++;

  const ekle = (oge: Oge, paragraf_id: string | null) => {
    const [konu, alt_konu, zorluk, soru, secenekler, aciklama, sabit] = oge;
    if (secenekler.length !== 5) throw new Error(`5 şık olmalı: ${soru.slice(0, 60)}`);
    const no = (enBuyuk.get(konu) ?? 0) + 1;
    enBuyuk.set(konu, no);

    let sirali = secenekler;
    let dogru = sabit ?? 0;
    if (sabit === undefined) {
      const rng = mulberry32(metinTohumu(soru + secenekler[0]));
      const enAz = Math.min(...konumSayac);
      const adaylar = konumSayac.map((c, i) => (c === enAz ? i : -1)).filter((i) => i >= 0);
      dogru = adaylar[Math.floor(rng() * adaylar.length)];
      const celdiriciler = karistir(secenekler.slice(1), rng);
      sirali = [...celdiriciler.slice(0, dogru), secenekler[0], ...celdiriciler.slice(dogru)];
    }
    konumSayac[dogru]++;
    mevcut.push({
      id: `${konu}-${String(no).padStart(4, '0')}`,
      bolum: parti.bolum,
      konu,
      alt_konu,
      zorluk: zorluk as Zorluk,
      soru,
      secenekler: sirali,
      dogru,
      aciklama,
      paragraf_id,
    });
  };

  let sayi = 0;
  for (const oge of parti.items ?? []) {
    ekle(oge, null);
    sayi++;
  }
  for (const p of parti.paragraflar ?? []) {
    const id = `p-${String(++paragrafNo).padStart(4, '0')}`;
    paragraflar.push({ id, metin: p.metin });
    for (const oge of p.items) {
      ekle(oge, id);
      sayi++;
    }
  }

  writeFileSync(hedef, JSON.stringify(mevcut, null, 2) + '\n', 'utf8');
  console.log(`${sayi} soru eklendi → ${parti.bolum}.json (toplam ${mevcut.length})`);
}
writeFileSync(paragrafDosyasi, JSON.stringify(paragraflar, null, 2) + '\n', 'utf8');
