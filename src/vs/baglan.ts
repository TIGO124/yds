// VS bağlantısının seçimi: Firebase yapılandırılmışsa gerçek sunucu, geliştirmede sekmeler arası sunucu.
import { FIREBASE_AYAR } from './ayar';
import { VsHatasi, type VsBaglanti } from './baglanti';

/** claude.ai üzerinde ağ erişimi kapalı; VS gösterilmez. */
export const VS_DURUMU: 'firebase' | 'yerel' | 'kapali' =
  import.meta.env.MODE === 'artifact' ? 'kapali' : FIREBASE_AYAR ? 'firebase' : import.meta.env.DEV ? 'yerel' : 'kapali';

let vaat: Promise<VsBaglanti> | null = null;

export function vsBaglantisi(): Promise<VsBaglanti> {
  if (!vaat) {
    vaat = (async () => {
      if (VS_DURUMU === 'firebase' && FIREBASE_AYAR) {
        if (!navigator.onLine) throw new VsHatasi('VS için internet bağlantısı gerekli.');
        const { firebaseBaglantisi } = await import('./firebase');
        return firebaseBaglantisi(FIREBASE_AYAR);
      }
      if (VS_DURUMU === 'yerel') {
        const { sekmeBaglantisi } = await import('./sekme');
        return sekmeBaglantisi();
      }
      throw new VsHatasi('VS sunucusu henüz kurulmadı.');
    })();
    // Başarısız deneme önbellekte kalmasın; bir sonraki denemede yeniden bağlanılır.
    vaat.catch(() => {
      vaat = null;
    });
  }
  return vaat;
}
