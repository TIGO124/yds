/** Kamera fotoğrafını saklamaya hazırlar: yönü düzeltilmiş, küçültülmüş JPEG ve küçük resim. */

const TAM_KENAR = 1600;
const KUCUK_KENAR = 360;

async function olcekle(kaynak: ImageBitmap, enUzunKenar: number, kalite: number) {
  const oran = Math.min(1, enUzunKenar / Math.max(kaynak.width, kaynak.height));
  const genislik = Math.max(1, Math.round(kaynak.width * oran));
  const yukseklik = Math.max(1, Math.round(kaynak.height * oran));
  const tuval = document.createElement('canvas');
  tuval.width = genislik;
  tuval.height = yukseklik;
  const cizim = tuval.getContext('2d');
  if (!cizim) throw new Error('Fotoğraf işlenemedi.');
  cizim.drawImage(kaynak, 0, 0, genislik, yukseklik);
  const blob = await new Promise<Blob | null>((coz) => tuval.toBlob(coz, 'image/jpeg', kalite));
  if (!blob) throw new Error('Fotoğraf işlenemedi.');
  return { veri: await blob.arrayBuffer(), genislik, yukseklik };
}

/** Telefon kamerasının 10+ MP fotoğrafı ~300 KB'a iner; metin okunur kalır. */
export async function fotografHazirla(dosya: Blob): Promise<{ veri: ArrayBuffer; kucuk: ArrayBuffer; genislik: number; yukseklik: number }> {
  let kaynak: ImageBitmap;
  try {
    kaynak = await createImageBitmap(dosya, { imageOrientation: 'from-image' });
  } catch {
    throw new Error('Bu dosya bir fotoğraf olarak açılamadı.');
  }
  try {
    const tam = await olcekle(kaynak, TAM_KENAR, 0.82);
    const kucuk = await olcekle(kaynak, KUCUK_KENAR, 0.7);
    return { veri: tam.veri, kucuk: kucuk.veri, genislik: tam.genislik, yukseklik: tam.yukseklik };
  } finally {
    kaynak.close();
  }
}

/** Saklanan JPEG için gösterim adresi; işi bitince URL.revokeObjectURL ile bırakılmalı. */
export const jpegAdresi = (veri: ArrayBuffer) => URL.createObjectURL(new Blob([veri], { type: 'image/jpeg' }));
