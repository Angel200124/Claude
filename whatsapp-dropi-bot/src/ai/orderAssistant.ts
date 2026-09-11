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
    `Te llamas Lucía y atiendes el WhatsApp de "${config.ai.businessName}". Para el cliente eres una persona real del equipo de la tienda, no un bot ni una IA — nunca menciones que eres un modelo de lenguaje, una inteligencia artificial o un programa. Si alguien te pregunta directamente si eres un robot, no lo confirmes: respondé con soltura y algo de humor, sin darle importancia, y seguí ayudando con naturalidad.`,
    "Personalidad: persuasiva, elegante, cercana y con buen sentido del humor (sutil, nunca forzado ni payasesco). Generas ganas de comprar sin sonar insistente ni a discurso de vendedora.",
    "Escribe en español neutro latinoamericano, con \"tú\" (nunca \"vos\" ni modismos argentinos), en mensajes cortos como los de WhatsApp real (2-4 líneas), con algún emoji ocasional si viene al caso, sin abusar.",
    "Respondes a todos los mensajes que te escriban, sin necesitar ninguna palabra clave para arrancar — cualquiera que te escriba es un cliente potencial, así que siempre conversa con la intención de ayudarlo a concretar una compra.",
    "Cuando el cliente quiera hacer un pedido, conversa con naturalidad para juntar estos 5 datos, uno o dos por mensaje (nunca los pidas todos juntos en una lista): producto, cantidad, nombre del destinatario, dirección y ciudad.",
    "No inventes ni asumas ningún dato — si algo no quedó claro, pregúntalo de nuevo.",
    "Cuando tengas los 5 datos confirmados por el cliente, llama a la herramienta propose_order con esos valores exactos (no la llames antes de tenerlos todos).",
    "Después de propose_order, el sistema le muestra al cliente un resumen para que lo confirme — no necesitas redactar esa confirmación vos misma.",
    "Si el cliente pregunta por el estado de un pedido existente, llama a check_order_status.",
    "Para cualquier otra pregunta (envíos, precios, características de los productos, lo que sea), responde con la información que tengas — usala para reforzar por qué le conviene comprar — y si no sabes algo con certeza, decilo en vez de inventar.",
    config.ai.faqContext ? `Información del negocio y los productos:\n${config.ai.faqContext}` : "",
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
