import { getOrCreateCustomer, saveCustomer, getLatestOrderForCustomer } from "../db.js";
import { submitOrder } from "../orders/submitOrder.js";
import { runOrderAssistant } from "../ai/orderAssistant.js";
import type { Customer } from "../types.js";
import * as msg from "./messages.js";

async function createOrderFromDraft(customer: Customer): Promise<string> {
  const result = await submitOrder(customer.phone, customer.draftOrder);
  // Si falló, dejamos awaitingConfirmation en true para poder reintentar sin
  // volver a dictar todos los datos.
  if (result.success) {
    customer.awaitingConfirmation = false;
    customer.draftOrder = {};
  }
  return result.reply;
}

/**
 * Versión de handleIncomingMessage donde Claude maneja toda la conversación
 * de punta a punta, incluida la interpretación natural de la confirmación o
 * cancelación del pedido (no depende de una palabra literal como "CONFIRMAR").
 * Aun así, la creación real del pedido sigue siendo un paso determinístico en
 * código: solo ocurre cuando llega el tool_use confirm_order desde la IA,
 * nunca por un parseo de texto libre hecho a mano.
 */
export async function handleIncomingMessageAI(phone: string, text: string): Promise<string[]> {
  const customer = getOrCreateCustomer(phone);
  const pendingOrder = customer.awaitingConfirmation ? customer.draftOrder : undefined;

  const result = await runOrderAssistant(customer.aiHistory, text, pendingOrder);
  let reply: string;

  if (result.kind === "propose_order") {
    customer.draftOrder = result.order;
    customer.awaitingConfirmation = true;
    reply = msg.confirmSummary(result.order);
  } else if (result.kind === "check_status") {
    const order = getLatestOrderForCustomer(phone);
    reply = order ? msg.orderStatusMessage(order.orderRef, order.status) : msg.NO_ORDERS_YET;
  } else if (result.kind === "confirm_order") {
    reply = customer.awaitingConfirmation ? await createOrderFromDraft(customer) : msg.UNKNOWN_FALLBACK;
  } else if (result.kind === "cancel_order") {
    if (customer.awaitingConfirmation) {
      customer.awaitingConfirmation = false;
      customer.draftOrder = {};
      reply = msg.ORDER_CANCELLED;
    } else {
      reply = msg.UNKNOWN_FALLBACK;
    }
  } else {
    reply = result.text || msg.UNKNOWN_FALLBACK;
  }

  customer.aiHistory.push({ role: "user", content: text }, { role: "assistant", content: reply });
  saveCustomer(customer);
  return [reply];
}
