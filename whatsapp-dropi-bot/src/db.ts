import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import { config } from "./config.js";
import {
  ConversationState,
  type AiChatMessage,
  type Customer,
  type DraftOrder,
  type OrderRecord,
} from "./types.js";

fs.mkdirSync(path.dirname(config.dbPath), { recursive: true });

export const db = new Database(config.dbPath);
db.pragma("journal_mode = WAL");

db.exec(`
  CREATE TABLE IF NOT EXISTS customers (
    phone TEXT PRIMARY KEY,
    name TEXT,
    state TEXT NOT NULL DEFAULT 'IDLE',
    draft_order TEXT NOT NULL DEFAULT '{}',
    ai_history TEXT NOT NULL DEFAULT '[]',
    awaiting_confirmation INTEGER NOT NULL DEFAULT 0,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    customer_phone TEXT NOT NULL,
    dropi_order_id TEXT NOT NULL,
    product_name TEXT NOT NULL,
    quantity INTEGER NOT NULL,
    address TEXT NOT NULL,
    city TEXT NOT NULL,
    status TEXT NOT NULL,
    last_notified_status TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS processed_messages (
    message_id TEXT PRIMARY KEY,
    processed_at TEXT NOT NULL
  );
`);

// Migración liviana para bases de datos creadas antes de agregar estas columnas.
for (const ddl of [
  "ALTER TABLE customers ADD COLUMN ai_history TEXT NOT NULL DEFAULT '[]'",
  "ALTER TABLE customers ADD COLUMN awaiting_confirmation INTEGER NOT NULL DEFAULT 0",
]) {
  try {
    db.exec(ddl);
  } catch {
    // La columna ya existe — nada que hacer.
  }
}

function now(): string {
  return new Date().toISOString();
}

const MAX_AI_HISTORY = 20;

export function getOrCreateCustomer(phone: string): Customer {
  const row = db.prepare("SELECT * FROM customers WHERE phone = ?").get(phone) as
    | {
        phone: string;
        name: string | null;
        state: string;
        draft_order: string;
        ai_history: string;
        awaiting_confirmation: number;
        updated_at: string;
      }
    | undefined;

  if (row) {
    return {
      phone: row.phone,
      name: row.name,
      state: row.state as ConversationState,
      draftOrder: JSON.parse(row.draft_order) as DraftOrder,
      aiHistory: JSON.parse(row.ai_history) as AiChatMessage[],
      awaitingConfirmation: !!row.awaiting_confirmation,
      updatedAt: row.updated_at,
    };
  }

  const customer: Customer = {
    phone,
    name: null,
    state: ConversationState.IDLE,
    draftOrder: {},
    aiHistory: [],
    awaitingConfirmation: false,
    updatedAt: now(),
  };
  db.prepare(
    "INSERT INTO customers (phone, name, state, draft_order, ai_history, awaiting_confirmation, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
  ).run(
    customer.phone,
    customer.name,
    customer.state,
    JSON.stringify(customer.draftOrder),
    JSON.stringify(customer.aiHistory),
    customer.awaitingConfirmation ? 1 : 0,
    customer.updatedAt,
  );
  return customer;
}

export function saveCustomer(customer: Customer): void {
  const trimmedHistory = customer.aiHistory.slice(-MAX_AI_HISTORY);
  db.prepare(
    `UPDATE customers SET name = ?, state = ?, draft_order = ?, ai_history = ?, awaiting_confirmation = ?, updated_at = ? WHERE phone = ?`,
  ).run(
    customer.name,
    customer.state,
    JSON.stringify(customer.draftOrder),
    JSON.stringify(trimmedHistory),
    customer.awaitingConfirmation ? 1 : 0,
    now(),
    customer.phone,
  );
}

export function createOrderRecord(input: {
  customerPhone: string;
  dropiOrderId: string;
  productName: string;
  quantity: number;
  address: string;
  city: string;
  status: string;
}): OrderRecord {
  const timestamp = now();
  const result = db
    .prepare(
      `INSERT INTO orders
        (customer_phone, dropi_order_id, product_name, quantity, address, city, status, last_notified_status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      input.customerPhone,
      input.dropiOrderId,
      input.productName,
      input.quantity,
      input.address,
      input.city,
      input.status,
      input.status,
      timestamp,
      timestamp,
    );

  return {
    id: Number(result.lastInsertRowid),
    customerPhone: input.customerPhone,
    dropiOrderId: input.dropiOrderId,
    productName: input.productName,
    quantity: input.quantity,
    address: input.address,
    city: input.city,
    status: input.status,
    lastNotifiedStatus: input.status,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

function rowToOrder(row: any): OrderRecord {
  return {
    id: row.id,
    customerPhone: row.customer_phone,
    dropiOrderId: row.dropi_order_id,
    productName: row.product_name,
    quantity: row.quantity,
    address: row.address,
    city: row.city,
    status: row.status,
    lastNotifiedStatus: row.last_notified_status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function getLatestOrderForCustomer(phone: string): OrderRecord | null {
  const row = db
    .prepare("SELECT * FROM orders WHERE customer_phone = ? ORDER BY id DESC LIMIT 1")
    .get(phone);
  return row ? rowToOrder(row) : null;
}

/** Pedidos cuyo estado todavía no es uno de los "finales" configurados. */
export function getOpenOrders(terminalStatuses: string[]): OrderRecord[] {
  const rows = db.prepare("SELECT * FROM orders").all() as any[];
  return rows
    .map(rowToOrder)
    .filter((o) => !terminalStatuses.includes(o.status.trim().toLowerCase()));
}

export function updateOrderStatus(orderId: number, status: string, notified: boolean): void {
  if (notified) {
    db.prepare(
      `UPDATE orders SET status = ?, last_notified_status = ?, updated_at = ? WHERE id = ?`,
    ).run(status, status, now(), orderId);
  } else {
    db.prepare(`UPDATE orders SET status = ?, updated_at = ? WHERE id = ?`).run(status, now(), orderId);
  }
}

export function isMessageProcessed(messageId: string): boolean {
  return !!db.prepare("SELECT 1 FROM processed_messages WHERE message_id = ?").get(messageId);
}

export function markMessageProcessed(messageId: string): void {
  db.prepare("INSERT OR IGNORE INTO processed_messages (message_id, processed_at) VALUES (?, ?)").run(
    messageId,
    now(),
  );
}
