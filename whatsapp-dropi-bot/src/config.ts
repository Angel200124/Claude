import "dotenv/config";

function required(name: string, value: string | undefined): string {
  if (!value) {
    throw new Error(
      `Falta la variable de entorno ${name}. Copiá .env.example a .env y completala.`,
    );
  }
  return value;
}

export const config = {
  port: Number(process.env.PORT ?? 3000),
  dbPath: process.env.DB_PATH ?? "./data/bot.sqlite",

  whatsapp: {
    token: process.env.WHATSAPP_TOKEN ?? "",
    phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID ?? "",
    verifyToken: process.env.WHATSAPP_VERIFY_TOKEN ?? "",
    graphApiVersion: process.env.WHATSAPP_GRAPH_API_VERSION ?? "v21.0",
  },

  dropi: {
    baseUrl: process.env.DROPI_API_BASE_URL ?? "https://api.dropi.co",
    apiKey: process.env.DROPI_API_KEY ?? "",
    authHeaderName: process.env.DROPI_AUTH_HEADER_NAME ?? "Authorization",
    authHeaderPrefix: process.env.DROPI_AUTH_HEADER_PREFIX ?? "Bearer",
    createOrderPath: process.env.DROPI_CREATE_ORDER_PATH ?? "/api/orders",
    orderStatusPath: process.env.DROPI_ORDER_STATUS_PATH ?? "/api/orders/:id",
    terminalStatuses: (process.env.DROPI_TERMINAL_STATUSES ?? "entregado,cancelado,devuelto")
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean),
  },

  polling: {
    intervalMinutes: Number(process.env.POLL_INTERVAL_MINUTES ?? 15),
  },

  /**
   * Tu número de WhatsApp (el del dueño del negocio) para recibir el aviso
   * de cada pedido nuevo mientras DROPI_API_KEY no esté configurada — en ese
   * modo "manual" vos cargás el pedido en Dropi y le mandás la guía al
   * cliente por tu cuenta. Formato igual al que usa la Cloud API (código de
   * país + número, sin "+" ni espacios), ej: 593998248358.
   */
  ownerNotificationPhone: process.env.OWNER_NOTIFICATION_PHONE ?? "",

  ai: {
    /**
     * "rules"  -> flujo de reglas fijas (conversation/flow.ts), sin IA.
     * "ai"     -> Claude maneja toda la conversación, incluido tomar el pedido
     *             (conversation/aiFlow.ts) — la confirmación final del pedido
     *             sigue siendo un paso fijo en código, nunca decidido por la IA.
     */
    mode: (process.env.CONVERSATION_MODE ?? "rules").trim().toLowerCase() as "rules" | "ai",
    apiKey: process.env.ANTHROPIC_API_KEY ?? "",
    model: process.env.CLAUDE_MODEL ?? "claude-opus-5",
    businessName: process.env.BUSINESS_NAME ?? "la tienda",
    faqContext: process.env.BUSINESS_FAQ_CONTEXT ?? "",
  },
};

/** Llamar al arrancar el server: falla rápido si falta algo indispensable. */
export function assertRequiredConfig(): void {
  required("WHATSAPP_TOKEN", config.whatsapp.token);
  required("WHATSAPP_PHONE_NUMBER_ID", config.whatsapp.phoneNumberId);
  required("WHATSAPP_VERIFY_TOKEN", config.whatsapp.verifyToken);

  if (!config.dropi.apiKey) {
    // eslint-disable-next-line no-console
    console.warn(
      "[config] DROPI_API_KEY no está configurada: los pedidos van a quedar en modo " +
        "manual (se te avisa por WhatsApp para cargarlos vos en Dropi) en vez de crearse solos.",
    );
    if (!config.ownerNotificationPhone) {
      console.warn(
        "[config] OWNER_NOTIFICATION_PHONE tampoco está configurado — en modo manual " +
          "no vas a recibir el aviso de los pedidos nuevos por WhatsApp, solo van a quedar en la base de datos.",
      );
    }
  }

  if (config.ai.mode === "ai" && !config.ai.apiKey) {
    // eslint-disable-next-line no-console
    console.warn(
      "[config] CONVERSATION_MODE=ai pero falta ANTHROPIC_API_KEY. " +
        "El bot va a caer al flujo de reglas fijas hasta que la agregues.",
    );
  }
}
