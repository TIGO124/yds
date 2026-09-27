package app.yds.calisma;

import android.os.Bundle;
import android.os.Environment;
import com.getcapacitor.BridgeActivity;
import java.io.File;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Uygulamaya özel eklenti: uygulama içi APK güncellemesi (ApkGuncellemePlugin)
        registerPlugin(ApkGuncellemePlugin.class);
        super.onCreate(savedInstanceState);
        kameraDosyalariniTemizle();
    }

    /**
     * Kamera düğmesi (<input capture>) için Capacitor fotoğrafı Pictures klasörüne geçici "JPEG_*.jpg" olarak
     * yazar; uygulama fotoğrafı küçültüp kendi veritabanına kaydeder. Açılışta bu geçici dosyalar silinir.
     */
    private void kameraDosyalariniTemizle() {
        File klasor = getExternalFilesDir(Environment.DIRECTORY_PICTURES);
        if (klasor == null) return;
        new Thread(() -> {
            File[] dosyalar = klasor.listFiles((d, ad) -> ad.startsWith("JPEG_") && ad.endsWith(".jpg"));
            if (dosyalar != null) for (File f : dosyalar) f.delete();
        }).start();
    }
}
