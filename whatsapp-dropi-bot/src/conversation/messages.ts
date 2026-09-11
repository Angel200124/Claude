import { config } from "../config.js";
import type { DraftOrder } from "../types.js";

export const WELCOME = `¡Hola! 👋 Soy el asistente automático de *${config.ai.businessName}*.

Escribí *PEDIDO* para hacer un pedido nuevo, o *ESTADO* para consultar el estado de tu último pedido.`;

export const UNKNOWN_FALLBACK = `No entendí muy bien eso 🤔

Escribí *PEDIDO* para hacer un pedido nuevo, o *ESTADO* para consultar el estado de tu último pedido.`;

export const ASK_PRODUCT = "¿Qué producto querés pedir?";
export const ASK_QUANTITY = "¿Cuántas unidades querés?";
export const ASK_QUANTITY_INVALID = "Decime la cantidad como número (por ejemplo: 1, 2, 3...).";
export const ASK_NAME = "¿A nombre de quién hacemos el envío?";
export const ASK_ADDRESS = "¿Cuál es la dirección de entrega? (calle, número, barrio)";
export const ASK_CITY = "¿En qué ciudad es la entrega?";

export function confirmSummary(draft: DraftOrder): string {
  return `Revisá que esté todo bien antes de confirmar:

🛒 Producto: ${draft.productName}
🔢 Cantidad: ${draft.quantity}
🙍 Nombre: ${draft.customerName}
📍 Dirección: ${draft.address}
🏙️ Ciudad: ${draft.city}

Escribí *CONFIRMAR* para generar el pedido, o *CANCELAR* para empezar de nuevo.`;
}

export const CONFIRM_INVALID = "Escribí *CONFIRMAR* para generar el pedido, o *CANCELAR* para cancelarlo.";

export const ORDER_CANCELLED = "Listo, cancelé el pedido. Escribí *PEDIDO* cuando quieras empezar de nuevo.";

/** Mensaje que ve el cliente apenas confirma el pedido — el envío lo coordina el dueño del negocio a mano. */
export const ORDER_RECEIVED_MANUAL = `¡Listo, pedido recibido! ✅

En breve te contactamos para coordinar el envío y pasarte el número de seguimiento.`;

export function ownerOrderNotification(orderRef: string, customerPhone: string, draft: DraftOrder): string {
  return `📦 *Pedido nuevo* (ref. ${orderRef})

🛒 Producto: ${draft.productName}
🔢 Cantidad: ${draft.quantity}
🙍 Cliente: ${draft.customerName} — wa.me/${customerPhone}
📍 Dirección: ${draft.address}
🏙️ Ciudad: ${draft.city}

Coordina el envío y mándale la guía al cliente.`;
}

export function orderStatusMessage(orderRef: string, status: string): string {
  return `Tu último pedido (*${orderRef}*) está en estado: *${friendlyStatus(status)}*.`;
}

export const NO_ORDERS_YET = "Todavía no tenés pedidos registrados. Escribí *PEDIDO* para hacer uno.";

/**
 * Mapeo de estados internos a un texto amigable en español. Por ahora todo
 * pedido nuevo queda en "pendiente" (el envío se coordina a mano) — este
 * diccionario queda listo por si más adelante se agrega alguna forma de
 * actualizar el estado de un pedido.
 */
const STATUS_LABELS: Record<string, string> = {
  pendiente: "Pedido recibido, en preparación para despacho",
  confirmado: "Pedido confirmado",
  "en preparacion": "En preparación",
  "en_preparacion": "En preparación",
  "en camino": "En camino",
  "en_camino": "En camino",
  entregado: "Entregado 📦✅",
  cancelado: "Cancelado",
};

export function friendlyStatus(rawStatus: string): string {
  const key = rawStatus.trim().toLowerCase();
  return STATUS_LABELS[key] ?? rawStatus;
}
