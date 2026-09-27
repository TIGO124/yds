/**
 * Soru bankası doğrulaması: npm run validate
 * Hata varsa çıkış kodu 1; uyarılar raporlanır ama başarısız saymaz.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Paragraf, Soru, Taksonomi } from '../src/types';

const kok = join(dirname(fileURLToPath(import.meta.url)), '..');
const veriDizini = join(kok, 'src', 'data');
const taks = JSON.parse(readFileSync(join(veriDizini, 'konular.json'), 'utf8')) as Taksonomi;
const paragraflar = new Map(
  (JSON.parse(readFileSync(join(veriDizini, 'paragraflar.json'), 'utf8')) as Paragraf[]).map((p) => [p.id, p.metin]),
);
const bolumler = new Set(taks.bolumler.map((b) => b.kod));
const konuBolum = new Map(taks.konular.map((k) => [k.kod, k.bolum]));
/** Bu bölümlerdeki sorular ölçtükleri dilbilgisi/kelime konusuyla etiketlenir. */
const KARMA_BOLUMLER = new Set(['cloze', 'tamamlama']);

const hatalar: string[] = [];
const uyarilar: string[] = [];
const sorular: (Soru & { _dosya: string })[] = [];

for (const k of taks.konular) {
  if (!bolumler.has(k.bolum)) hatalar.push(`konular.json: '${k.kod}' bilinmeyen bölüm '${k.bolum}'`);
  if (!(k.sinav_agirligi >= 0 && k.sinav_agirligi <= 1)) hatalar.push(`konular.json: '${k.kod}' sinav_agirligi 0–1 dışında`);
  if (!k.ad || !k.oneri) hatalar.push(`konular.json: '${k.kod}' ad/oneri eksik`);
}

const soruDizini = join(veriDizini, 'sorular');
for (const f of readdirSync(soruDizini).filter((f) => f.endsWith('.json'))) {
  const veri = JSON.parse(readFileSync(join(soruDizini, f), 'utf8'));
  if (!Array.isArray(veri)) {
    hatalar.push(`${f}: dizi değil`);
    continue;
  }
  for (const s of veri) sorular.push({ ...s, _dosya: f });
}

const metin = (x: unknown) => typeof x === 'string' && x.trim().length > 0;
const idler = new Set<string>();
for (const s of sorular) {
  const yer = `${s._dosya} › ${s.id ?? '(id yok)'}`;
  if (!metin(s.id)) hatalar.push(`${yer}: id eksik`);
  else if (idler.has(s.id)) hatalar.push(`${yer}: id tekrar ediyor`);
  else idler.add(s.id);
  for (const alan of ['bolum', 'konu', 'soru', 'aciklama'] as const) {
    if (!metin(s[alan])) hatalar.push(`${yer}: '${alan}' eksik`);
  }
  if (typeof s.alt_konu !== 'string') hatalar.push(`${yer}: 'alt_konu' eksik`);
  if (![1, 2, 3].includes(s.zorluk)) hatalar.push(`${yer}: zorluk 1–3 olmalı`);
  if (!Array.isArray(s.secenekler) || s.secenekler.length !== 5 || !s.secenekler.every(metin)) {
    hatalar.push(`${yer}: 5 dolu şık olmalı`);
  } else if (new Set(s.secenekler.map((x) => x.trim().toLowerCase())).size !== 5) {
    hatalar.push(`${yer}: şıklar birbirinden farklı olmalı`);
  }
  if (!Number.isInteger(s.dogru) || s.dogru < 0 || s.dogru > 4) hatalar.push(`${yer}: dogru 0–4 olmalı`);
  if (s.paragraf_id !== null && typeof s.paragraf_id !== 'string') hatalar.push(`${yer}: paragraf_id null ya da metin olmalı`);
  else if (s.paragraf_id && !paragraflar.has(s.paragraf_id)) hatalar.push(`${yer}: paragraf '${s.paragraf_id}' bulunamadı`);
  if (!bolumler.has(s.bolum)) hatalar.push(`${yer}: bilinmeyen bölüm '${s.bolum}'`);
  const kb = konuBolum.get(s.konu);
  if (!kb) hatalar.push(`${yer}: bilinmeyen konu '${s.konu}'`);
  else if (KARMA_BOLUMLER.has(s.bolum) ? !['gr', 'kel'].includes(kb) : kb !== s.bolum) {
    hatalar.push(`${yer}: konu '${s.konu}' bölüm '${s.bolum}' ile uyumsuz`);
  }
  if (s.id && s.konu && !s.id.startsWith(`${s.konu}-`)) uyarilar.push(`${yer}: id konu önekiyle başlamıyor`);
}

// Yinelenen / çok benzer sorular
const normal = (t: string) =>
  t
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
const tamMetin = (s: Soru) => `${(s.paragraf_id && paragraflar.get(s.paragraf_id)) || ''} ${s.soru ?? ''}`;
const kelimeler = sorular.map((s) => new Set(normal(tamMetin(s)).split(' ')));
const normaller = sorular.map((s) => normal(tamMetin(s)));
for (let i = 0; i < sorular.length; i++) {
  for (let j = i + 1; j < sorular.length; j++) {
    // Aynı parçayı paylaşan sorular yalnızca soru kökü aynıysa yinelenmiş sayılır.
    const ortakParca = sorular[i].paragraf_id && sorular[i].paragraf_id === sorular[j].paragraf_id;
    if (ortakParca) {
      if (normal(sorular[i].soru) === normal(sorular[j].soru)) hatalar.push(`Yinelenen soru: ${sorular[i].id} = ${sorular[j].id}`);
      continue;
    }
    if (normaller[i] === normaller[j]) {
      hatalar.push(`Yinelenen soru: ${sorular[i].id} = ${sorular[j].id}`);
      continue;
    }
    const a = kelimeler[i];
    const b = kelimeler[j];
    let ortak = 0;
    for (const w of a) if (b.has(w)) ortak++;
    const benzerlik = ortak / (a.size + b.size - ortak);
    if (benzerlik >= 0.8) uyarilar.push(`Çok benzer (%${Math.round(benzerlik * 100)}): ${sorular[i].id} ~ ${sorular[j].id}`);
  }
}

// Doğru şık dağılımı (sabit sıralı bozan soruları dahil)
const harf = 'ABCDE';
const dagilim = [0, 0, 0, 0, 0];
for (const s of sorular) if (s.dogru >= 0 && s.dogru <= 4) dagilim[s.dogru]++;
dagilim.forEach((n, i) => {
  if (sorular.length >= 20 && n / sorular.length > 0.3) {
    uyarilar.push(`Doğru şık dengesi: ${harf[i]} şıkkı %${Math.round((n / sorular.length) * 100)} (> %30)`);
  }
});

// Rapor
console.log(`\nToplam soru: ${sorular.length}`);
console.log(`Doğru şık dağılımı: ${dagilim.map((n, i) => `${harf[i]}=${n}`).join(' ')}`);
const zorlukToplam = [0, 0, 0];
for (const s of sorular) if ([1, 2, 3].includes(s.zorluk)) zorlukToplam[s.zorluk - 1]++;
const z = (n: number) => `%${sorular.length ? Math.round((n / sorular.length) * 100) : 0}`;
console.log(`Zorluk: kolay ${z(zorlukToplam[0])}, orta ${z(zorlukToplam[1])}, zor ${z(zorlukToplam[2])}\n`);
console.log('Konu'.padEnd(26) + 'Soru  K  O  Z');
for (const k of taks.konular) {
  const ks = sorular.filter((s) => s.konu === k.kod);
  const say = (d: number) => String(ks.filter((s) => s.zorluk === d).length).padStart(3);
  console.log(`${k.kod.padEnd(26)}${String(ks.length).padStart(4)}${say(1)}${say(2)}${say(3)}`);
  if (ks.length === 0) uyarilar.push(`'${k.kod}' konusunda hiç soru yok`);
}

if (uyarilar.length) {
  console.log(`\nUyarılar (${uyarilar.length}):`);
  for (const u of uyarilar) console.log(`  ! ${u}`);
}
if (hatalar.length) {
  console.log(`\nHatalar (${hatalar.length}):`);
  for (const h of hatalar) console.log(`  ✗ ${h}`);
  process.exit(1);
}
console.log('\n✓ Doğrulama başarılı.');
