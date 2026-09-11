# Bot de WhatsApp — Lucía

Servicio en Node.js/TypeScript que:

1. Responde solo en WhatsApp (WhatsApp Business Platform / Cloud API oficial de Meta).
2. Atiende a los clientes con IA (Claude), como "Lucía", tomando el pedido de forma natural (producto, cantidad, nombre, dirección, ciudad).
3. Guarda el pedido y le avisa al dueño del negocio por WhatsApp para que coordine el envío y le mande la guía al cliente.

Corre como un servicio 24/7 (no dentro de una sesión de Claude Code) — pensado para desplegarse en Render, un VPS propio, o cualquier hosting con Node.

## 1. Configurar WhatsApp Business Platform (Cloud API)

1. Entrá a [developers.facebook.com](https://developers.facebook.com/), creá una App de tipo "Business" y agregale el producto **WhatsApp**.
2. En **WhatsApp → API Setup** vas a ver:
   - Un **número de prueba** (o tu número verificado) y su `Phone Number ID` → `WHATSAPP_PHONE_NUMBER_ID`.
   - Un **token temporal**. Para producción generá un token de larga duración o permanente (System User con permiso `whatsapp_business_messaging` y `whatsapp_business_management`) → `WHATSAPP_TOKEN`.
3. Inventá un secreto largo para `WHATSAPP_VERIFY_TOKEN` (cualquier string, vos lo elegís).
4. Una vez que el bot esté desplegado y accesible por HTTPS (ver más abajo), en **WhatsApp → Configuration → Webhook**:
   - Callback URL: `https://tu-dominio.com/webhook/whatsapp`
   - Verify token: el mismo valor que pusiste en `WHATSAPP_VERIFY_TOKEN`
   - Suscribite al campo `messages`.

> Meta exige HTTPS para el webhook. Si no tenés un dominio con certificado todavía, poné un proxy como Caddy/Nginx + Let's Encrypt delante del bot, o Cloudflare Tunnel (Render ya da HTTPS solo).

## 2. Variables de entorno

Copiá `.env.example` a `.env` y completá los valores:

```bash
cp .env.example .env
```

Todas las variables están documentadas con comentarios en ese archivo.

## 3. Correr en local (desarrollo)

```bash
npm install
npm run dev
```

Para probar el webhook en local sin desplegar todavía, exponé el puerto con algo como `ngrok http 3000` y usá esa URL HTTPS en la configuración del webhook de Meta mientras probás.

## 4. Desplegar en producción

### Opción A: Render (recomendado, gratis para empezar)

Conectá el repo en [render.com](https://render.com), creá un Web Service apuntando a este proyecto (usa el `Dockerfile` incluido), y cargá las variables de entorno de `.env.example` en la sección **Environment** del servicio. Auto-Deploy queda activado por defecto: cada push a la rama configurada redespliega solo.

### Opción B: Docker en un VPS

```bash
git clone <este-repo>
cd whatsapp-dropi-bot
cp .env.example .env   # completar valores
docker compose up -d --build
```

La base de datos SQLite queda en `./data/bot.sqlite` (montada como volumen, sobrevive a un `docker compose down`).

Poné Nginx o Caddy delante para HTTPS, apuntando a `http://localhost:3000`.

### Opción C: PM2 (sin Docker)

```bash
npm install
npm run build
npm install -g pm2
pm2 start dist/server.js --name whatsapp-dropi-bot
pm2 save
pm2 startup   # deja el proceso arrancando solo si el servidor reinicia
```

## 5. Cómo funciona la conversación

Hay dos modos, elegidos con la variable `CONVERSATION_MODE`:

### Modo "rules" (default) — sin IA

Flujo determinístico para tomar pedidos, así los datos de envío nunca dependen de que un modelo "interprete" bien una dirección ([`src/conversation/flow.ts`](./src/conversation/flow.ts)):

```
Cliente escribe "PEDIDO"
  → ¿Qué producto? → ¿Cuántas unidades? → ¿A nombre de quién?
  → ¿Dirección? → ¿Ciudad? → resumen + CONFIRMAR/CANCELAR
  → CONFIRMAR guarda el pedido y le avisa al dueño del negocio
```

Cliente escribe "ESTADO" → le contesta el estado de su último pedido. Cualquier otro mensaje → menú genérico. Cero llamadas a la API de Claude — no requiere `ANTHROPIC_API_KEY`.

### Modo "ai" — Lucía maneja toda la conversación

Con `CONVERSATION_MODE=ai` y `ANTHROPIC_API_KEY` configurada, Claude (con la personalidad "Lucía", asesora de ventas formal y persuasiva — ver [`src/ai/orderAssistant.ts`](./src/ai/orderAssistant.ts)) conversa libremente en cada mensaje: saluda, persuade con los beneficios del catálogo ([`src/ai/catalog.ts`](./src/ai/catalog.ts)) — siempre resaltando envío gratis y pago al recibir —, y junta los datos de entrega de forma natural en vez de un formulario fijo — ver [`src/conversation/aiFlow.ts`](./src/conversation/aiFlow.ts). No hace falta ninguna palabra clave para nada: responde a todo lo que le escriban, entendiendo el mensaje sea como sea que esté redactado.

El cliente da su aceptación de compra en la pregunta de cierre ("¿Desea que procedamos con su pedido...?"); a partir de ahí, en cuanto Lucía junta los datos de entrega obligatorios, el pedido se genera directamente — no hay un segundo paso de "confirmar el resumen". La creación real del pedido **solo** ocurre en código, cuando el modelo llama explícitamente a la herramienta `create_order` con todos los datos requeridos — eso es siempre una acción estructurada y auditable, nunca texto libre parseado a mano ni algo que la IA pueda ejecutar por fuera de esa herramienta.

También soporta que el cliente comparta su ubicación real de WhatsApp (no solo texto) — el webhook la convierte a un link de Google Maps que Lucía puede usar como dato de entrega.

Además del envío a domicilio (gratis, pago al recibir), Lucía puede ofrecer retiro en agencia con un abono del 10% por adelantado — la cuenta bancaria para ese abono se configura en `PICKUP_BANK_ACCOUNT` dentro de [`src/ai/catalog.ts`](./src/ai/catalog.ts).

Cada cliente tiene su propio historial de conversación (guardado en SQLite, hasta los últimos 20 mensajes) para que Claude tenga contexto de lo ya hablado.

**Costo:** cada mensaje del modo "ai" es una llamada a la API de Claude (con `output_config.effort: "low"` para mantenerlo rápido y barato). Para un volumen chico/mediano el gasto es de centavos de dólar por conversación — podés cambiar `CLAUDE_MODEL` a algo más económico (ej. `claude-haiku-4-5`) si el volumen crece.

Los textos fijos (mensajes de estado, etc.) se pueden editar en [`src/conversation/messages.ts`](./src/conversation/messages.ts); la personalidad, el proceso de venta y el catálogo de la IA se ajustan en [`src/ai/orderAssistant.ts`](./src/ai/orderAssistant.ts) y [`src/ai/catalog.ts`](./src/ai/catalog.ts).

## 6. Cómo se avisa un pedido nuevo

Cada pedido confirmado se guarda en la base local y, si `OWNER_NOTIFICATION_PHONE` está configurado, le llega un WhatsApp al dueño del negocio con todos los datos (producto, cantidad, precio total, cliente, contacto, dirección, ciudad, referencia, ubicación y método de entrega) para que coordine el envío (o verifique el abono, si es retiro en agencia) y le mande la guía al cliente por su cuenta.

El mensaje final que ve el cliente en modo IA termina con un saludo según la hora en Ecuador y el emoji 🛍️, para que se identifique de un vistazo en la conversación que la venta se cerró.

## 7. Notas de voz (audio)

Si el cliente manda un audio, el bot lo descarga de WhatsApp, lo transcribe a texto con Whisper (corriendo en [Groq](https://console.groq.com), configurable con `GROQ_API_KEY`) y lo procesa como si fuera un mensaje de texto normal — ver [`src/whatsapp/media.ts`](./src/whatsapp/media.ts) y [`src/ai/transcribe.ts`](./src/ai/transcribe.ts). Sin `GROQ_API_KEY` configurada, el bot le pide al cliente que escriba en texto en vez de mandar audio.

## 8. Estructura del proyecto

```
src/
  config.ts               # variables de entorno centralizadas
  db.ts                   # SQLite: clientes, conversación, pedidos, idempotencia
  types.ts                # tipos compartidos
  server.ts               # Express: webhook de WhatsApp
  whatsapp/client.ts       # envío de mensajes vía WhatsApp Cloud API
  whatsapp/media.ts        # descarga de archivos multimedia (audio) de WhatsApp
  orders/submitOrder.ts     # punto único para generar un pedido nuevo
  conversation/flow.ts      # máquina de estados de la conversación (modo "rules")
  conversation/aiFlow.ts    # conversación completa con IA (modo "ai")
  conversation/messages.ts  # todos los textos en español + mapeo de estados
  ai/orderAssistant.ts      # personalidad de Lucía + herramientas de Claude
  ai/catalog.ts             # catálogo de productos que Lucía conoce
  ai/transcribe.ts          # transcripción de audio a texto (Whisper/Groq)
```

## 9. Seguridad y buenas prácticas

- Nunca subas `.env` al repositorio (ya está en `.gitignore`).
- El `WHATSAPP_VERIFY_TOKEN` solo lo necesitás vos y Meta — no lo compartas.
- Considerá agregar un rate-limit (por ejemplo `express-rate-limit`) si el bot queda expuesto públicamente sin control de tráfico.
- Los mensajes de WhatsApp llegan como reintentos si tu servidor no responde `200` rápido — por eso el webhook responde `200` inmediatamente y procesa el mensaje después (y guarda `message_id` procesados para no duplicar respuestas).

## 10. Límites conocidos de esta primera versión

- Procesa mensajes de **texto**, **audio** (transcripto) y **ubicación** (imágenes u otros tipos reciben un mensaje pidiendo texto).
- Un solo producto por pedido (no carrito con varios ítems).
- No hay panel de administración — el estado vive en SQLite (`data/bot.sqlite`); se puede inspeccionar con cualquier cliente de SQLite.
- Pensado para un solo número de WhatsApp / una sola tienda.
