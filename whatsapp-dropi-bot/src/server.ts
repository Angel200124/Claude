import express from "express";
import { config, assertRequiredConfig } from "./config.js";
import { isMessageProcessed, markMessageProcessed } from "./db.js";
import { handleIncomingMessage } from "./conversation/flow.js";
import { sendWhatsAppText } from "./whatsapp/client.js";
import { startStatusPoller } from "./dropi/statusPoller.js";

assertRequiredConfig();

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

  try {
    const entry = req.body?.entry?.[0];
    const change = entry?.changes?.[0];
    const value = change?.value;
    const messages = value?.messages as any[] | undefined;

    if (!messages || messages.length === 0) {
      // Puede ser un evento de "status" (entregado/leído), no un mensaje. Lo ignoramos.
      return;
    }

    for (const message of messages) {
      const messageId: string | undefined = message.id;
      if (messageId) {
        if (isMessageProcessed(messageId)) continue; // reintento de Meta, ya lo manejamos
        markMessageProcessed(messageId);
      }

      const from: string = message.from;
      if (message.type !== "text") {
        await sendWhatsAppText(
          from,
          "Por ahora solo puedo leer mensajes de texto 🙏. Escribime tu pedido o consulta como texto.",
        );
        continue;
      }

      const text: string = message.text?.body ?? "";
      const replies = await handleIncomingMessage(from, text);
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
  startStatusPoller();
});
