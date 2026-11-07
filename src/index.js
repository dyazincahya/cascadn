import { createClient } from "./client.js";
import { parseSource } from "./parse.js";
import { PROVIDERS, DEFAULT_PROVIDER_ORDER, resolveProviders } from "./providers.js";
import { MemoryCache } from "./cache.js";
import { CDNError, ParseError, FetchError } from "./errors.js";

// Client default yang dipakai oleh fungsi-fungsi top-level.
const defaultClient = createClient();

/**
 * Ambil JSON dari CDN GitHub dengan fallback jsDelivr -> Statically -> GitHub Raw.
 * Mengembalikan objek hasil lengkap (data, provider, cdnUrl, attempts, cached).
 */
export const fetchJson = (input, options) => defaultClient.fetchJson(input, options);

/** Sama seperti `fetchJson`, tetapi hanya mengembalikan isi JSON-nya (`data`). */
export const fetchJsonData = (input, options) => defaultClient.fetchJsonData(input, options);

/** Susun daftar URL CDN (tanpa melakukan request). */
export const buildCdnUrls = (input, options) => defaultClient.buildCdnUrls(input, options);

/** Kosongkan cache milik client default. */
export const clearCache = () => defaultClient.clearCache();

export { createClient, parseSource, resolveProviders, MemoryCache, CDNError, ParseError, FetchError };
export { PROVIDERS as providers, DEFAULT_PROVIDER_ORDER };

const cascadn = {
  fetchJson,
  fetchJsonData,
  buildCdnUrls,
  clearCache,
  createClient,
  parseSource,
  resolveProviders,
  providers: PROVIDERS,
  DEFAULT_PROVIDER_ORDER,
  MemoryCache,
  CDNError,
  ParseError,
  FetchError,
};

export default cascadn;
