import { getOrCreateCustomer, saveCustomer, getLatestOrderForCustomer } from "../db.js";
import { submitOrder } from "../orders/submitOrder.js";
import { runOrderAssistant } from "../ai/orderAssistant.js";
import type { Customer } from "../types.js";
import * as msg from "./messages.js";
import { isCancel, isConfirm } from "./textMatch.js";

async function createDropiOrderFromDraft(customer: Customer): Promise<string> {
  const result = await submitOrder(customer.phone, customer.draftOrder);
  // Si falló (solo pasa cuando Dropi está configurada y la llamada dio
  // error), dejamos awaitingConfirmation en true para poder reintentar con
  // CONFIRMAR sin volver a dictar todos los datos.
  if (result.success) {
    customer.awaitingConfirmation = false;
    customer.draftOrder = {};
  }
  return result.reply;
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
