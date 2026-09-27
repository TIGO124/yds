/** Kelime defteri yardımcıları: anahtar, açıklamadan anlam ve bağlam cümlesi çıkarma. */

/** Defter anahtarı: tek boşluklu, baştaki/sondaki noktalama atılmış, küçük harf. */
export function kelimeAnahtari(metin: string): string {
  return metin
    .normalize('NFC')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '')
    .toLocaleLowerCase('en-US');
}

const kacir = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Çekim eki atılmış olası kökler: conducted → conduct, posed → pose. */
function kokler(k: string): string[] {
  return [...new Set([k, k.replace(/(ing|ed|es|s)$/, ''), k.replace(/d$/, ''), k.replace(/ied$/, 'y')])].filter((x) => x.length >= 3);
}

/** "çarpıcı biçimde ('dramatically')" gibi iki sözcüklü karşılıkların ikinci sözcükleri. */
const IKILI_SON = new Set(['biçimde', 'şekilde', 'olarak', 'yer', 'tehlike']);

/** Açıklama cümlesinden alınan karşılığı sadeleştirir: eşsiz kapanan parantez ve ek-fiil (-dir) atılır. */
function sadelestir(anlam: string): string {
  let a = anlam.trim();
  if ((a.match(/\)/g)?.length ?? 0) > (a.match(/\(/g)?.length ?? 0)) a = a.replace(/\)\s*$/, '').trim();
  return a.length > 6 ? a.replace(/(?<=\p{L}{3})[dt][ıiuü]r$/u, '') : a;
}

/**
 * Soru açıklamasından kelimenin Türkçe karşılığını bulur. Tanınan yazımlar (öncelik sırasıyla):
 * 'kelime' = anlam · 'kelime' (anlam) · 'anlam' ('kelime') · anlam ('kelime').
 * Kelime yalnızca bir kalıbın içinde geçiyorsa kalıpla birlikte verir ("conduct an experiment: deney yapmak").
 * Bulamazsa boş metin.
 */
export function anlamBul(aciklama: string, kelime: string): string {
  const k = kelimeAnahtari(kelime);
  if (!k) return '';
  let kalip = '';
  for (const m of aciklama.matchAll(/'([^']+)'\s*=\s*(?:'([^']+)'|((?:\.\.\.|…)?[^.;\n]+))/g)) {
    const sol = kelimeAnahtari(m[1]);
    const anlam = sadelestir((m[2] ?? m[3] ?? '').replace(/^(\.\.\.|…)\s*|\s*(\.\.\.|…)$/g, ''));
    if (!anlam) continue;
    if (sol === k) return anlam;
    if (!kalip && kokler(k).some((kok) => new RegExp(`(^|[^\\p{L}])${kacir(kok)}($|[^\\p{L}])`, 'u').test(sol))) {
      kalip = `${sol}: ${anlam}`;
    }
  }
  if (kalip) return kalip;
  const kw = kacir(k);
  const parantezli = new RegExp(`'${kw}'\\p{L}*\\s*\\(([^)]+)\\)`, 'iu').exec(aciklama);
  if (parantezli) return parantezli[1].trim();
  const tirnakli = new RegExp(`'([^']+)'\\s*\\('${kw}'\\)`, 'iu').exec(aciklama);
  if (tirnakli) return tirnakli[1].trim();
  const onceki = new RegExp(`(?:([\\p{L}/-]+)\\s+)?([\\p{L}/-]+)\\s*\\('${kw}'\\)`, 'iu').exec(aciklama);
  if (onceki) return sadelestir(onceki[1] && IKILI_SON.has(onceki[2].toLocaleLowerCase('tr')) ? `${onceki[1]} ${onceki[2]}` : onceki[2]);
  return '';
}

/** Metinde kelimenin geçtiği cümle (en fazla 220 karakter). */
export function baglamCumlesi(metin: string, kelime: string): string {
  const k = kelime.trim().toLocaleLowerCase('en-US');
  const cumleler = metin.replace(/\s+/g, ' ').match(/[^.!?]+[.!?]*/g) ?? [];
  const c = (cumleler.find((x) => x.toLocaleLowerCase('en-US').includes(k)) ?? '').trim();
  return c.length > 220 ? `${c.slice(0, 217).trimEnd()}…` : c;
}

/** Kelime sorusunun bağlamı: boşluğa doğru cevabın yazıldığı soru cümlesi. */
export function soruBaglami(soru: string, cevap: string): string {
  const dolu = soru.replace(/(\(\d+\) ?)?-{3,}/, cevap);
  return baglamCumlesi(dolu, cevap) || dolu.slice(0, 220);
}
