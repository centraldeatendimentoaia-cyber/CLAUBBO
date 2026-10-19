// Imagens do chat (Escritório v2): lê o arquivo da página, reduz para no máximo 1568 px no maior lado e devolve JPEG em
// base64 (leve o bastante para o envio e suficiente para o agente ler). Fundo branco para PNG com transparência.
export interface ChatImage {
  mediaType: 'image/jpeg';
  /** base64 sem o prefixo `data:`. */
  data: string;
  /** URL local só para a miniatura. */
  url: string;
}

export const MAX_CHAT_IMAGES = 3;
const MAX_SIDE = 1568;

export async function prepareImage(file: File): Promise<ChatImage> {
  if (!file.type.startsWith('image/')) throw new Error('só imagens');
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, MAX_SIDE / Math.max(bmp.width, bmp.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(bmp.width * scale));
  canvas.height = Math.max(1, Math.round(bmp.height * scale));
  const g = canvas.getContext('2d');
  if (!g) throw new Error('canvas indisponível');
  g.fillStyle = '#fff';
  g.fillRect(0, 0, canvas.width, canvas.height);
  g.drawImage(bmp, 0, 0, canvas.width, canvas.height);
  bmp.close();
  const url = canvas.toDataURL('image/jpeg', 0.85);
  return { mediaType: 'image/jpeg', data: url.slice(url.indexOf(',') + 1), url };
}
