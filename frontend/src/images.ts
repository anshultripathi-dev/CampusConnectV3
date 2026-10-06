import { api } from './lib';

export type PreparedPhoto = { filename: string; mime: string; data: string };
const MAX_DIM = 1280;

// Shrinks a camera photo in the browser (max 1280px, JPEG) so uploads stay small and fast.
export async function preparePhoto(file: File): Promise<PreparedPhoto> {
  if (!/^image\/(jpeg|png|webp)$/.test(file.type))
    throw new Error('Only JPEG, PNG or WebP photos are supported.');
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_DIM / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Could not process the photo.');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const dataUrl = canvas.toDataURL('image/jpeg', 0.82);
  return {
    filename: file.name.replace(/\.\w+$/, '') + '.jpg',
    mime: 'image/jpeg',
    data: dataUrl.split(',')[1],
  };
}

export async function uploadPhoto(incidentId: string, file: File) {
  const photo = await preparePhoto(file);
  return api(`/api/v2/incidents/${incidentId}/attachments`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(photo),
  });
}
