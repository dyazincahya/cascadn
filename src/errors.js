// Kumpulan error khusus library agar mudah dibedakan saat di-catch.

/** Kelas dasar semua error library. */
export class CDNError extends Error {
  constructor(message, options) {
    super(message, options);
    this.name = "CDNError";
  }
}

/** Input/URL tidak dikenali. Properti `input` menyimpan nilai aslinya. */
export class ParseError extends CDNError {
  constructor(message, input = null) {
    super(message);
    this.name = "ParseError";
    this.input = input;
  }
}

/** Semua provider gagal. Properti `attempts` menyimpan detail tiap percobaan. */
export class FetchError extends CDNError {
  constructor(message, { attempts = [], source = null, invalidJson = false, cause } = {}) {
    super(message, { cause });
    this.name = "FetchError";
    this.attempts = attempts;
    this.source = source;
    this.invalidJson = invalidJson;
  }
}

/**
 * Body respons tidak bisa diparse sebagai JSON.
 * Error ini internal: dari luar selalu muncul sebagai `FetchError`
 * dengan flag `invalidJson` dan `attempts[].invalidJson`.
 */
export class InvalidJsonError extends CDNError {
  constructor(message, { bodyPreview = "", cause } = {}) {
    super(message, { cause });
    this.name = "InvalidJsonError";
    this.bodyPreview = bodyPreview;
  }
}
