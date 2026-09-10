import cron from "node-cron";
import { config } from "../config.js";
import { getOpenOrders, updateOrderStatus } from "../db.js";
import { dropiClient } from "./client.js";
import { sendWhatsAppText } from "../whatsapp/client.js";
import { statusUpdateMessage } from "../conversation/messages.js";

async function checkOrdersOnce(): Promise<void> {
  const openOrders = getOpenOrders(config.dropi.terminalStatuses);
  if (openOrders.length === 0) return;

  console.log(`[poller] Revisando ${openOrders.length} pedido(s) abierto(s) en Dropi...`);

  for (const order of openOrders) {
    try {
      const currentStatus = await dropiClient.getOrderStatus(order.dropiOrderId);
      console.log(`[poller] Pedido ${order.dropiOrderId}: estado actual "${currentStatus}"`);

      const changed = currentStatus.trim().toLowerCase() !== order.status.trim().toLowerCase();
      if (changed) {
        await sendWhatsAppText(order.customerPhone, statusUpdateMessage(order.dropiOrderId, currentStatus));
        updateOrderStatus(order.id, currentStatus, true);
      } else {
        // Guardamos igual por si el texto crudo cambió de mayúsculas/espacios.
        updateOrderStatus(order.id, currentStatus, false);
      }
    } catch (error) {
      console.error(`[poller] Error consultando el pedido ${order.dropiOrderId} en Dropi:`, error);
      // Seguimos con el resto de los pedidos aunque uno falle.
    }
  }
}

export function startStatusPoller(): void {
  const minutes = Math.max(1, config.polling.intervalMinutes);
  const cronExpression = `*/${minutes} * * * *`;

  console.log(`[poller] Chequeo de estados de Dropi cada ${minutes} minuto(s).`);

  // Una corrida al arrancar, para no esperar el primer intervalo.
  checkOrdersOnce().catch((err) => console.error("[poller] Error en la corrida inicial:", err));

  cron.schedule(cronExpression, () => {
    checkOrdersOnce().catch((err) => console.error("[poller] Error en la corrida programada:", err));
  });
}
