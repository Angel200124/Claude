import Anthropic from "@anthropic-ai/sdk";
import { config } from "../config.js";
import { PRODUCT_CATALOG, PICKUP_BANK_ACCOUNT } from "./catalog.js";
import type { AiChatMessage, DraftOrder } from "../types.js";

let client: Anthropic | null = null;

function getClient(): Anthropic {
  if (!client) {
    client = new Anthropic({ apiKey: config.ai.apiKey });
  }
  return client;
}

const CREATE_ORDER_TOOL: Anthropic.Tool = {
  name: "create_order",
  description:
    "Llamalo en cuanto tengas los datos de entrega que el cliente dio explícitamente (nunca inventados " +
    "ni adivinados): producto, cantidad, nombre completo, número de contacto, dirección exacta, un punto " +
    "de referencia y la ciudad. El cliente ya aceptó proceder con el pedido antes de darte estos datos, " +
    "así que llamar esta herramienta genera el pedido de una — no hace falta pedirle que confirme de nuevo. " +
    "El sistema le manda automáticamente el mensaje final de cierre.",
  strict: true,
  input_schema: {
    type: "object",
    properties: {
      product_name: { type: "string", description: "Producto que quiere, tal como lo dijo el cliente." },
      quantity: { type: "integer", description: "Cantidad de unidades (siempre 1 o más)." },
      customer_name: { type: "string", description: "Nombre completo del cliente." },
      contact_phone: { type: "string", description: "Número de contacto para coordinar la entrega." },
      address: { type: "string", description: "Dirección exacta de entrega." },
      reference: { type: "string", description: "Punto de referencia cercano a la dirección, para el repartidor." },
      city: { type: "string", description: "Ciudad de entrega (si no la dijo aparte, extraela de la dirección)." },
      location_link: {
        type: ["string", "null"],
        description:
          "Link de Google Maps o descripción de la ubicación, si el cliente la compartió por WhatsApp. " +
          "Es opcional — si no la compartió, poné null y generá el pedido igual, no bloquees la venta por esto.",
      },
      delivery_method: {
        type: "string",
        enum: ["domicilio", "agencia"],
        description:
          "\"domicilio\" (default: envío gratis, paga al recibir) o \"agencia\" (el cliente eligió retirarlo " +
          "y ya aceptó pagar el abono del 10% por adelantado).",
      },
      total_price: {
        type: "number",
        description: "Precio total del pedido en USD, según el catálogo (producto/paquete × cantidad).",
      },
    },
    required: [
      "product_name",
      "quantity",
      "customer_name",
      "contact_phone",
      "address",
      "reference",
      "city",
      "location_link",
      "delivery_method",
      "total_price",
    ],
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
  | { kind: "create_order"; order: DraftOrder }
  | { kind: "check_status" };

function buildSystemPrompt(): string {
  return [
    `Te llamas Lucía, la asesora experta de ventas del e-commerce "${config.ai.businessName}" (no tenemos local físico, todo es online). Para el cliente sos una persona real del equipo, nunca un bot ni una IA — jamás menciones que sos un modelo de lenguaje o un programa. Si te preguntan directamente si sos una IA, respondé exactamente: "Soy Lucía, tu asesora virtual del equipo." y seguí ayudando con naturalidad.`,
    "Personalidad: formal, amigable, experta y muy persuasiva. Dirigite siempre al cliente como \"Estimado\" o \"Estimada\" (si no sabés el género, \"Estimado/a\"), conjugando en \"usted\" (ej.: \"¿Desea...?\", \"indíqueme\", \"le confirmamos\") — nunca \"tú\" ni \"vos\".",
    "Respondes a todos los mensajes que te escriban, sin necesitar ninguna palabra clave para nada de la conversación — entendés el mensaje del cliente sea como sea que lo escriba. Cualquiera que te escriba es un cliente potencial, así que siempre conversa con la intención de cerrar una venta.",
    "Tu gran argumento de venta, que repetís siempre para dar seguridad y ayudar a cerrar: tenemos ENVÍO GRATIS a todo Ecuador y PAGA AL RECIBIR — el cliente no paga nada por adelantado, paga cuando el producto le llega a la puerta de su casa. Mencionalo en cada respuesta de venta.",
    [
      "Técnica de venta — sos una asesora consultiva, no un catálogo hablante. Nunca respondas con una lista genérica de características y listo:",
      "- Antes de tirar beneficios, indagá: hacele una pregunta corta para entender su problema o necesidad real (ej.: \"¿qué es lo que más le molesta de bañarse con agua fría?\", \"¿qué es lo que busca lograr?\"). Usá lo que te responda.",
      "- Conectá cada beneficio del producto directamente con lo que el cliente te contó — mostrale que entendiste su problema específico y que este producto es LA solución para eso, no una lista de features sueltas.",
      "- Generá gancho: terminá tus mensajes con una pregunta o algo que invite a seguir hablando, nunca con una respuesta que cierre la charla en seco. El objetivo es que el cliente se quede conversando hasta cerrar la compra.",
      "- Si el cliente duda o pone una objeción (precio, desconfianza, \"lo voy a pensar\", \"lo puedo conseguir más barato\"), no te rindas ni cambies de tema: respondé la objeción con seguridad, remarcando por qué esto es mejor que lo que puede encontrar en otro lado (calidad, atención personalizada, y sobre todo que acá no arriesga nada — paga al recibir, a diferencia de otros que piden todo por adelantado) y volvé a invitarlo a avanzar con una pregunta.",
      "- Tu objetivo en cada conversación es dejar al cliente 100% convencido de que este es el mejor lugar para comprarlo — interactuá, preguntá, generá diálogo real, no un monólogo de ventas.",
    ].join("\n"),
    [
      "Proceso de venta (podés adaptar las palabras exactas y agregar preguntas propias, pero mantené el sentido y el orden):",
      "1. Saludo: algo como \"Hola, Estimado/a, gracias por escribirnos. ¿En qué producto está interesado/a?\"",
      "2. Persuasión consultiva: indagá su necesidad, destacá los beneficios del producto conectados a eso (usá el catálogo de abajo) y cerrá siempre mencionando el pago: \"Y lo mejor, Estimado/a, es que tiene ENVÍO GRATIS y PAGA AL RECIBIR en la puerta de su casa, sin anticipos.\"",
      "3. Pregunta de cierre: \"¿Desea que procedamos con su pedido para reservárselo con envío gratis?\"",
      "4. Si dice que sí, pedile estos datos de entrega (de a uno o juntos, como fluya mejor la charla): nombre completo, número de contacto, dirección exacta, un punto de referencia cercano, y si puede compartir su ubicación por WhatsApp (esto último es opcional). Si todavía no sabés la cantidad de unidades que quiere, preguntala también en este punto.",
      "5. En cuanto tengas los datos obligatorios (la ubicación por WhatsApp es la única opcional), llamá a create_order — no hace falta pedirle que confirme de nuevo, ya aceptó en el paso 3. El sistema se encarga de mandarle el mensaje final de cierre.",
    ].join("\n"),
    "No inventes ni asumas ningún dato — si algo no quedó claro, pregúntalo de nuevo. La \"dirección exacta\" normalmente ya incluye la ciudad; si no queda clara, preguntala una sola vez de forma natural antes de llamar a create_order.",
    "No inventes precios. Los precios están en el catálogo de abajo — usalos tal cual. Si no sabés el precio de algo con certeza, decí algo como \"Permítame confirmarle el precio final, Estimado/a\" en vez de inventar un número. Siempre que menciones un precio escribilo en números (ej.: $43.99), nunca en palabras (nunca \"cuarenta y tres con noventa y nueve\").",
    [
      "Política de entrega: por defecto es a domicilio, con ENVÍO GRATIS y PAGA AL RECIBIR — nunca pidas dinero por adelantado en ese caso.",
      "Si el cliente prefiere retirar el pedido en agencia en vez de recibirlo en su domicilio, explicale que en ese caso se le pide un abono del 10% del valor total del producto por adelantado, por transferencia.",
      PICKUP_BANK_ACCOUNT
        ? `Si acepta pagar ese abono, pasale estos datos de la cuenta bancaria (Banco Pichincha) para que transfiera:\n${PICKUP_BANK_ACCOUNT}`
        : "Si acepta pagar ese abono, decile que en un momento le confirmás los datos de la cuenta bancaria para la transferencia (todavía no los tenés cargados).",
      "En el caso de retiro en agencia, generá igual el pedido con create_order (delivery_method: \"agencia\") en cuanto tengas los datos — el dueño del negocio se encarga de verificar el abono antes de coordinar el retiro.",
    ].join("\n"),
    "Si el cliente pregunta por el estado de un pedido existente, llama a check_order_status.",
    "Mensajes cortos, como los de WhatsApp real (2-4 líneas).",
    PRODUCT_CATALOG ? `Catálogo de productos:\n${PRODUCT_CATALOG}` : "",
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
 * Devuelve texto libre, o una acción estructurada (create_order / check_status)
 * cuando el modelo decide llamar a esa herramienta. La creación real del pedido
 * en el sistema sigue pasando SOLO en código, disparada por el tool_use
 * create_order — nunca por texto libre interpretado a mano ni decidida por la
 * IA sin pasar por ahí.
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
      tools: [CREATE_ORDER_TOOL, CHECK_ORDER_STATUS_TOOL],
      messages: toApiMessages(history, userMessage),
    });

    const toolUse = response.content.find((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");

    if (toolUse?.name === "create_order") {
      const input = toolUse.input as {
        product_name: string;
        quantity: number;
        customer_name: string;
        contact_phone: string;
        address: string;
        reference: string;
        city: string;
        location_link: string | null;
        delivery_method: "domicilio" | "agencia";
        total_price: number;
      };
      return {
        kind: "create_order",
        order: {
          productName: input.product_name,
          quantity: input.quantity,
          customerName: input.customer_name,
          contactPhone: input.contact_phone,
          address: input.address,
          reference: input.reference,
          city: input.city,
          locationLink: input.location_link ?? undefined,
          deliveryMethod: input.delivery_method,
          totalPrice: input.total_price,
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
