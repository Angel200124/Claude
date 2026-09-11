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
  address?: string;
  city?: string;
}

export interface Customer {
  phone: string;
  name: string | null;
  state: ConversationState;
  draftOrder: DraftOrder;
  /** Historial de la conversación con la IA (solo se usa en CONVERSATION_MODE=ai). */
  aiHistory: AiChatMessage[];
  /** true cuando ya se le mostró al cliente el resumen del pedido y se espera CONFIRMAR/CANCELAR. */
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
