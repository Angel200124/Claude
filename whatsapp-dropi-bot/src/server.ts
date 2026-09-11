import express from "express";
import { config, assertRequiredConfig } from "./config.js";
import { isMessageProcessed, markMessageProcessed } from "./db.js";
import { handleIncomingMessage } from "./conversation/flow.js";
import { handleIncomingMessageAI } from "./conversation/aiFlow.js";
import { sendWhatsAppText } from "./whatsapp/client.js";
import { downloadWhatsAppMedia } from "./whatsapp/media.js";
import { transcribeAudio } from "./ai/transcribe.js";

assertRequiredConfig();

const useAiConversation = config.ai.mode === "ai" && !!config.ai.apiKey;
console.log(
  useAiConversation
    ? "[config] CONVERSATION_MODE=ai — Claude maneja la conversación completa (incluido tomar el pedido)."
    : "[config] Usando el flujo de reglas fijas (sin IA) para la conversación.",
);

const app = express();
app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

// Verificación del webhook (Meta hace un GET una sola vez al configurarlo).
app.get("/webhook/whatsapp", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode === "subscribe" && token === config.whatsapp.verifyToken) {
    res.status(200).send(challenge);
  } else {
    res.sendStatus(403);
  }
});

// Mensajes entrantes.
app.post("/webhook/whatsapp", async (req, res) => {
  // Respondemos rápido — Meta reintenta si no contestamos 200 a tiempo.
  res.sendStatus(200);
  console.log("[webhook] POST recibido de Meta");

  try {
    const entry = req.body?.entry?.[0];
    const change = entry?.changes?.[0];
    const value = change?.value;
    const messages = value?.messages as any[] | undefined;

    if (!messages || messages.length === 0) {
      // Puede ser un evento de "status" (entregado/leído), no un mensaje. Lo ignoramos.
      console.log("[webhook] Sin mensajes en este evento (probablemente un status). Payload:", JSON.stringify(req.body));
      return;
    }

    for (const message of messages) {
      const messageId: string | undefined = message.id;
      if (messageId) {
        if (isMessageProcessed(messageId)) {
          console.log(`[webhook] Mensaje ${messageId} ya procesado antes, ignorando reintento de Meta.`);
          continue;
        }
        markMessageProcessed(messageId);
      }

      const from: string = message.from;
      console.log(`[webhook] Mensaje de ${from} (tipo: ${message.type})`);

      let text: string;
      if (message.type === "text") {
        text = message.text?.body ?? "";
      } else if (message.type === "location") {
        // El cliente compartió su ubicación real de WhatsApp (no texto) — la
        // convertimos a un link de Maps para que quede en la conversación y
        // Lucía la pueda usar/pasar como dato de entrega.
        const loc = message.location ?? {};
        const mapsLink =
          loc.latitude != null && loc.longitude != null ? `https://maps.google.com/?q=${loc.latitude},${loc.longitude}` : "";
        text = ["[El cliente compartió su ubicación de WhatsApp]", loc.name, loc.address, mapsLink]
          .filter(Boolean)
          .join(" — ");
      } else if (message.type === "audio") {
        const mediaId = message.audio?.id;
        let transcript = "";
        if (mediaId) {
          try {
            const { buffer, mimeType } = await downloadWhatsAppMedia(mediaId);
            transcript = await transcribeAudio(buffer, mimeType);
          } catch (error) {
            console.error(`[webhook] Error procesando audio de ${from}:`, error);
          }
        }
        if (!transcript) {
          await sendWhatsAppText(from, "No pude entender bien tu audio 🙏, ¿me lo podés escribir como texto?");
          continue;
        }
        text = transcript;
        console.log(`[webhook] Audio de ${from} transcripto: "${text}"`);
      } else {
        await sendWhatsAppText(
          from,
          "Por ahora solo puedo leer mensajes de texto, audio o ubicación 🙏. Escribime tu pedido o consulta.",
        );
        continue;
      }
      console.log(`[webhook] Texto de ${from}: "${text}"`);
      const replies = useAiConversation
        ? await handleIncomingMessageAI(from, text)
        : await handleIncomingMessage(from, text);
      console.log(`[webhook] Enviando ${replies.length} respuesta(s) a ${from}`);
      for (const reply of replies) {
        await sendWhatsAppText(from, reply);
      }
    }
  } catch (error) {
    console.error("[webhook] Error procesando mensaje entrante:", error);
  }
});

app.listen(config.port, () => {
  console.log(`[server] Escuchando en el puerto ${config.port}`);
});
