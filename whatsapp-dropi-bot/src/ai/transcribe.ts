import { config } from "../config.js";

const GROQ_TRANSCRIPTION_URL = "https://api.groq.com/openai/v1/audio/transcriptions";

function guessExtension(mimeType: string): string {
  if (mimeType.includes("ogg")) return "ogg";
  if (mimeType.includes("mpeg") || mimeType.includes("mp3")) return "mp3";
  if (mimeType.includes("mp4") || mimeType.includes("m4a")) return "m4a";
  if (mimeType.includes("wav")) return "wav";
  return "audio";
}

/**
 * Transcribe una nota de voz de WhatsApp a texto usando Whisper corriendo en
 * Groq (rápido y con capa gratis generosa). Devuelve "" si falla — el que
 * llama decide qué hacer (típicamente, pedirle al cliente que escriba).
 */
export async function transcribeAudio(buffer: Buffer, mimeType: string): Promise<string> {
  if (!config.groq.apiKey) {
    console.warn("[transcribe] GROQ_API_KEY no está configurada — no se puede transcribir el audio.");
    return "";
  }

  try {
    const arrayBuffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer;
    const form = new FormData();
    form.append("file", new Blob([arrayBuffer], { type: mimeType }), `audio.${guessExtension(mimeType)}`);
    form.append("model", "whisper-large-v3-turbo");
    form.append("language", "es");
    form.append("response_format", "json");

    const response = await fetch(GROQ_TRANSCRIPTION_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${config.groq.apiKey}` },
      body: form,
    });

    if (!response.ok) {
      console.error(`[transcribe] Error de Groq (${response.status}):`, await response.text());
      return "";
    }

    const data = (await response.json()) as { text?: string };
    return (data.text ?? "").trim();
  } catch (error) {
    console.error("[transcribe] Error inesperado transcribiendo audio:", error);
    return "";
  }
}
