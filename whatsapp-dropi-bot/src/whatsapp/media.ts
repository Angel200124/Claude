import { config } from "../config.js";

/**
 * Descarga un archivo multimedia de WhatsApp (audio, imagen, etc.) a partir
 * de su media ID. La Cloud API primero devuelve una URL temporal autenticada
 * para ese archivo, y hay que pedirla con el mismo token de WhatsApp.
 */
export async function downloadWhatsAppMedia(mediaId: string): Promise<{ buffer: Buffer; mimeType: string }> {
  const metaUrl = `https://graph.facebook.com/${config.whatsapp.graphApiVersion}/${mediaId}`;
  const metaRes = await fetch(metaUrl, {
    headers: { Authorization: `Bearer ${config.whatsapp.token}` },
  });
  if (!metaRes.ok) {
    throw new Error(`No se pudo obtener la URL del archivo (${metaRes.status}): ${await metaRes.text()}`);
  }
  const meta = (await metaRes.json()) as { url: string; mime_type: string };

  const fileRes = await fetch(meta.url, {
    headers: { Authorization: `Bearer ${config.whatsapp.token}` },
  });
  if (!fileRes.ok) {
    throw new Error(`No se pudo descargar el archivo (${fileRes.status})`);
  }

  const arrayBuffer = await fileRes.arrayBuffer();
  return { buffer: Buffer.from(arrayBuffer), mimeType: meta.mime_type };
}
