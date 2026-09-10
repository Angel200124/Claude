import axios from "axios";
import { config } from "../config.js";

/**
 * Cliente mínimo de la WhatsApp Cloud API (Meta) para mandar mensajes de texto.
 * Docs: https://developers.facebook.com/docs/whatsapp/cloud-api/reference/messages
 */
export async function sendWhatsAppText(to: string, body: string): Promise<void> {
  const url = `https://graph.facebook.com/${config.whatsapp.graphApiVersion}/${config.whatsapp.phoneNumberId}/messages`;

  try {
    await axios.post(
      url,
      {
        messaging_product: "whatsapp",
        to,
        type: "text",
        text: { body },
      },
      {
        headers: {
          Authorization: `Bearer ${config.whatsapp.token}`,
          "Content-Type": "application/json",
        },
        timeout: 15_000,
      },
    );
  } catch (error) {
    if (axios.isAxiosError(error)) {
      console.error(
        `[whatsapp] Error al enviar mensaje a ${to}:`,
        error.response?.status,
        error.response?.data ?? error.message,
      );
    } else {
      console.error(`[whatsapp] Error al enviar mensaje a ${to}:`, error);
    }
    // No relanzamos: un fallo al notificar no debe tirar abajo el webhook ni el poller.
  }
}
