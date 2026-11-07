/** Hasil normalisasi input menjadi deskriptor sumber GitHub. */
export interface CDNSource {
  type: "github";
  /** Pemilik repo (username/organisasi). */
  owner: string;
  /** Nama repo tanpa akhiran `.git`. */
  repo: string;
  /** Branch atau tag. */
  ref: string;
  /** Path file di dalam repo. */
  path: string;
  /** URL GitHub kanonik, selalu tersedia (juga saat input berupa objek). */
  githubUrl: string;
}

/** Input yang diterima: URL (string) atau objek deskriptor. */
export type SourceInput =
  | string
  | {
      owner?: string;
      user?: string;
      username?: string;
      repo?: string;
      repository?: string;
      name?: string;
      ref?: string;
      branch?: string;
      version?: string;
      path?: string;
      file?: string;
    };

/** Satu URL CDN hasil `buildCdnUrls`. */
export interface CdnUrl {
  /** Id provider, mis. "jsdelivr". */
  id: string;
  /** Nama tampilan provider, mis. "jsDelivr". */
  name: string;
  /** URL CDN yang siap dipakai. */
  cdnUrl: string;
}

/** Definisi provider, dipakai untuk provider kustom. */
export interface ProviderDefinition {
  id: string;
  name: string;
  host?: string;
  buildUrl: (source: CDNSource, options?: ClientOptions) => string;
}

/** Detail satu percobaan provider (berhasil maupun gagal). */
export interface Attempt {
  provider: string;
  cdnUrl: string;
  ok: boolean;
  status: number | null;
  /** Pesan error, hanya ada saat `ok` bernilai false. */
  error?: string;
  durationMs: number;
}

/** Objek hasil dari `fetchJson`. */
export interface FetchResult<T = unknown> {
  /** Id provider yang berhasil melayani. */
  provider: string;
  /** Nama tampilan provider yang berhasil. */
  providerName: string;
  /** URL CDN yang benar-benar dipakai. */
  cdnUrl: string;
  /** Isi JSON yang sudah diparse (atau teks mentah bila `parseJson: false`). */
  data: T;
  /** Sumber GitHub hasil normalisasi. */
  source: CDNSource;
  /** Riwayat percobaan tiap provider, urut sesuai eksekusi. */
  attempts: Attempt[];
  /** true bila hasil diambil dari cache. */
  cached: boolean;
  /** true bila request ini digabung dengan request lain yang identik dan sedang berjalan. */
  shared: boolean;
  /** Waktu pengambilan data (ISO 8601). */
  fetchedAt: string;
}

/** Adapter cache kustom (mis. Redis/localStorage). Boleh sinkron maupun async. */
export interface CacheAdapter {
  get(key: string): unknown | Promise<unknown>;
  set(key: string, value: unknown, ttlMs?: number): unknown | Promise<unknown>;
  delete?(key: string): unknown | Promise<unknown>;
  clear?(): unknown | Promise<unknown>;
}

export interface ClientOptions {
  /** Daftar & urutan provider. Default: ["jsdelivr", "statically", "github-raw"]. */
  providers?: Array<string | ProviderDefinition>;
  /** Batas waktu per request (ms). Default 10000; isi 0 untuk menonaktifkan. */
  timeout?: number;
  /** Jumlah percobaan ulang per provider. Default 0. */
  retries?: number;
  /** Jeda dasar antar retry (ms). Default 300. */
  retryDelay?: number;
  /** Header request. */
  headers?: Record<string, string>;
  /** Parse body sebagai JSON. Default true; isi false untuk teks mentah. */
  parseJson?: boolean;
  /** Aktifkan cache. Default true. */
  cache?: boolean;
  /** Umur entri cache (ms). Default 300000. */
  cacheTTL?: number;
  /** Maksimum entri cache in-memory. Default 100. */
  cacheMax?: number;
  /** Adapter cache kustom. */
  cacheAdapter?: CacheAdapter | null;
  /** Implementasi fetch kustom. Default `globalThis.fetch`. */
  fetch?: typeof globalThis.fetch;
  /** Prefix ref pada URL GitHub Raw. Default "refs/heads"; isi "" untuk bentuk polos. */
  githubRawRefPrefix?: string;
  /** Lewati cache untuk pemanggilan ini. Default false. */
  skipCache?: boolean;
  /** AbortSignal eksternal. */
  signal?: AbortSignal;
}

/** Instance yang dikembalikan `createClient`. */
export interface CDNClient {
  fetchJson<T = unknown>(input: SourceInput, options?: ClientOptions): Promise<FetchResult<T>>;
  fetchJsonData<T = unknown>(input: SourceInput, options?: ClientOptions): Promise<T>;
  buildCdnUrls(input: SourceInput, options?: ClientOptions): CdnUrl[];
  clearCache(): Promise<void>;
  /** Instance cache yang dipakai client (null bila cache dimatikan). */
  cache: CacheAdapter | MemoryCache | null;
}

export declare class CDNError extends Error {}
export declare class ParseError extends CDNError {
  input: string | null;
}
export declare class FetchError extends CDNError {
  attempts: Attempt[];
  source: CDNSource | null;
}

/** Cache in-memory berbasis TTL dengan eviksi LRU. */
export declare class MemoryCache implements CacheAdapter {
  constructor(options?: { ttl?: number; max?: number });
  ttl: number;
  max: number;
  get(key: string): unknown;
  set(key: string, value: unknown, ttl?: number): this;
  has(key: string): boolean;
  delete(key: string): boolean;
  clear(): void;
  readonly size: number;
}

/** Registry provider bawaan, key = id provider. */
export declare const providers: Record<string, ProviderDefinition>;

/** Urutan fallback default. */
export declare const DEFAULT_PROVIDER_ORDER: string[];

/** Normalisasi URL/objek menjadi deskriptor sumber GitHub. */
export declare function parseSource(input: SourceInput): CDNSource;

/** Ubah daftar provider (id string / objek kustom) menjadi definisi provider. */
export declare function resolveProviders(
  input?: string | Array<string | ProviderDefinition> | null,
): ProviderDefinition[];

/** Buat client dengan konfigurasi sendiri. */
export declare function createClient(options?: ClientOptions): CDNClient;

/** Ambil JSON dari CDN dengan fallback otomatis. */
export declare function fetchJson<T = unknown>(
  input: SourceInput,
  options?: ClientOptions,
): Promise<FetchResult<T>>;

/** Ambil isi JSON saja (tanpa metadata). */
export declare function fetchJsonData<T = unknown>(
  input: SourceInput,
  options?: ClientOptions,
): Promise<T>;

/** Susun daftar URL CDN tanpa melakukan request. */
export declare function buildCdnUrls(input: SourceInput, options?: ClientOptions): CdnUrl[];

/** Kosongkan cache client default. */
export declare function clearCache(): Promise<void>;

declare const cascadn: {
  fetchJson: typeof fetchJson;
  fetchJsonData: typeof fetchJsonData;
  buildCdnUrls: typeof buildCdnUrls;
  clearCache: typeof clearCache;
  createClient: typeof createClient;
  parseSource: typeof parseSource;
  resolveProviders: typeof resolveProviders;
  providers: typeof providers;
  DEFAULT_PROVIDER_ORDER: typeof DEFAULT_PROVIDER_ORDER;
  MemoryCache: typeof MemoryCache;
  CDNError: typeof CDNError;
  ParseError: typeof ParseError;
  FetchError: typeof FetchError;
};

export default cascadn;
