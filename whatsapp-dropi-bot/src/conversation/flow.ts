import { getOrCreateCustomer, saveCustomer, getLatestOrderForCustomer } from "../db.js";
import { submitOrder } from "../orders/submitOrder.js";
import { ConversationState, type Customer } from "../types.js";
import * as msg from "./messages.js";
import { normalize, isCancel, isConfirm } from "./textMatch.js";

function isPedidoTrigger(text: string): boolean {
  const n = normalize(text);
  return ["pedido", "comprar", "ordenar", "quiero pedir", "hacer un pedido"].some((k) => n.includes(k));
}

function isEstadoTrigger(text: string): boolean {
  const n = normalize(text);
  return ["estado", "seguimiento", "tracking", "donde esta mi pedido"].some((k) => n.includes(k));
}

function isGreeting(text: string): boolean {
  const n = normalize(text);
  return ["hola", "buenas", "buenos dias", "buenas tardes", "buenas noches", "menu", "ayuda"].some((k) =>
    n.includes(k),
  );
}

function resetToIdle(customer: Customer): void {
  customer.state = ConversationState.IDLE;
  customer.draftOrder = {};
}

async function handleIdle(customer: Customer, text: string): Promise<string[]> {
  if (isPedidoTrigger(text)) {
    customer.state = ConversationState.AWAITING_PRODUCT;
    customer.draftOrder = {};
    return [msg.ASK_PRODUCT];
  }

  if (isEstadoTrigger(text)) {
    const order = getLatestOrderForCustomer(customer.phone);
    return [order ? msg.orderStatusMessage(order.dropiOrderId, order.status) : msg.NO_ORDERS_YET];
  }

  if (isGreeting(text)) {
    return [msg.WELCOME];
  }

  return [msg.UNKNOWN_FALLBACK];
}

async function createDropiOrder(customer: Customer): Promise<string[]> {
  const result = await submitOrder(customer.phone, customer.draftOrder);
  // Si falló (solo pasa cuando Dropi está configurada y la llamada dio error),
  // dejamos al cliente en AWAITING_CONFIRM para que pueda reintentar con
  // CONFIRMAR sin tener que cargar todos los datos de nuevo.
  if (result.success) {
    resetToIdle(customer);
  }
  return [result.reply];
}

/**
 * Procesa un mensaje entrante y devuelve la(s) respuesta(s) a enviar por WhatsApp.
 * Efectos secundarios: persiste el estado de la conversación y, si corresponde,
 * crea el pedido en Dropi.
 */
export async function handleIncomingMessage(phone: string, text: string): Promise<string[]> {
  const customer = getOrCreateCustomer(phone);

  let replies: string[];

  switch (customer.state) {
    case ConversationState.IDLE:
      replies = await handleIdle(customer, text);
      break;

    case ConversationState.AWAITING_PRODUCT:
      if (isCancel(text)) {
        resetToIdle(customer);
        replies = [msg.ORDER_CANCELLED];
      } else {
        customer.draftOrder.productName = text.trim();
        customer.state = ConversationState.AWAITING_QUANTITY;
        replies = [msg.ASK_QUANTITY];
      }
      break;

    case ConversationState.AWAITING_QUANTITY: {
      if (isCancel(text)) {
        resetToIdle(customer);
        replies = [msg.ORDER_CANCELLED];
        break;
      }
      const quantity = Number.parseInt(text.trim(), 10);
      if (!Number.isFinite(quantity) || quantity <= 0) {
        replies = [msg.ASK_QUANTITY_INVALID];
      } else {
        customer.draftOrder.quantity = quantity;
        customer.state = ConversationState.AWAITING_NAME;
        replies = [msg.ASK_NAME];
      }
      break;
    }

    case ConversationState.AWAITING_NAME:
      if (isCancel(text)) {
        resetToIdle(customer);
        replies = [msg.ORDER_CANCELLED];
      } else {
        customer.draftOrder.customerName = text.trim();
        customer.state = ConversationState.AWAITING_ADDRESS;
        replies = [msg.ASK_ADDRESS];
      }
      break;

    case ConversationState.AWAITING_ADDRESS:
      if (isCancel(text)) {
        resetToIdle(customer);
        replies = [msg.ORDER_CANCELLED];
      } else {
        customer.draftOrder.address = text.trim();
        customer.state = ConversationState.AWAITING_CITY;
        replies = [msg.ASK_CITY];
      }
      break;

    case ConversationState.AWAITING_CITY:
      if (isCancel(text)) {
        resetToIdle(customer);
        replies = [msg.ORDER_CANCELLED];
      } else {
        customer.draftOrder.city = text.trim();
        customer.state = ConversationState.AWAITING_CONFIRM;
        replies = [msg.confirmSummary(customer.draftOrder)];
      }
      break;

    case ConversationState.AWAITING_CONFIRM:
      if (isCancel(text)) {
        resetToIdle(customer);
        replies = [msg.ORDER_CANCELLED];
      } else if (isConfirm(text)) {
        replies = await createDropiOrder(customer);
      } else {
        replies = [msg.CONFIRM_INVALID];
      }
      break;

    default:
      resetToIdle(customer);
      replies = [msg.WELCOME];
  }

  saveCustomer(customer);
  return replies;
}
