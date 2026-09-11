import { config } from "../config.js";
import { dropiClient } from "../dropi/client.js";
import { createOrderRecord } from "../db.js";
import { sendWhatsAppText } from "../whatsapp/client.js";
import type { DraftOrder } from "../types.js";
import * as msg from "../conversation/messages.js";

export interface SubmitOrderResult {
  /** false solo cuando había API de Dropi configurada y la llamada falló — hay que dejar reintentar. */
  success: boolean;
  reply: string;
}

function generateManualOrderRef(): string {
  return `MANUAL-${Date.now().toString(36).toUpperCase()}`;
}

/**
 * Punto único donde se decide cómo generar un pedido, para no duplicar esta
 * lógica entre el flujo de reglas fijas y el flujo con IA.
 *
 * - Si DROPI_API_KEY está configurada: crea el pedido en Dropi de verdad.
 * - Si no: lo guarda igual en la base local con estado "pendiente" y le
 *   avisa al dueño del negocio (OWNER_NOTIFICATION_PHONE) para que lo cargue
 *   a mano y le mande la guía al cliente. El día que se agregue la API key,
 *   este mismo código pasa a crear los pedidos solo, sin más cambios.
 */
export async function submitOrder(customerPhone: string, draft: DraftOrder): Promise<SubmitOrderResult> {
  if (config.dropi.apiKey) {
    try {
      const result = await dropiClient.createOrder({
        customerName: draft.customerName!,
        customerPhone,
        address: draft.address!,
        city: draft.city!,
        productName: draft.productName!,
        quantity: draft.quantity!,
      });

      createOrderRecord({
        customerPhone,
        dropiOrderId: result.dropiOrderId,
        productName: draft.productName!,
        quantity: draft.quantity!,
        address: draft.address!,
        city: draft.city!,
        status: result.status,
      });

      return { success: true, reply: msg.orderCreatedMessage(result.dropiOrderId) };
    } catch (error) {
      console.error(`[orders] Error creando el pedido en Dropi para ${customerPhone}:`, error);
      return { success: false, reply: msg.ORDER_CREATION_FAILED };
    }
  }

  // Modo manual: sin Dropi conectada todavía.
  const manualRef = generateManualOrderRef();
  createOrderRecord({
    customerPhone,
    dropiOrderId: manualRef,
    productName: draft.productName!,
    quantity: draft.quantity!,
    address: draft.address!,
    city: draft.city!,
    status: "pendiente",
  });

  if (config.ownerNotificationPhone) {
    await sendWhatsAppText(config.ownerNotificationPhone, msg.ownerOrderNotification(manualRef, customerPhone, draft));
  } else {
    console.warn(`[orders] Pedido ${manualRef} guardado, pero OWNER_NOTIFICATION_PHONE no está configurado.`);
  }

  return { success: true, reply: msg.ORDER_RECEIVED_MANUAL };
}
