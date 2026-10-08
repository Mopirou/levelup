import { Capacitor } from '@capacitor/core';

export interface PickedPhoto {
  blob: Blob;
  ext: 'jpg' | 'webp';
  width: number;
  height: number;
  previewUrl: string;
}

export const MAX_PHOTO_BYTES = 10 * 1024 * 1024;
const MAX_SIDE = 1600;

/**
 * Photos traitées avant envoi : redimensionnées à 1 600 px, recompressées (WebP ou JPEG à 80 %),
 * métadonnées EXIF (dont la position GPS) supprimées par le redessin sur canvas. 10 Mo maximum.
 */
export async function processImage(file: Blob): Promise<PickedPhoto> {
  if (file.size > MAX_PHOTO_BYTES * 3) throw new Error('Cette photo est trop volumineuse.');
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const w = Math.max(1, Math.round(bitmap.width * scale));
  const h = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Impossible de traiter cette image.');
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close?.();
  const toBlob = (type: string) => new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, 0.8));
  let blob = await toBlob('image/webp');
  let ext: 'jpg' | 'webp' = 'webp';
  if (!blob || blob.type !== 'image/webp') {
    blob = await toBlob('image/jpeg');
    ext = 'jpg';
  }
  if (!blob) throw new Error('Impossible de compresser cette image.');
  if (blob.size > MAX_PHOTO_BYTES) throw new Error('Cette photo dépasse 10 Mo même après compression.');
  return { blob, ext, width: w, height: h, previewUrl: URL.createObjectURL(blob) };
}

/** Ouvre l'appareil photo ou la galerie (Capacitor sur mobile, sélecteur de fichier sur le web). */
export async function pickPhotos(source: 'camera' | 'gallery', max = 4): Promise<PickedPhoto[]> {
  if (Capacitor.isNativePlatform()) {
    const { Camera, CameraResultType, CameraSource } = await import('@capacitor/camera');
    const photo = await Camera.getPhoto({
      resultType: CameraResultType.Uri,
      source: source === 'camera' ? CameraSource.Camera : CameraSource.Photos,
      quality: 90,
      correctOrientation: true,
    });
    const res = await fetch(photo.webPath!);
    return [await processImage(await res.blob())];
  }
  return new Promise<PickedPhoto[]>((resolve, reject) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.multiple = source === 'gallery' && max > 1;
    if (source === 'camera') input.setAttribute('capture', 'environment');
    input.style.display = 'none';
    document.body.appendChild(input);
    input.addEventListener('change', async () => {
      try {
        const files = Array.from(input.files ?? []).slice(0, max);
        resolve(await Promise.all(files.map((f) => processImage(f))));
      } catch (e) {
        reject(e);
      } finally {
        input.remove();
      }
    });
    input.addEventListener('cancel', () => {
      input.remove();
      resolve([]);
    });
    input.click();
  });
}
