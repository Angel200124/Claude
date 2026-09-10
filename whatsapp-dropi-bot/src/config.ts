import "dotenv/config";

function required(name: string, value: string | undefined): string {
  if (!value) {
    throw new Error(
      `Falta la variable de entorno ${name}. Copiá .env.example a .env y completala.`,
    );
  }
  return value;
}

function bool(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined) return fallback;
  return value.trim().toLowerCase() === "true";
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

  ai: {
    enabled: bool(process.env.ENABLE_AI_FAQ, false),
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
      "[config] DROPI_API_KEY no está configurada: el bot puede recibir y responder " +
        "mensajes, pero no va a poder crear pedidos ni consultar estados en Dropi.",
    );
  }

  if (config.ai.enabled && !config.ai.apiKey) {
    // eslint-disable-next-line no-console
    console.warn(
      "[config] ENABLE_AI_FAQ está en true pero falta ANTHROPIC_API_KEY. " +
        "Las preguntas libres van a usar la respuesta genérica en vez de IA.",
    );
  }
}
