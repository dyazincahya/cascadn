import { parseSource } from "./parse.js";
import { resolveProviders, buildProviderUrls } from "./providers.js";
import { MemoryCache } from "./cache.js";
import { parseJsonBody } from "./json.js";
import { CDNError, FetchError, InvalidJsonError } from "./errors.js";

const DEFAULTS = {
  providers: undefined, // default: jsdelivr -> statically -> github-raw
  timeout: 10000,
  retries: 0,
  retryDelay: 300,
  headers: { Accept: "application/json, text/plain, */*" },
  parseJson: true,
  jsonRepair: true,
  cache: true,
  cacheTTL: 5 * 60 * 1000,
  cacheMax: 100,
  cacheAdapter: null,
  fetch: undefined,
  githubRawRefPrefix: "refs/heads",
  skipCache: false,
  signal: undefined,
};

function mergeOptions(base, overrides) {
  const merged = { ...base };
  if (overrides) {
    for (const [key, value] of Object.entries(overrides)) {
      if (value !== undefined) merged[key] = value;
    }
  }
  return merged;
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function createAbortController(options) {
  const controller = new AbortController();

  const timer =
    options.timeout > 0
      ? setTimeout(() => controller.abort(new Error("Request timeout")), options.timeout)
      : null;

  const onExternalAbort = () => controller.abort(options.signal?.reason);
  if (options.signal) {
    if (options.signal.aborted) onExternalAbort();
    else options.signal.addEventListener("abort", onExternalAbort, { once: true });
  }

  const cleanup = () => {
    if (timer) clearTimeout(timer);
    if (options.signal) options.signal.removeEventListener("abort", onExternalAbort);
  };

  return { controller, cleanup };
}

async function requestOnce(url, options, fetchImpl) {
  const { controller, cleanup } = createAbortController(options);

  try {
    const response = await fetchImpl(url, {
      signal: controller.signal,
      headers: options.headers,
      redirect: "follow",
    });

    if (!response.ok) {
      const error = new Error(
        `HTTP ${response.status}${response.statusText ? ` ${response.statusText}` : ""}`,
      );
      error.status = response.status;
      // 5xx dan 429 layak dicoba ulang; 4xx lain langsung fallback ke provider berikutnya.
      error.retriable = response.status >= 500 || response.status === 429;
      throw error;
    }

    const text = await response.text();
    return { status: response.status, text };
  } catch (error) {
    if (error.name === "AbortError") {
      const aborted = Boolean(options.signal?.aborted);
      const abortError = new Error(aborted ? "Permintaan dibatalkan" : "Permintaan melebihi batas waktu");
      abortError.status = null;
      abortError.retriable = !aborted;
      throw abortError;
    }
    if (error.retriable === undefined) error.retriable = true; // error jaringan boleh dicoba ulang
    throw error;
  } finally {
    cleanup();
  }
}

async function requestText(url, options, fetchImpl) {
  const maxAttempts = Math.max(0, Math.trunc(Number(options.retries) || 0)) + 1;
  let lastError;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    try {
      return await requestOnce(url, options, fetchImpl);
    } catch (error) {
      lastError = error;
      if (attempt === maxAttempts - 1 || error.retriable === false) break;
      await delay(options.retryDelay * (attempt + 1));
    }
  }

  throw lastError;
}

/**
 * Envelope kegagalan untuk kasus JSON tidak valid yang tidak bisa diperbaiki.
 * Bentuknya sama dengan response sukses, dengan `ok: false`, `data: null`,
 * dan `message` berisi penjelasan (English).
 */
function createInvalidJsonOutcome({ source, attempts }) {
  const providerIds = attempts.map((attempt) => attempt.provider).join(", ");

  return {
    ok: false,
    provider: null,
    providerName: null,
    cdnUrl: null,
    data: null,
    source,
    attempts,
    jsonRepaired: false,
    cached: false,
    shared: false,
    fetchedAt: new Date().toISOString(),
    message:
      "The response body is not valid JSON and could not be repaired. " +
      `Tried providers: ${providerIds}. ` +
      "See attempts[].error for a snippet of each response body.",
  };
}

/**
 * Inti fallback: coba tiap provider berurutan sampai ada yang berhasil
 * mengembalikan response valid (HTTP ok + JSON valid).
 */
async function runWithFallback(source, options) {
  const providerList = resolveProviders(options.providers);
  const fetchImpl = options.fetch || globalThis.fetch;

  if (typeof fetchImpl !== "function") {
    throw new CDNError("Implementasi fetch tidak tersedia. Sertakan opsi `fetch`.");
  }

  const attempts = [];

  for (const provider of providerList) {
    const cdnUrl = provider.buildUrl(source, options);
    const startedAt = Date.now();

    try {
      const response = await requestText(cdnUrl, options, fetchImpl);

      let data;
      let jsonRepaired = false;

      if (options.parseJson === false) {
        data = response.text;
      } else {
        const parsed = parseJsonBody(response.text, { repair: options.jsonRepair !== false });
        data = parsed.data;
        jsonRepaired = parsed.repaired;
      }

      attempts.push({
        provider: provider.id,
        cdnUrl,
        ok: true,
        status: response.status,
        durationMs: Date.now() - startedAt,
      });

      return {
        ok: true,
        provider: provider.id,
        providerName: provider.name,
        cdnUrl,
        data,
        source,
        attempts,
        jsonRepaired,
        cached: false,
        shared: false,
        fetchedAt: new Date().toISOString(),
        message: null,
      };
    } catch (error) {
      attempts.push({
        provider: provider.id,
        cdnUrl,
        ok: false,
        status: error.status ?? null,
        error: error.message,
        invalidJson: error instanceof InvalidJsonError,
        durationMs: Date.now() - startedAt,
      });
    }
  }

  const invalidJsonOnly =
    attempts.length > 0 && attempts.every((attempt) => attempt.invalidJson === true);

  if (invalidJsonOnly) return createInvalidJsonOutcome({ source, attempts });

  throw new FetchError(
    `Gagal mengambil data dari semua provider (${providerList.map((p) => p.id).join(", ")})`,
    { attempts, source },
  );
}

/**
 * Membuat instance client dengan konfigurasi sendiri.
 * Semua opsi bisa ditimpa per pemanggilan `fetchJson`.
 */
export function createClient(options = {}) {
  const config = { ...DEFAULTS, ...options };
  const cache =
    config.cache === false
      ? null
      : config.cacheAdapter || new MemoryCache({ ttl: config.cacheTTL, max: config.cacheMax });

  const inflight = new Map();

  function buildCacheKey(source, opts) {
    const providerIds = resolveProviders(opts.providers)
      .map((p) => p.id)
      .join(",");
    const mode =
      opts.parseJson === false ? "text" : opts.jsonRepair === true ? "json+repair" : "json";
    return `${source.owner}/${source.repo}@${source.ref}/${source.path}#${providerIds}#${mode}`;
  }

  async function fetchJson(input, overrides) {
    const opts = mergeOptions(config, overrides);
    const source = parseSource(input);
    const key = buildCacheKey(source, opts);

    if (cache && opts.skipCache !== true) {
      const hit = await cache.get(key);
      if (hit !== undefined) return { ...hit, cached: true };
    }

    // Gabungkan permintaan identik yang masih berjalan agar tidak dobel request.
    if (inflight.has(key)) {
      const pending = await inflight.get(key);
      return { ...pending, cached: false, shared: true };
    }

    const task = runWithFallback(source, opts);
    inflight.set(key, task);

    try {
      const result = await task;
      // Envelope kegagalan tidak pernah di-cache.
      if (cache && result.ok !== false) await cache.set(key, result, opts.cacheTTL);
      return result;
    } finally {
      inflight.delete(key);
    }
  }

  async function fetchJsonData(input, overrides) {
    const result = await fetchJson(input, overrides);

    if (result.ok === false) {
      // Tidak ada envelope pada helper ini, jadi kegagalan tetap dilempar
      // daripada mengembalikan null secara diam-diam.
      throw new FetchError(result.message, {
        attempts: result.attempts,
        source: result.source,
        invalidJson: true,
      });
    }

    return result.data;
  }

  function buildCdnUrls(input, overrides) {
    return buildProviderUrls(parseSource(input), mergeOptions(config, overrides));
  }

  async function clearCache() {
    if (cache && typeof cache.clear === "function") await cache.clear();
  }

  return {
    fetchJson,
    fetchJsonData,
    buildCdnUrls,
    clearCache,
    cache,
  };
}
