# Bot de WhatsApp + Dropi

Servicio en Node.js/TypeScript que:

1. Responde solo en WhatsApp (WhatsApp Business Platform / Cloud API oficial de Meta).
2. Guía al cliente por un flujo simple para tomar su pedido (producto, cantidad, nombre, dirección, ciudad) y genera el pedido en **Dropi**.
3. Cada cierto tiempo consulta en Dropi el estado de los pedidos abiertos y, si cambió, le avisa al cliente por WhatsApp automáticamente.

Corre como un servicio 24/7 (no dentro de una sesión de Claude Code) — pensado para desplegarse en un VPS propio.

## ⚠️ Antes de arrancar: la parte de Dropi hay que completarla vos

No existe documentación pública y estable de la API de Dropi, así que **todo** lo específico de Dropi está aislado en un único archivo: [`src/dropi/client.ts`](./src/dropi/client.ts). El resto del bot no sabe cómo está armado ese cliente, solo usa `createOrder(...)` y `getOrderStatus(...)`.

Con la documentación de integraciones que Dropi te dio al generar tu API key (Panel de Dropi → Integraciones → API), completá en `src/dropi/client.ts`:

- `buildCreateOrderPayload`: los nombres exactos de los campos que espera el endpoint para crear una orden/guía.
- `mapCreateOrderResponse`: de dónde sacar el ID de la orden y el estado inicial en la respuesta.
- `mapStatusResponse`: de dónde sacar el estado en la respuesta del endpoint de consulta.
- Las variables de entorno `DROPI_API_BASE_URL`, `DROPI_CREATE_ORDER_PATH`, `DROPI_ORDER_STATUS_PATH`, `DROPI_AUTH_HEADER_NAME` / `DROPI_AUTH_HEADER_PREFIX` en `.env`.

Hasta que ajustes eso, el bot va a responder en WhatsApp y armar el resumen del pedido normalmente, pero va a fallar al intentar crearlo en Dropi (te va a avisar al cliente con un mensaje de error y vos vas a ver el detalle en los logs).

También ajustá el diccionario `STATUS_LABELS` en [`src/conversation/messages.ts`](./src/conversation/messages.ts) con los nombres de estado reales que devuelve tu cuenta de Dropi (mirá los logs del poller: imprime el estado "crudo" de cada pedido).

## 1. Configurar WhatsApp Business Platform (Cloud API)

1. Entrá a [developers.facebook.com](https://developers.facebook.com/), creá una App de tipo "Business" y agregale el producto **WhatsApp**.
2. En **WhatsApp → API Setup** vas a ver:
   - Un **número de prueba** (o tu número verificado) y su `Phone Number ID` → `WHATSAPP_PHONE_NUMBER_ID`.
   - Un **token temporal**. Para producción generá un **token permanente** (System User con permiso `whatsapp_business_messaging`) → `WHATSAPP_TOKEN`.
3. Inventá un secreto largo para `WHATSAPP_VERIFY_TOKEN` (cualquier string, vos lo elegís).
4. Una vez que el bot esté desplegado y accesible por HTTPS (ver más abajo), en **WhatsApp → Configuration → Webhook**:
   - Callback URL: `https://tu-dominio.com/webhook/whatsapp`
   - Verify token: el mismo valor que pusiste en `WHATSAPP_VERIFY_TOKEN`
   - Suscribite al campo `messages`.

> Meta exige HTTPS para el webhook. Si no tenés un dominio con certificado todavía, poné un proxy como Caddy/Nginx + Let's Encrypt delante del bot, o Cloudflare Tunnel.

## 2. Configurar Dropi

1. En tu panel de Dropi generá una API key de integraciones.
2. Completá `DROPI_API_KEY` y el resto de las variables `DROPI_*` en `.env`.
3. Ajustá `src/dropi/client.ts` como se explica arriba.

## 3. Variables de entorno

Copiá `.env.example` a `.env` y completá los valores:

```bash
cp .env.example .env
```

Todas las variables están documentadas con comentarios en ese archivo (WhatsApp, Dropi, frecuencia del poller, IA opcional para preguntas libres).

## 4. Correr en local (desarrollo)

```bash
npm install
npm run dev
```

Para probar el webhook en local sin desplegar todavía, exponé el puerto con algo como `ngrok http 3000` y usá esa URL HTTPS en la configuración del webhook de Meta mientras probás.

## 5. Desplegar en un VPS (producción)

### Opción A: Docker (recomendado)

```bash
git clone <este-repo>
cd whatsapp-dropi-bot
cp .env.example .env   # completar valores
docker compose up -d --build
```

La base de datos SQLite queda en `./data/bot.sqlite` (montada como volumen, sobrevive a un `docker compose down`).

Poné Nginx o Caddy delante para HTTPS, apuntando a `http://localhost:3000`.

### Opción B: PM2 (sin Docker)

```bash
npm install
npm run build
npm install -g pm2
pm2 start dist/server.js --name whatsapp-dropi-bot
pm2 save
pm2 startup   # deja el proceso arrancando solo si el servidor reinicia
```

## 6. Cómo funciona la conversación

Hay dos modos, elegidos con la variable `CONVERSATION_MODE`:

### Modo "rules" (default) — sin IA

Flujo determinístico para tomar pedidos, así los datos de envío nunca dependen de que un modelo "interprete" bien una dirección ([`src/conversation/flow.ts`](./src/conversation/flow.ts)):

```
Cliente escribe "PEDIDO"
  → ¿Qué producto? → ¿Cuántas unidades? → ¿A nombre de quién?
  → ¿Dirección? → ¿Ciudad? → resumen + CONFIRMAR/CANCELAR
  → CONFIRMAR crea el pedido en Dropi y le manda el número de seguimiento al cliente
```

Cliente escribe "ESTADO" → le contesta el estado de su último pedido. Cualquier otro mensaje → menú genérico. Cero llamadas a la API de Claude — no requiere `ANTHROPIC_API_KEY`.

### Modo "ai" — Claude maneja toda la conversación

Con `CONVERSATION_MODE=ai` y `ANTHROPIC_API_KEY` configurada, Claude conversa libremente en cada mensaje (saludos, preguntas, y también juntar los datos del pedido de forma natural en vez de un formulario fijo) — ver [`src/ai/orderAssistant.ts`](./src/ai/orderAssistant.ts) y [`src/conversation/aiFlow.ts`](./src/conversation/aiFlow.ts).

**Seguro incluido:** aunque la IA decide qué preguntar y cuándo considera que ya tiene los 5 datos del pedido (llamando a la tool `propose_order`), el resumen de confirmación que ve el cliente lo arma el código a partir de esos datos tal cual, y la creación real del pedido en Dropi **solo** ocurre si el cliente responde literalmente `CONFIRMAR` — ese chequeo es determinístico, la IA nunca puede saltearlo ni confirmar por su cuenta. Si el cliente pide cambiar algo mientras espera la confirmación ("no, la dirección es otra"), sigue conversando con la IA hasta que se vuelve a mostrar el resumen correcto.

Cada cliente tiene su propio historial de conversación (guardado en SQLite, hasta los últimos 20 mensajes) para que Claude tenga contexto de lo ya hablado.

**Costo:** cada mensaje del modo "ai" es una llamada a la API de Claude (con `output_config.effort: "low"` para mantenerlo rápido y barato). Para un volumen chico/mediano el gasto es de centavos de dólar por conversación — podés cambiar `CLAUDE_MODEL` a algo más económico (ej. `claude-haiku-4-5`) si el volumen crece.

Los textos fijos (confirmación, mensajes de estado, etc.) se pueden editar en [`src/conversation/messages.ts`](./src/conversation/messages.ts); el estilo de las respuestas libres de la IA se ajusta en el `system prompt` dentro de `orderAssistant.ts`.

## 7. Cómo funcionan los avisos de estado

Cada `POLL_INTERVAL_MINUTES` minutos (default 15), el bot recorre los pedidos que no estén en un estado "final" (`DROPI_TERMINAL_STATUSES`), le pregunta a Dropi el estado actual de cada uno y, si cambió respecto al último guardado, le manda un WhatsApp al cliente y actualiza la base.

Esto es *polling*, no un webhook de Dropi — porque no hay garantía de que tu plan de Dropi permita webhooks salientes de cambio de estado. Si en algún momento confirmás que Dropi sí te puede mandar un webhook de estado, es preferible: avisa al instante y ahorra llamadas a la API. Se puede agregar un endpoint `POST /webhook/dropi` en `src/server.ts` que llame a la misma lógica de `statusPoller.ts` cuando eso esté confirmado.

## 8. Estructura del proyecto

```
src/
  config.ts               # variables de entorno centralizadas
  db.ts                   # SQLite: clientes, conversación, pedidos, idempotencia
  types.ts                # tipos compartidos
  server.ts               # Express: webhook de WhatsApp + arranque del poller
  whatsapp/client.ts       # envío de mensajes vía WhatsApp Cloud API
  dropi/client.ts          # ⚠️ TODO lo específico de Dropi vive acá
  dropi/statusPoller.ts    # chequeo periódico de estados + notificación
  conversation/flow.ts      # máquina de estados de la conversación
  conversation/messages.ts  # todos los textos en español + mapeo de estados
  ai/faqResponder.ts        # respuesta opcional con Claude para preguntas libres
```

## 9. Seguridad y buenas prácticas

- Nunca subas `.env` al repositorio (ya está en `.gitignore`).
- El `WHATSAPP_VERIFY_TOKEN` solo lo necesitás vos y Meta — no lo compartas.
- Considerá agregar un rate-limit (por ejemplo `express-rate-limit`) si el bot queda expuesto públicamente sin control de tráfico.
- Los mensajes de WhatsApp llegan como reintentos si tu servidor no responde `200` rápido — por eso el webhook responde `200` inmediatamente y procesa el mensaje después (y guarda `message_id` procesados para no duplicar respuestas).

## 10. Límites conocidos de esta primera versión

- Solo procesa mensajes de **texto** (audio/imágenes reciben un mensaje pidiendo texto).
- Un solo producto por pedido (no carrito con varios ítems).
- No hay panel de administración — el estado vive en SQLite (`data/bot.sqlite`); se puede inspeccionar con cualquier cliente de SQLite.
- Pensado para un solo número de WhatsApp / una sola tienda.
