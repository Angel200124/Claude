import Anthropic from "@anthropic-ai/sdk";
import { config } from "../config.js";
import type { AiChatMessage, DraftOrder } from "../types.js";

let client: Anthropic | null = null;

function getClient(): Anthropic {
  if (!client) {
    client = new Anthropic({ apiKey: config.ai.apiKey });
  }
  return client;
}

const PROPOSE_ORDER_TOOL: Anthropic.Tool = {
  name: "propose_order",
  description:
    "Llamalo únicamente cuando ya tengas los 5 datos del pedido dichos explícitamente por el " +
    "cliente en la conversación (nunca inventados ni adivinados). Si falta o es ambiguo alguno, " +
    "no llames a esta herramienta — preguntale al cliente primero.",
  strict: true,
  input_schema: {
    type: "object",
    properties: {
      product_name: { type: "string", description: "Producto que quiere pedir, tal como lo dijo el cliente." },
      quantity: { type: "integer", minimum: 1, description: "Cantidad de unidades." },
      customer_name: { type: "string", description: "Nombre para el destinatario del envío." },
      address: { type: "string", description: "Dirección de entrega (calle, número, barrio)." },
      city: { type: "string", description: "Ciudad de entrega." },
    },
    required: ["product_name", "quantity", "customer_name", "address", "city"],
    additionalProperties: false,
  },
};

const CHECK_ORDER_STATUS_TOOL: Anthropic.Tool = {
  name: "check_order_status",
  description: "Llamalo cuando el cliente pregunte por el estado o seguimiento de un pedido que ya hizo.",
  strict: true,
  input_schema: { type: "object", properties: {}, required: [], additionalProperties: false },
};

export type AssistantResult =
  | { kind: "text"; text: string }
  | { kind: "propose_order"; order: DraftOrder }
  | { kind: "check_status" };

function buildSystemPrompt(): string {
  return [
    `Sos el asistente de WhatsApp de "${config.ai.businessName}". Atendés pedidos y consultas por acá.`,
    "Respondé siempre en español rioplatense/neutro, en mensajes cortos (2-4 líneas), tono cordial y directo — como alguien de la tienda escribiendo por WhatsApp, no un formulario.",
    "Cuando el cliente quiera hacer un pedido, conversá con naturalidad para juntar estos 5 datos, uno o dos por mensaje (no los pidas todos de una en una lista): producto, cantidad, nombre del destinatario, dirección y ciudad.",
    "No inventes ni asumas ningún dato — si algo no quedó claro, preguntalo de nuevo.",
    "Cuando tengas los 5 datos confirmados por el cliente, llamá a la herramienta propose_order con esos valores exactos (no la llames antes de tenerlos todos).",
    "Después de propose_order, el sistema le muestra al cliente un resumen para que lo confirme — vos no necesitás redactar esa confirmación.",
    "Si el cliente pregunta por el estado de un pedido existente, llamá a check_order_status.",
    "Para cualquier otra pregunta (envíos, precios, horarios, lo que sea), respondé con la información que tengas; si no sabés algo con certeza, decilo en vez de inventar.",
    config.ai.faqContext ? `Información del negocio:\n${config.ai.faqContext}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");
}

function toApiMessages(history: AiChatMessage[], userMessage: string): Anthropic.MessageParam[] {
  return [...history.map((m) => ({ role: m.role, content: m.content })), { role: "user" as const, content: userMessage }];
}

/**
 * Le pasa el mensaje del cliente a Claude junto con el historial reciente.
 * Devuelve texto libre, o una acción estructurada (propose_order / check_status)
 * cuando el modelo decide llamar a esa herramienta.
 */
export async function runOrderAssistant(
  history: AiChatMessage[],
  userMessage: string,
): Promise<AssistantResult> {
  try {
    const response = await getClient().messages.create({
      model: config.ai.model,
      max_tokens: 1024,
      output_config: { effort: "low" },
      system: buildSystemPrompt(),
      tools: [PROPOSE_ORDER_TOOL, CHECK_ORDER_STATUS_TOOL],
      messages: toApiMessages(history, userMessage),
    });

    const toolUse = response.content.find((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");

    if (toolUse?.name === "propose_order") {
      const input = toolUse.input as {
        product_name: string;
        quantity: number;
        customer_name: string;
        address: string;
        city: string;
      };
      return {
        kind: "propose_order",
        order: {
          productName: input.product_name,
          quantity: input.quantity,
          customerName: input.customer_name,
          address: input.address,
          city: input.city,
        },
      };
    }

    if (toolUse?.name === "check_order_status") {
      return { kind: "check_status" };
    }

    const textBlock = response.content.find((b): b is Anthropic.TextBlock => b.type === "text");
    return { kind: "text", text: textBlock?.text.trim() || "" };
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
    return { kind: "text", text: "" };
  }
}
