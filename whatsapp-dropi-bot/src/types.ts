export enum ConversationState {
  IDLE = "IDLE",
  AWAITING_PRODUCT = "AWAITING_PRODUCT",
  AWAITING_QUANTITY = "AWAITING_QUANTITY",
  AWAITING_NAME = "AWAITING_NAME",
  AWAITING_ADDRESS = "AWAITING_ADDRESS",
  AWAITING_CITY = "AWAITING_CITY",
  AWAITING_CONFIRM = "AWAITING_CONFIRM",
}

export interface DraftOrder {
  productName?: string;
  quantity?: number;
  customerName?: string;
  /** Número de contacto para coordinar la entrega (puede ser distinto del WhatsApp desde el que escribe). */
  contactPhone?: string;
  address?: string;
  city?: string;
  /** Punto de referencia cercano a la dirección, para el repartidor. */
  reference?: string;
  /** Link de Google Maps o descripción de la ubicación, si el cliente la compartió por WhatsApp. */
  locationLink?: string;
  /** "domicilio" (default: envío gratis, paga al recibir) o "agencia" (retiro, con abono del 10% por adelantado). */
  deliveryMethod?: "domicilio" | "agencia";
  /** Precio total del pedido en USD. */
  totalPrice?: number;
}

export interface Customer {
  phone: string;
  name: string | null;
  state: ConversationState;
  draftOrder: DraftOrder;
  /** Historial de la conversación con la IA (solo se usa en CONVERSATION_MODE=ai). */
  aiHistory: AiChatMessage[];
  /** true cuando ya se le mostró al cliente el resumen del pedido y se espera CONFIRMAR/CANCELAR (solo modo "rules"). */
  awaitingConfirmation: boolean;
  updatedAt: string;
}

/** Un turno de la conversación con Claude (solo texto — no guardamos tool_use crudo). */
export interface AiChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface OrderRecord {
  id: number;
  customerPhone: string;
  /** Referencia interna del pedido (la generamos nosotros, no viene de ningún servicio externo). */
  orderRef: string;
  productName: string;
  quantity: number;
  address: string;
  city: string;
  status: string;
  lastNotifiedStatus: string | null;
  createdAt: string;
  updatedAt: string;
}
