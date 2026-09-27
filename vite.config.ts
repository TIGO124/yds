/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';
import { VitePWA } from 'vite-plugin-pwa';
import { readFileSync } from 'node:fs';
import { bankaSurumu, bankayiOku } from './scripts/banka-surumu.mjs';

const UYGULAMA_SURUMU: string = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')).version;

// Modlar:
//  (varsayılan) → dist/          PWA: service worker ile internetsiz çalışır (GitHub Pages / Netlify)
//  android      → dist-android/  Capacitor APK'sı: dosyalar zaten cihazda, service worker gerekmez
//  artifact     → dist-artifact/ claude.ai üzerinde paylaşılan sürüm: service worker kullanılamaz
export default defineConfig(({ mode }) => {
  const swYok = mode === 'android' || mode === 'artifact';
  // Uygulamaya gömülü bankanın sürümü: Android uygulaması indirilecek paketle karşılaştırır.
  const { surum } = bankaSurumu(bankayiOku(__dirname));
  return {
    define: {
      __BANKA_SURUMU__: JSON.stringify(surum),
      __BANKA_TARIHI__: String(Date.now()),
      __UYGULAMA_SURUMU__: JSON.stringify(UYGULAMA_SURUMU),
    },
    // Göreli taban: GitHub Pages alt yolunda da Netlify kökünde de çalışır.
    base: './',
    plugins: [
      preact(),
      VitePWA({
        disable: swYok,
        // Güncelleme kendiliğinden uygulanmaz: kullanıcıya bant gösterilir (test ortasında sayfa yenilenmesin).
        registerType: 'prompt',
        injectRegister: false,
        includeAssets: ['icon.svg', 'apple-touch-icon.png'],
        manifest: {
          name: 'YDS Çalışma',
          short_name: 'YDS',
          description: 'İnternetsiz YDS hazırlık testleri ve konu analizi',
          lang: 'tr',
          start_url: './',
          scope: './',
          display: 'standalone',
          orientation: 'portrait',
          background_color: '#f4f1ea',
          theme_color: '#f4f1ea',
          icons: [
            { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
            { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
            { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          ],
        },
        workbox: {
          globPatterns: ['**/*.{js,css,html,svg,png,json,webmanifest,woff2}'],
          // Soru paketi yalnızca Android uygulaması için; web sürümü soruları derlemeyle alır.
          globIgnores: ['**/soru-paketi*.json'],
          maximumFileSizeToCacheInBytes: 8 * 1024 * 1024,
          navigateFallback: 'index.html',
          // İndirme klasörü (APK) uygulama sayfasına çevrilmesin: aksi hâlde indirme yerine boş sayfa açılır.
          navigateFallbackDenylist: [/\/indir\//],
        },
      }),
    ],
    build: {
      outDir: mode === 'android' ? 'dist-android' : mode === 'artifact' ? 'dist-artifact' : 'dist',
      // Soru bankası ayrı parça: uygulama kodu güncellenince veri yeniden indirilmez (ve tersi).
      chunkSizeWarningLimit: 1500,
      // Artifact tek dosya: yazı tipleri de CSS'e gömülür.
      assetsInlineLimit: mode === 'artifact' ? 1024 * 1024 : 4096,
      rollupOptions: {
        // Artifact tek HTML dosyasına gömülür (scripts/artifact-tek-dosya.mjs), parçalanmasın.
        output:
          mode === 'artifact'
            ? {}
            : { manualChunks: (id: string) => (id.includes('/src/data/') ? 'soru-bankasi' : undefined) },
      },
    },
    test: {
      include: ['tests/**/*.test.ts'],
      environment: 'node',
    },
  };
});
