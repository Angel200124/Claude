const DIACRITICS_REGEX = new RegExp("[\\u0300-\\u036f]", "g");

/** Minúsculas, sin tildes, sin espacios de sobra — para matchear palabras clave. */
export function normalize(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(DIACRITICS_REGEX, "");
}

export function isCancel(text: string): boolean {
  const n = normalize(text);
  return n === "cancelar" || n === "no";
}

export function isConfirm(text: string): boolean {
  const n = normalize(text);
  return n === "confirmar" || n === "si" || n === "sí";
}
