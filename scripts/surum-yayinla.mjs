// Yeni sürüm yayınlar:  npm run surum -- 1.1.0 "Yenilik 1" "Yenilik 2"
//  1. package.json sürümünü yükseltir (Android versionCode da buradan hesaplanır)
//  2. Testleri çalıştırır, Android APK'yı derler
//  3. APK'yı indir/ klasörüne ve Masaüstüne koyar
//  4. Commit + push: GitHub Pages web sürümünü günceller ve APK'yı yayınlar
// Telefonlardaki uygulama bir sonraki açılışta "Yeni sürüm" bandını gösterir.
// Veriler korunur, çünkü APK hep aynı anahtarla (~/.android/debug.keystore) imzalanır.
import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const kok = join(dirname(fileURLToPath(import.meta.url)), '..');
const [yeni, ...notlar] = process.argv.slice(2);

function dur(mesaj) {
  console.error(`\n✖ ${mesaj}`);
  process.exit(1);
}
function calistir(komut, secenek = {}) {
  console.log(`\n> ${komut}`);
  const s = spawnSync(komut, { cwd: kok, shell: true, stdio: 'inherit', ...secenek });
  if (s.status !== 0) dur(`Komut başarısız: ${komut}`);
}
const surumSayi = (s) => s.split('.').map(Number).reduce((t, n) => t * 1000 + n, 0);

const pkgYolu = join(kok, 'package.json');
const pkg = JSON.parse(readFileSync(pkgYolu, 'utf8'));
if (!/^\d+\.\d+\.\d+$/.test(yeni ?? '')) dur('Kullanım: npm run surum -- 1.1.0 "Yenilik 1" "Yenilik 2"');
if (surumSayi(yeni) <= surumSayi(pkg.version)) dur(`Yeni sürüm (${yeni}) mevcut sürümden (${pkg.version}) büyük olmalı.`);
if (yeni.split('.').some((n) => Number(n) > 99)) dur('Sürüm parçaları 0–99 arasında olmalı (Android versionCode için).');

const kirli = spawnSync('git status --porcelain --untracked-files=no', { cwd: kok, shell: true, encoding: 'utf8' }).stdout.trim();
if (kirli) dur(`Önce değişikliklerini commit et:\n${kirli}`);

const imza = join(homedir(), '.android', 'debug.keystore');
if (!existsSync(imza)) dur(`İmza anahtarı yok: ${imza}\nYedeğini geri koymadan yayınlama; farklı anahtarla imzalanan APK eski sürümün üzerine kurulamaz.`);

// 1. Sürüm
pkg.version = yeni;
writeFileSync(pkgYolu, JSON.stringify(pkg, null, 2) + '\n');
const kilitYolu = join(kok, 'package-lock.json');
if (existsSync(kilitYolu)) {
  const kilit = JSON.parse(readFileSync(kilitYolu, 'utf8'));
  kilit.version = yeni;
  if (kilit.packages?.['']) kilit.packages[''].version = yeni;
  writeFileSync(kilitYolu, JSON.stringify(kilit, null, 2) + '\n');
}

// 2. Test ve APK
const env = { ...process.env };
env.JAVA_HOME ||= 'C:\\Program Files\\Android\\Android Studio\\jbr';
env.ANDROID_HOME ||= join(process.env.LOCALAPPDATA ?? '', 'Android', 'Sdk');
calistir('npm test');
calistir('npm run build:android');
// Yol açıkça verilir: NoDefaultCurrentDirectoryInExePath ayarlıysa cmd geçerli klasörde aramaz.
calistir(process.platform === 'win32' ? '.\\gradlew.bat assembleDebug --no-daemon -q' : './gradlew assembleDebug --no-daemon -q', {
  cwd: join(kok, 'android'),
  env,
});

// 3. APK'yı yerleştir
const cikti = join(kok, 'android', 'app', 'build', 'outputs', 'apk', 'debug', 'app-debug.apk');
mkdirSync(join(kok, 'indir'), { recursive: true });
copyFileSync(cikti, join(kok, 'indir', 'YDS-Calisma.apk'));
writeFileSync(join(kok, 'indir', 'apk.json'), JSON.stringify({ surum: yeni, notlar }, null, 2) + '\n');
const masaustu = join(homedir(), 'Desktop', 'YDS-Calisma.apk');
try {
  copyFileSync(cikti, masaustu);
  console.log(`\nAPK Masaüstüne kopyalandı: ${masaustu}`);
} catch {
  console.log('\nAPK Masaüstüne kopyalanamadı (önemli değil).');
}

// 4. Yayınla
const mesaj = [`Sürüm ${yeni}`, ...notlar.map((n) => `- ${n}`)].join('\n');
calistir('git add package.json package-lock.json indir');
spawnSync('git', ['commit', '-q', '-m', mesaj], { cwd: kok, stdio: 'inherit' });
calistir(`git tag v${yeni}`);
calistir('git push origin main --tags');
console.log(`\n✔ Sürüm ${yeni} yayınlandı. GitHub Pages birkaç dakika içinde güncellenir.`);
