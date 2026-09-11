import { getOrCreateCustomer, saveCustomer, getLatestOrderForCustomer } from "../db.js";
import { submitOrder } from "../orders/submitOrder.js";
import { runOrderAssistant } from "../ai/orderAssistant.js";
import type { DraftOrder } from "../types.js";
import * as msg from "./messages.js";

/**
 * Versión de handleIncomingMessage donde Lucía (Claude) maneja toda la
 * conversación de punta a punta: persuade, junta los datos de entrega de
 * forma natural y, en cuanto los tiene, genera el pedido — sin un paso extra
 * de "confirmar el resumen", porque el cliente ya aceptó proceder antes de
 * dar esos datos (ver el proceso de venta en ai/orderAssistant.ts).
 *
 * Aun así, la creación real del pedido sigue siendo un paso determinístico en
 * código: solo ocurre cuando llega el tool_use create_order desde la IA, con
 * todos los datos requeridos presentes — nunca por texto libre parseado a
 * mano ni por una decisión de la IA que no pase por esa herramienta.
 */
export async function handleIncomingMessageAI(phone: string, text: string): Promise<string[]> {
  const customer = getOrCreateCustomer(phone);

  const result = await runOrderAssistant(customer.aiHistory, text);
  let reply: string;

  if (result.kind === "create_order") {
    reply = await createOrder(phone, result.order);
  } else if (result.kind === "check_status") {
    const order = getLatestOrderForCustomer(phone);
    reply = order ? msg.orderStatusMessage(order.orderRef, order.status) : msg.NO_ORDERS_YET;
  } else {
    reply = result.text || msg.UNKNOWN_FALLBACK;
  }

  customer.aiHistory.push({ role: "user", content: text }, { role: "assistant", content: reply });
  saveCustomer(customer);
  return [reply];
}

async function createOrder(phone: string, order: DraftOrder): Promise<string> {
  const result = await submitOrder(phone, order);
  return result.reply;
}
