import { CDNError } from "./errors.js";

const DEFAULT_RAW_REF_PREFIX = "refs/heads";

function resolveRawRefPrefix(options) {
  const prefix =
    options.githubRawRefPrefix === undefined
      ? DEFAULT_RAW_REF_PREFIX
      : options.githubRawRefPrefix;
  if (!prefix) return "";
  return `${String(prefix).replace(/\/+$/, "")}/`;
}

/**
 * Registry provider bawaan. Setiap provider cukup menyediakan `buildUrl(source, options)`,
 * sehingga pengguna bisa menambah provider sendiri (mis. unpkg) tanpa mengubah library.
 */
export const PROVIDERS = {
  jsdelivr: {
    id: "jsdelivr",
    name: "jsDelivr",
    host: "cdn.jsdelivr.net",
    buildUrl: ({ owner, repo, ref, path }) =>
      `https://cdn.jsdelivr.net/gh/${owner}/${repo}@${ref}/${path}`,
  },
  statically: {
    id: "statically",
    name: "Statically",
    host: "cdn.statically.io",
    buildUrl: ({ owner, repo, ref, path }) =>
      `https://cdn.statically.io/gh/${owner}/${repo}@${ref}/${path}`,
  },
  "github-raw": {
    id: "github-raw",
    name: "GitHub Raw",
    host: "raw.githubusercontent.com",
    buildUrl: ({ owner, repo, ref, path }, options = {}) =>
      `https://raw.githubusercontent.com/${owner}/${repo}/${resolveRawRefPrefix(options)}${ref}/${path}`,
  },
};

/** Urutan fallback default: jsDelivr -> Statically -> GitHub Raw. */
export const DEFAULT_PROVIDER_ORDER = ["jsdelivr", "statically", "github-raw"];

/**
 * Mengubah daftar provider (id string atau objek provider custom) menjadi objek provider.
 */
export function resolveProviders(input) {
  if (input === null || input === undefined) {
    return DEFAULT_PROVIDER_ORDER.map((id) => PROVIDERS[id]);
  }

  const list = Array.isArray(input) ? input : [input];
  return list.map((entry) => {
    if (typeof entry === "string") {
      const provider = PROVIDERS[entry];
      if (!provider) throw new CDNError(`Provider tidak dikenal: ${entry}`);
      return provider;
    }
    if (entry && typeof entry.buildUrl === "function") return entry;
    throw new CDNError("Definisi provider tidak valid");
  });
}

/**
 * Membangun daftar URL CDN (berurut sesuai prioritas fallback) dari sumber yang sudah diparse.
 */
export function buildProviderUrls(source, options = {}) {
  return resolveProviders(options.providers).map((provider) => ({
    id: provider.id,
    name: provider.name,
    cdnUrl: provider.buildUrl(source, options),
  }));
}
