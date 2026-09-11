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

export function orderCreatedMessage(dropiOrderId: string): string {
  return `¡Pedido generado! ✅
Número de seguimiento: *${dropiOrderId}*

Te voy a avisar por acá apenas haya novedades con el envío.`;
}

export const ORDER_CREATION_FAILED =
  "Uy, tuve un problema para generar tu pedido en el sistema 😕. Ya le avisé al equipo — probá de nuevo en unos minutos o escribinos directamente.";

/**
 * Se usa en vez de orderCreatedMessage cuando todavía no está conectada la
 * API de Dropi (DROPI_API_KEY vacía) — el pedido se guarda igual y se le
 * avisa al dueño del negocio para que lo cargue a mano (ver ownerOrderNotification).
 */
export const ORDER_RECEIVED_MANUAL = `¡Listo, pedido recibido! ✅

En breve te contactamos para coordinar el envío y pasarte el número de seguimiento.`;

export function ownerOrderNotification(orderRef: string, customerPhone: string, draft: DraftOrder): string {
  return `📦 *Pedido nuevo* (ref. ${orderRef})

🛒 Producto: ${draft.productName}
🔢 Cantidad: ${draft.quantity}
🙍 Cliente: ${draft.customerName} — wa.me/${customerPhone}
📍 Dirección: ${draft.address}
🏙️ Ciudad: ${draft.city}

Todavía no está conectada la API de Dropi — cargalo a mano y mandale la guía al cliente.`;
}

export function orderStatusMessage(dropiOrderId: string, status: string): string {
  return `Tu último pedido (*${dropiOrderId}*) está en estado: *${friendlyStatus(status)}*.`;
}

export const NO_ORDERS_YET = "Todavía no tenés pedidos registrados. Escribí *PEDIDO* para hacer uno.";

/**
 * Mapeo de estados "crudos" de Dropi a un texto amigable en español.
 * Los nombres exactos de estados dependen de tu cuenta de Dropi — ajustá
 * las claves de este diccionario una vez que veas los valores reales que
 * te devuelve la API (mirá los logs del poller, que imprime el estado crudo).
 */
const STATUS_LABELS: Record<string, string> = {
  pendiente: "Pedido recibido, en preparación para despacho",
  creado: "Pedido creado",
  confirmado: "Pedido confirmado",
  "en bodega": "En bodega",
  "en preparacion": "En preparación",
  "en_preparacion": "En preparación",
  "en transito": "En camino",
  "en_transito": "En camino",
  "en reparto": "En reparto (llega hoy o mañana)",
  "en_reparto": "En reparto (llega hoy o mañana)",
  entregado: "Entregado 📦✅",
  novedad: "Hay una novedad con el envío — te vamos a contactar",
  devuelto: "Devuelto al remitente",
  cancelado: "Cancelado",
};

export function friendlyStatus(rawStatus: string): string {
  const key = rawStatus.trim().toLowerCase();
  return STATUS_LABELS[key] ?? rawStatus;
}

export function statusUpdateMessage(dropiOrderId: string, newStatus: string): string {
  return `📦 Actualización de tu pedido *${dropiOrderId}*:

${friendlyStatus(newStatus)}`;
}
