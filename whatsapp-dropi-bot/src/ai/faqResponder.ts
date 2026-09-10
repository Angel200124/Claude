import Anthropic from "@anthropic-ai/sdk";
import { config } from "../config.js";

let client: Anthropic | null = null;

function getClient(): Anthropic {
  if (!client) {
    client = new Anthropic({ apiKey: config.ai.apiKey });
  }
  return client;
}

/**
 * Responde preguntas libres (fuera del flujo de pedido/estado) usando Claude,
 * cuando ENABLE_AI_FAQ=true. Se usa solo como respaldo para consultas tipo
 * "¿cuánto tarda el envío?" — nunca para tomar pedidos (eso lo maneja el
 * flujo determinístico en conversation/flow.ts, para no arriesgar datos mal
 * interpretados en una dirección o cantidad).
 */
export async function answerFaq(userMessage: string): Promise<string> {
  const system = [
    `Sos el asistente de WhatsApp de "${config.ai.businessName}".`,
    "Respondé siempre en español, en 2 o 3 oraciones como máximo, tono cordial y directo.",
    "Si no sabés algo con certeza, decilo en vez de inventar precios, tiempos o políticas.",
    "Recordale al cliente que puede escribir PEDIDO para hacer un pedido o ESTADO para consultar uno existente.",
    config.ai.faqContext ? `Información del negocio:\n${config.ai.faqContext}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");

  try {
    const response = await getClient().messages.create({
      model: config.ai.model,
      max_tokens: 300,
      output_config: { effort: "low" },
      system,
      messages: [{ role: "user", content: userMessage }],
    });

    const textBlock = response.content.find((b) => b.type === "text");
    return textBlock && textBlock.type === "text" ? textBlock.text.trim() : "";
  } catch (error) {
    if (error instanceof Anthropic.AuthenticationError) {
      console.error("[ai] API key de Anthropic inválida.");
    } else if (error instanceof Anthropic.RateLimitError) {
      console.error("[ai] Rate limit de la API de Anthropic alcanzado.");
    } else if (error instanceof Anthropic.APIError) {
      console.error(`[ai] Error de la API (${error.status}):`, error.message);
    } else {
      console.error("[ai] Error inesperado:", error);
    }
    return "";
  }
}
