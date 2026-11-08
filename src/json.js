import { InvalidJsonError } from "./errors.js";

const PREVIEW_LENGTH = 120;

function isWhitespace(ch) {
  return ch === " " || ch === "\t" || ch === "\n" || ch === "\r";
}

/** Ringkas body jadi satu baris pendek untuk pesan error. */
function preview(text, max = PREVIEW_LENGTH) {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > max ? `${flat.slice(0, max)}...` : flat;
}

/**
 * Buang komentar `//` dan `/* *\/` di luar string.
 * Pemindai sadar-string supaya tanda kutip, `,}`, atau `//` di dalam
 * nilai string tidak ikut terpotong.
 */
function stripComments(input) {
  let out = "";
  let i = 0;
  let inString = false;
  let escaped = false;
  let removed = false;

  while (i < input.length) {
    const ch = input[i];

    if (inString) {
      out += ch;
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') inString = false;
      i += 1;
      continue;
    }

    if (ch === '"') {
      inString = true;
      out += ch;
      i += 1;
      continue;
    }

    if (ch === "/" && input[i + 1] === "/") {
      removed = true;
      i += 2;
      while (i < input.length && input[i] !== "\n") i += 1;
      continue;
    }

    if (ch === "/" && input[i + 1] === "*") {
      removed = true;
      i += 2;
      while (i < input.length && !(input[i] === "*" && input[i + 1] === "/")) i += 1;
      i += 2;
      continue;
    }

    out += ch;
    i += 1;
  }

  return { text: out, removed };
}

/** Buang koma sebelum `}` atau `]`, di luar string. */
function stripTrailingCommas(input) {
  let out = "";
  let i = 0;
  let inString = false;
  let escaped = false;
  let removed = false;

  while (i < input.length) {
    const ch = input[i];

    if (inString) {
      out += ch;
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') inString = false;
      i += 1;
      continue;
    }

    if (ch === '"') {
      inString = true;
      out += ch;
      i += 1;
      continue;
    }

    if (ch === ",") {
      let j = i + 1;
      while (j < input.length && isWhitespace(input[j])) j += 1;
      if (input[j] === "}" || input[j] === "]") {
        removed = true;
        i += 1;
        continue;
      }
    }

    out += ch;
    i += 1;
  }

  return { text: out, removed };
}

/**
 * Perbaikan konservatif: BOM, komentar, lalu trailing comma.
 * `changed` menandai apakah ada yang benar-benar diubah.
 */
function repairJsonText(input) {
  const hasBom = input.charCodeAt(0) === 0xfeff;
  const body = hasBom ? input.slice(1) : input;

  const comments = stripComments(body);
  const commas = stripTrailingCommas(comments.text);

  return {
    text: commas.text,
    changed: hasBom || comments.removed || commas.removed,
  };
}

/**
 * Parse body respons sebagai JSON dengan validasi yang jelas.
 *
 * - body kosong atau hanya whitespace → error khusus, bukan pesan SyntaxError.
 * - `repair: true` mengaktifkan perbaikan konservatif (BOM, komentar, trailing comma).
 * - Bila perbaikan tidak cukup, error asli dari `JSON.parse` tetap dilaporkan.
 *
 * @returns {{ data: unknown, repaired: boolean }}
 * @throws {InvalidJsonError}
 */
export function parseJsonBody(text, { repair = false } = {}) {
  const raw = typeof text === "string" ? text : String(text ?? "");

  if (raw.trim() === "") {
    throw new InvalidJsonError("Respons kosong: body tidak berisi JSON.", {
      bodyPreview: "",
    });
  }

  try {
    return { data: JSON.parse(raw), repaired: false };
  } catch (strictError) {
    if (repair) {
      const { text: fixed, changed } = repairJsonText(raw);
      if (changed) {
        try {
          return { data: JSON.parse(fixed), repaired: true };
        } catch {
          // Perbaikan belum cukup: laporkan error asli agar pesannya tidak menyesatkan.
        }
      }
    }

    const snippet = preview(raw);
    throw new InvalidJsonError(
      `JSON tidak valid: ${strictError.message}${snippet ? ` Cuplikan: "${snippet}"` : ""}`,
      { bodyPreview: snippet, cause: strictError },
    );
  }
}
