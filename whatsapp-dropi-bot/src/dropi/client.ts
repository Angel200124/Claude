import axios from "axios";
import { config } from "../config.js";
import type { DropiClient, DropiOrderInput, DropiOrderResult } from "../types.js";

/**
 * ⚠️ AJUSTAR ESTE ARCHIVO con la documentación real de integraciones de tu
 * cuenta de Dropi (Panel de Dropi > Integraciones > API, o el doc que te
 * dieron al generar tu API key). No hay una API pública y estable documentada
 * para Dropi, así que esto se dejó como un adaptador aislado: todo lo
 * específico de Dropi vive en este único archivo. El resto del bot (webhook
 * de WhatsApp, conversación, poller de estados) no sabe ni le importa cómo
 * está armado este cliente — solo usa `createOrder` y `getOrderStatus`.
 *
 * Cosas que casi seguro vas a tener que cambiar:
 *  1. `buildCreateOrderPayload`: el nombre exacto de los campos que espera
 *     el endpoint de creación de orden (nombre de cliente, teléfono,
 *     dirección, ciudad, producto/SKU, cantidad, etc.).
 *  2. `mapCreateOrderResponse`: de dónde sacar el ID de la orden/guía y el
 *     estado inicial en la respuesta que devuelve Dropi.
 *  3. `mapStatusResponse`: de dónde sacar el estado en la respuesta del
 *     endpoint de consulta.
 *  4. Si Dropi requiere loguearse primero para obtener un token de sesión
 *     (en vez de una API key fija), agregá esa llamada acá y cacheá el token.
 */

function authHeaders(): Record<string, string> {
  const prefix = config.dropi.authHeaderPrefix ? `${config.dropi.authHeaderPrefix} ` : "";
  return {
    [config.dropi.authHeaderName]: `${prefix}${config.dropi.apiKey}`,
    "Content-Type": "application/json",
  };
}

function buildCreateOrderPayload(input: DropiOrderInput): Record<string, unknown> {
  // TODO: reemplazar por el shape real que espera Dropi.
  return {
    client_name: input.customerName,
    client_phone: input.customerPhone,
    address: input.address,
    city: input.city,
    product_name: input.productName,
    quantity: input.quantity,
    notes: input.notes ?? "",
  };
}

function mapCreateOrderResponse(data: any): DropiOrderResult {
  // TODO: ajustar las rutas de acceso (`data.id`, `data.status`, etc.) según
  // la respuesta real de Dropi.
  const dropiOrderId = String(data?.id ?? data?.order_id ?? data?.data?.id ?? "");
  const status = String(data?.status ?? data?.data?.status ?? "creado");

  if (!dropiOrderId) {
    throw new Error(
      "No se pudo leer el ID del pedido en la respuesta de Dropi. Revisá mapCreateOrderResponse() en src/dropi/client.ts.",
    );
  }

  return { dropiOrderId, status };
}

function mapStatusResponse(data: any): string {
  // TODO: ajustar según la respuesta real de Dropi.
  return String(data?.status ?? data?.data?.status ?? "desconocido");
}

export class HttpDropiClient implements DropiClient {
  async createOrder(input: DropiOrderInput): Promise<DropiOrderResult> {
    const url = `${config.dropi.baseUrl}${config.dropi.createOrderPath}`;
    const response = await axios.post(url, buildCreateOrderPayload(input), {
      headers: authHeaders(),
      timeout: 20_000,
    });
    return mapCreateOrderResponse(response.data);
  }

  async getOrderStatus(dropiOrderId: string): Promise<string> {
    const path = config.dropi.orderStatusPath.replace(":id", encodeURIComponent(dropiOrderId));
    const url = `${config.dropi.baseUrl}${path}`;
    const response = await axios.get(url, {
      headers: authHeaders(),
      timeout: 20_000,
    });
    return mapStatusResponse(response.data);
  }
}

export const dropiClient: DropiClient = new HttpDropiClient();
