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

/** "muy buenos días" / "muy buenas tardes" / "muy buenas noches" según la hora actual en Ecuador. */
function timeGreetingEcuador(): string {
  const hour = Number(
    new Intl.DateTimeFormat("en-US", {
      hour: "numeric",
      hour12: false,
      timeZone: "America/Guayaquil",
    }).format(new Date()),
  );
  if (hour < 12) return "muy buenos días";
  if (hour < 19) return "muy buenas tardes";
  return "muy buenas noches";
}

const DEPOSIT_RATE = 0.1;

/**
 * Mensaje de cierre elegante que ve el cliente cuando Lucía (modo IA) genera
 * el pedido — varía según si es envío a domicilio o retiro en agencia.
 * Siempre termina con un saludo según la hora (Ecuador) y el emoji 🛍️, para
 * que el dueño del negocio identifique de un vistazo que se cerró una venta.
 */
export function orderConfirmedMessage(draft: DraftOrder): string {
  const greeting = timeGreetingEcuador();

  if (draft.deliveryMethod === "agencia") {
    const deposit = draft.totalPrice ? (draft.totalPrice * DEPOSIT_RATE).toFixed(2) : null;
    const depositLine = deposit
      ? `Recuerde realizar el abono del 10% ($${deposit}) para reservar su retiro en agencia.`
      : "Recuerde realizar el abono del 10% para reservar su retiro en agencia.";
    return `Perfecto, Estimado/a, queda registrado su pedido. ${depositLine} En cuanto lo confirmemos, coordinamos la fecha de retiro.

Que tenga ${greeting} 🛍️`;
  }

  return `Queda registrado, Estimado/a. Su pedido es con *ENVÍO GRATIS* y *PAGA AL RECIBIR* — en breve le confirmamos la fecha de entrega.

Que tenga ${greeting} 🛍️`;
}

export function ownerOrderNotification(orderRef: string, customerPhone: string, draft: DraftOrder): string {
  const deposit = draft.totalPrice ? (draft.totalPrice * DEPOSIT_RATE).toFixed(2) : null;
  const lines = [
    `📦 *Pedido nuevo* (ref. ${orderRef})`,
    "",
    `🛒 Producto: ${draft.productName}`,
    `🔢 Cantidad: ${draft.quantity}`,
    draft.totalPrice ? `💵 Total: $${draft.totalPrice.toFixed(2)}` : "",
    `🙍 Cliente: ${draft.customerName} — wa.me/${customerPhone}`,
    draft.contactPhone ? `📞 Contacto: ${draft.contactPhone}` : "",
    `📍 Dirección: ${draft.address}`,
    `🏙️ Ciudad: ${draft.city}`,
    draft.reference ? `🧭 Referencia: ${draft.reference}` : "",
    draft.locationLink ? `📌 Ubicación: ${draft.locationLink}` : "",
    "",
    draft.deliveryMethod === "agencia"
      ? `Retiro en agencia — verificá el abono del 10%${deposit ? ` ($${deposit})` : ""} antes de coordinar el retiro.`
      : "Envío a domicilio, gratis y pago al recibir. Coordina el envío y mándale la guía al cliente.",
  ];
  return lines.filter(Boolean).join("\n");
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
