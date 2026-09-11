import { config } from "../config.js";
import { createOrderRecord } from "../db.js";
import { sendWhatsAppText } from "../whatsapp/client.js";
import type { DraftOrder } from "../types.js";
import * as msg from "../conversation/messages.js";

export interface SubmitOrderResult {
  success: boolean;
  reply: string;
}

function generateOrderRef(): string {
  return `PED-${Date.now().toString(36).toUpperCase()}`;
}

/**
 * Punto único donde se genera un pedido nuevo, para no duplicar esta lógica
 * entre el flujo de reglas fijas y el flujo con IA.
 *
 * Guarda el pedido en la base local y le avisa al dueño del negocio
 * (OWNER_NOTIFICATION_PHONE) para que lo cargue en el sistema de envíos que
 * use y le mande la guía al cliente.
 */
export async function submitOrder(customerPhone: string, draft: DraftOrder): Promise<SubmitOrderResult> {
  const orderRef = generateOrderRef();
  createOrderRecord({
    customerPhone,
    orderRef,
    productName: draft.productName!,
    quantity: draft.quantity!,
    address: draft.address!,
    city: draft.city!,
    status: "pendiente",
  });

  if (config.ownerNotificationPhone) {
    await sendWhatsAppText(config.ownerNotificationPhone, msg.ownerOrderNotification(orderRef, customerPhone, draft));
  } else {
    console.warn(`[orders] Pedido ${orderRef} guardado, pero OWNER_NOTIFICATION_PHONE no está configurado.`);
  }

  return { success: true, reply: msg.orderConfirmedMessage(draft) };
}
