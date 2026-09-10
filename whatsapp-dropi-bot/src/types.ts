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
  updatedAt: string;
}

export interface OrderRecord {
  id: number;
  customerPhone: string;
  dropiOrderId: string;
  productName: string;
  quantity: number;
  address: string;
  city: string;
  status: string;
  lastNotifiedStatus: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Lo que le mandamos a Dropi para generar un pedido/guía. */
export interface DropiOrderInput {
  customerName: string;
  customerPhone: string;
  address: string;
  city: string;
  productName: string;
  quantity: number;
  notes?: string;
}

export interface DropiOrderResult {
  /** ID interno que Dropi asigna al pedido/guía — se guarda para consultar el estado después. */
  dropiOrderId: string;
  /** Estado inicial tal como lo devuelve Dropi (texto libre, sin normalizar). */
  status: string;
}

export interface DropiClient {
  createOrder(input: DropiOrderInput): Promise<DropiOrderResult>;
  getOrderStatus(dropiOrderId: string): Promise<string>;
}
