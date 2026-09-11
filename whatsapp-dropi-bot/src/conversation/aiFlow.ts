import { getOrCreateCustomer, saveCustomer, createOrderRecord, getLatestOrderForCustomer } from "../db.js";
import { dropiClient } from "../dropi/client.js";
import { runOrderAssistant } from "../ai/orderAssistant.js";
import type { Customer } from "../types.js";
import * as msg from "./messages.js";
import { isCancel, isConfirm } from "./textMatch.js";

async function createDropiOrderFromDraft(customer: Customer): Promise<string> {
  const draft = customer.draftOrder;
  try {
    const result = await dropiClient.createOrder({
      customerName: draft.customerName!,
      customerPhone: customer.phone,
      address: draft.address!,
      city: draft.city!,
      productName: draft.productName!,
      quantity: draft.quantity!,
    });

    createOrderRecord({
      customerPhone: customer.phone,
      dropiOrderId: result.dropiOrderId,
      productName: draft.productName!,
      quantity: draft.quantity!,
      address: draft.address!,
      city: draft.city!,
      status: result.status,
    });

    customer.awaitingConfirmation = false;
    customer.draftOrder = {};
    return msg.orderCreatedMessage(result.dropiOrderId);
  } catch (error) {
    console.error(`[aiFlow] Error creando el pedido en Dropi para ${customer.phone}:`, error);
    // Dejamos awaitingConfirmation en true para que pueda reintentar con CONFIRMAR
    // sin tener que volver a dictar todos los datos.
    return msg.ORDER_CREATION_FAILED;
  }
}

/**
 * Versión de handleIncomingMessage donde Claude maneja toda la conversación
 * (incluido juntar los datos del pedido de forma natural), pero la confirmación
 * final que dispara la creación real del pedido en Dropi sigue siendo un chequeo
 * determinístico en código — nunca algo que la IA decide por su cuenta — para
 * que un pedido nunca se cree por una mala interpretación del modelo.
 */
export async function handleIncomingMessageAI(phone: string, text: string): Promise<string[]> {
  const customer = getOrCreateCustomer(phone);

  if (customer.awaitingConfirmation) {
    if (isConfirm(text)) {
      const reply = await createDropiOrderFromDraft(customer);
      customer.aiHistory.push({ role: "user", content: text }, { role: "assistant", content: reply });
      saveCustomer(customer);
      return [reply];
    }

    if (isCancel(text)) {
      customer.awaitingConfirmation = false;
      customer.draftOrder = {};
      const reply = msg.ORDER_CANCELLED;
      customer.aiHistory.push({ role: "user", content: text }, { role: "assistant", content: reply });
      saveCustomer(customer);
      return [reply];
    }
    // Si no es ni CONFIRMAR ni CANCELAR, puede ser una corrección ("cambiá la
    // dirección a...") — seguimos por la IA en vez de bloquear con un mensaje fijo.
  }

  const result = await runOrderAssistant(customer.aiHistory, text);
  let reply: string;

  if (result.kind === "propose_order") {
    customer.draftOrder = result.order;
    customer.awaitingConfirmation = true;
    reply = msg.confirmSummary(result.order);
  } else if (result.kind === "check_status") {
    const order = getLatestOrderForCustomer(phone);
    reply = order ? msg.orderStatusMessage(order.dropiOrderId, order.status) : msg.NO_ORDERS_YET;
  } else {
    reply = result.text || msg.UNKNOWN_FALLBACK;
  }

  customer.aiHistory.push({ role: "user", content: text }, { role: "assistant", content: reply });
  saveCustomer(customer);
  return [reply];
}
