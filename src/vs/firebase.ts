// Firebase Realtime Database + anonim giriş üzerinden VS bağlantısı. Yalnızca VS açılınca yüklenir.
import { initializeApp } from 'firebase/app';
import { browserLocalPersistence, indexedDBLocalPersistence, initializeAuth, inMemoryPersistence, signInAnonymously } from 'firebase/auth';
import { get, getDatabase, onDisconnect, onValue, ref, runTransaction, set } from 'firebase/database';
import type { FirebaseAyar } from './ayar';
import { VsHatasi, type VsBaglanti } from './baglanti';

export async function firebaseBaglantisi(ayar: FirebaseAyar): Promise<VsBaglanti> {
  const app = initializeApp(ayar, 'yds-vs');
  // Açılır pencere/yönlendirme çözücüsü eklenmez: Android WebView'de gerekmez ve takılabilir.
  // Geliştirmede her sekme ayrı oyuncu olsun diye kimlik saklanmaz (aynı kimlik kendisiyle eşleşemez).
  const auth = initializeAuth(app, {
    persistence: import.meta.env.DEV ? inMemoryPersistence : [indexedDBLocalPersistence, browserLocalPersistence, inMemoryPersistence],
  });
  await auth.authStateReady();
  let uid = auth.currentUser?.uid;
  if (!uid) {
    try {
      uid = (await signInAnonymously(auth)).user.uid;
    } catch (e) {
      const kod = (e as { code?: string }).code ?? '';
      if (kod.includes('network')) throw new VsHatasi('Sunucuya ulaşılamadı. İnternet bağlantını kontrol et.');
      if (kod.includes('operation-not-allowed') || kod.includes('admin-restricted'))
        throw new VsHatasi('VS sunucusunda anonim giriş kapalı (Firebase → Authentication → Anonymous).');
      throw new VsHatasi(`VS sunucusuna giriş yapılamadı (${kod || String(e)}).`);
    }
  }

  const db = getDatabase(app);
  let fark = 0;
  onValue(ref(db, '.info/serverTimeOffset'), (s) => {
    fark = Number(s.val()) || 0;
  });

  return {
    uid,
    simdi: () => Date.now() + fark,
    oku: async <T>(yol: string) => ((await get(ref(db, yol))).val() as T | null) ?? null,
    yaz: (yol, deger) => set(ref(db, yol), deger ?? null),
    islem: async <T>(yol: string, fn: (m: T | null) => T | null | undefined) => {
      const r = await runTransaction(ref(db, yol), (m: T | null) => fn(m ?? null), { applyLocally: false });
      return r.committed;
    },
    dinle: <T>(yol: string, cb: (d: T | null) => void) =>
      onValue(
        ref(db, yol),
        (s) => cb((s.val() as T | null) ?? null),
        (e) => console.error('VS dinleme hatası', yol, e),
      ),
    kopunca: (yol, deger) => (deger === null ? onDisconnect(ref(db, yol)).remove() : onDisconnect(ref(db, yol)).set(deger)),
    kopuncaIptal: (yol) => onDisconnect(ref(db, yol)).cancel(),
    baglantiDinle: (cb) => onValue(ref(db, '.info/connected'), (s) => cb(s.val() === true)),
  };
}
