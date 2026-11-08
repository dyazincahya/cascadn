# cascadn

<p align="center">
  <img src="https://raw.githubusercontent.com/dyazincahya/cascadn/main/logo-wide.png" alt="cascadn" width="600">
</p>

<p align="center">
  <a href="https://github.com/dyazincahya/cascadn/actions/workflows/publish.yml"><img alt="publish workflow" src="https://github.com/dyazincahya/cascadn/actions/workflows/publish.yml/badge.svg"></a>
  <a href="https://www.npmjs.com/package/cascadn"><img alt="npm version" src="https://img.shields.io/npm/v/cascadn?style=flat-square&amp;label=npm&amp;color=cb3837"></a>
  <a href="https://www.npmjs.com/package/cascadn"><img alt="npm downloads" src="https://img.shields.io/npm/dm/cascadn?style=flat-square&amp;color=cb3837"></a>
  <a href="https://bundlephobia.com/package/cascadn"><img alt="minzipped size" src="https://img.shields.io/bundlephobia/minzip/cascadn?style=flat-square&amp;label=minzip"></a>
  <a href="./LICENSE"><img alt="license" src="https://img.shields.io/npm/l/cascadn?style=flat-square&amp;color=blue"></a>
  <a href="https://nodejs.org"><img alt="node version" src="https://img.shields.io/node/v/cascadn?style=flat-square"></a>
  <img alt="zero dependencies" src="https://img.shields.io/badge/dependencies-0-brightgreen?style=flat-square">
  <a href="https://www.typescriptlang.org"><img alt="TypeScript types" src="https://img.shields.io/npm/types/cascadn?style=flat-square&amp;color=3178c6"></a>
</p>

A library that converts GitHub URLs into **CDN links** (jsDelivr, Statically, GitHub Raw) and fetches the JSON with **automatic fallback** and caching:

```
jsDelivr  ->  Statically  ->  GitHub Raw
```

If one CDN fails (HTTP error, timeout, network failure, or a non-JSON response), the library automatically tries the next one. The final result is parsed JSON, along with information about which provider served it.

- Zero dependency, ESM, Node 18+ / modern browsers
- Configurable: provider order, timeout, retries, headers, cache adapter, custom providers
- In-memory cache based on TTL + LRU, swappable with your own adapter (Redis/localStorage)
- Single-flight: identical concurrent requests are merged into one

> **Upgrading from 1.x?** `fetchJson()` no longer throws when the JSON cannot be repaired — it resolves with a response whose `ok` is `false` and `data` is `null`. See [Migrating from 1.x](#migrating-from-1x).

## Table of Contents

- [Installation](#installation)
- [Quick Start](#quick-start)
- [Response Shape](#response-shape)
- [Invalid JSON Handling](#invalid-json-handling)
  - [Repairing broken JSON](#repairing-broken-json)
- [Accepted Input Formats](#accepted-input-formats)
- [Configuration](#configuration)
- [Cache](#cache)
  - [Cache semantics](#cache-semantics)
  - [Custom cache adapter](#custom-cache-adapter)
- [Custom Providers](#custom-providers)
- [Error Handling](#error-handling)
- [API](#api)
- [Examples](#examples)
- [Test](#test)
- [Migrating from 1.x](#migrating-from-1x)
- [License](#license)

## Installation

```bash
npm install cascadn
```

## Quick Start

```js
import { fetchJson, fetchJsonData, buildCdnUrls } from "cascadn";

// 1. Fetch JSON with automatic fallback
const res = await fetchJson(
  "https://github.com/dyazincahya/iqro-json/blob/main/hijaiyah-letters.json",
);

// HTTP/network failures throw FetchError; unrepairable JSON returns ok: false
if (!res.ok) throw new Error(res.message);

console.log(res.provider); // "jsdelivr" (or "statically" / "github-raw")
console.log(res.data);     // the parsed JSON content
console.log(res.cdnUrl);   // the CDN URL actually used

// 2. When you only need the data
const data = await fetchJsonData("https://github.com/user/repo/blob/main/data.json");

// 3. When you only need the list of CDN URLs (no request)
buildCdnUrls("https://github.com/user/repo/blob/main/data.json");
// [
//   { id: "jsdelivr",   name: "jsDelivr",   cdnUrl: "https://cdn.jsdelivr.net/gh/user/repo@main/data.json" },
//   { id: "statically", name: "Statically", cdnUrl: "https://cdn.statically.io/gh/user/repo@main/data.json" },
//   { id: "github-raw", name: "GitHub Raw", cdnUrl: "https://raw.githubusercontent.com/user/repo/refs/heads/main/data.json" }
// ]
```

## Response Shape

`fetchJson()` returns the following object:

```json
{
  "ok": true,
  "provider": "jsdelivr",
  "providerName": "jsDelivr",
  "cdnUrl": "https://cdn.jsdelivr.net/gh/user/repo@main/data.json",
  "data": { "hello": "world" },
  "source": {
    "type": "github",
    "owner": "user",
    "repo": "repo",
    "ref": "main",
    "path": "data.json",
    "githubUrl": "https://github.com/user/repo/blob/main/data.json"
  },
  "attempts": [
    { "provider": "jsdelivr", "cdnUrl": "https://cdn.jsdelivr.net/...", "ok": true, "status": 200, "durationMs": 84 }
  ],
  "jsonRepaired": false,
  "cached": false,
  "shared": false,
  "fetchedAt": "2026-11-05T10:00:00.000Z",
  "message": null
}
```

| Field | Meaning |
| --- | --- |
| `ok` | `true` on success, `false` on the failure envelope |
| `provider` / `providerName` | Id and name of the provider that served the request |
| `cdnUrl` | The CDN URL actually used |
| `data` | The parsed JSON content (or raw text when `parseJson: false`) |
| `source.githubUrl` | The canonical GitHub URL of the source |
| `attempts` | Attempt history for each provider, useful for logging |
| `jsonRepaired` | `true` when the body had to be repaired before it could be parsed |
| `cached` | `true` when the result came from cache |
| `shared` | `true` when the request was merged with an identical in-flight request |
| `fetchedAt` | Time the data was fetched (ISO 8601) |
| `message` | Clear English explanation; always `null` on success |

## Invalid JSON Handling

Every response body is validated before it is returned, so a non-JSON body never silently becomes `data`.

The repair pass runs first and automatically. Only if a body is **still** invalid after that does `fetchJson()` give up, and when every provider fails that way it **returns the same envelope shape as a successful response** with `ok: false` instead of throwing:

```json
{
  "ok": false,
  "provider": null,
  "providerName": null,
  "cdnUrl": null,
  "data": null,
  "source": { "type": "github", "owner": "user", "repo": "repo", "ref": "main", "path": "data.json", "githubUrl": "https://github.com/user/repo/blob/main/data.json" },
  "attempts": [
    { "provider": "jsdelivr", "cdnUrl": "https://cdn.jsdelivr.net/...", "ok": false, "status": 200, "invalidJson": true, "error": "JSON tidak valid: ... Cuplikan: \"<html>blocked</html>\"", "durationMs": 42 }
  ],
  "jsonRepaired": false,
  "cached": false,
  "shared": false,
  "fetchedAt": "2026-11-05T10:00:00.000Z",
  "message": "The response body is not valid JSON and could not be repaired. Tried providers: jsdelivr, statically, github-raw. See attempts[].error for a snippet of each response body."
}
```

```js
const result = await fetchJson("https://github.com/user/repo/blob/main/data.json");

if (!result.ok) {
  console.warn(result.message); // English, ready to show to a user or log
  console.warn(result.attempts.map((a) => a.error));
} else {
  console.log(result.data);
}
```

Details worth knowing:

- The envelope is **never cached**, so a later call retries from scratch.
- Only invalid JSON triggers it. HTTP failures (404/500) and network errors still throw `FetchError`, so real outages are not hidden behind a `null` payload.
- A mixed failure (one provider returns HTML, another times out) still throws `FetchError`, with `attempts[].invalidJson` telling you which was which.
- `fetchJsonData()` has no envelope to carry the message, so it throws `FetchError` (with `invalidJson: true`) rather than returning `null` silently.

### Repairing broken JSON

A repair pass runs automatically before a body is declared invalid. Set `jsonRepair: false` to disable it and require strictly valid JSON:

```js
const client = createClient({ jsonRepair: false }); // strict
```

The repair set is deliberately conservative, and every step is applied only outside string literals:

| Problem | Example |
| --- | --- |
| UTF-8 BOM | `\uFEFF{"a":1}` |
| Trailing comma | `{"a":1,}` / `[1,2,]` |
| Line comment | `// note` |
| Block comment | `/* note */` |

Anything else is left alone, so an HTML error page is never mistaken for data. When a repair was actually needed, the result says so:

```js
const result = await client.fetchJson(url);
if (result.ok && result.jsonRepaired) {
  // The source file is malformed — consider fixing it upstream.
}
```

Repair is part of the cache key, so repaired and strict responses never collide.

## Accepted Input Formats

```js
parseSource("https://github.com/user/repo/blob/main/data.json");
parseSource("https://github.com/user/repo/raw/main/data.json");
parseSource("https://raw.githubusercontent.com/user/repo/main/data.json");
parseSource("https://raw.githubusercontent.com/user/repo/refs/heads/main/data.json");
parseSource("https://cdn.jsdelivr.net/gh/user/repo@main/data.json");
parseSource("https://cdn.statically.io/gh/user/repo@main/data.json");

// or an object
parseSource({ owner: "user", repo: "repo", ref: "main", path: "data.json" });
parseSource({ user: "user", repo: "repo", branch: "dev", path: "a.json" }); // alias
```

> Note: branch names containing `/` (e.g. `feature/x`) cannot be distinguished from the file path in a URL. Use the object input `{ ref: "feature/x", path: "..." }` for that case.

## Configuration

Use `createClient()` for configuration reused across calls. Every option is optional; the values below are examples of overrides, not the defaults (see the table underneath):

```js
import { createClient } from "cascadn";

const client = createClient({
  providers: ["jsdelivr", "statically", "github-raw"], // fallback priority order
  timeout: 8000,             // per-request time limit (ms), 0 = no limit
  retries: 1,                // retries per provider for network/5xx errors
  retryDelay: 300,           // delay between retries (ms)
  headers: { Accept: "application/json" },
  cache: true,               // default true
  cacheTTL: 10 * 60 * 1000,  // cache lifetime 10 minutes
  cacheMax: 200,             // maximum cache entries
});

const res = await client.fetchJson("https://github.com/user/repo/blob/main/data.json");

// Options can be overridden per call
await client.fetchJson(url, { skipCache: true, timeout: 3000 });
```

| Option | Default | Description |
| --- | --- | --- |
| `providers` | `["jsdelivr", "statically", "github-raw"]` | Fallback order; accepts id strings or custom providers |
| `timeout` | `10000` | Per-request time limit (ms); `0` disables it |
| `retries` | `0` | Retries per provider (network/5xx/429 errors) |
| `retryDelay` | `300` | Base delay between retries (ms), increases linearly |
| `headers` | `{ Accept: ... }` | Request headers |
| `parseJson` | `true` | `false` to return raw text |
| `jsonRepair` | `true` | Conservative repair (BOM, comments, trailing comma) before parsing; `false` for strict |
| `cache` | `true` | Enable/disable cache |
| `cacheTTL` | `300000` | Cache entry lifetime (ms) |
| `cacheMax` | `100` | Maximum in-memory cache entries |
| `cacheAdapter` | `null` | Custom cache adapter |
| `fetch` | `globalThis.fetch` | Custom fetch implementation |
| `githubRawRefPrefix` | `"refs/heads"` | Ref prefix in the GitHub Raw URL; set `""` for the plain form |
| `skipCache` | `false` | Skip cache for this call |
| `signal` | `undefined` | External `AbortSignal` |

## Cache

The cache is enabled by default (5-minute TTL). The cache key is `owner/repo@ref/path` + provider list + parse mode, so switching providers or modes will not collide.

```js
// Disable entirely
const client = createClient({ cache: false });

// Skip the cache just once
await client.fetchJson(url, { skipCache: true });

// Clear the cache
await client.clearCache();
```

### Cache semantics

- **TTL-only staleness.** Entries go stale purely by age. There is no `ETag`/`Last-Modified` revalidation and no content hashing.
- **Lazy expiry.** Each entry stores an `expiresAt` timestamp that is checked on read, not by a background timer. An expired entry can therefore stay in memory until the next request for that key.
- **LRU eviction can win the race.** When the store is full (`cacheMax`), the least recently used entry is dropped even if its TTL has not expired yet.
- **Only successful results are cached.** A failed fetch (all providers down) is never stored, so failures cannot poison later calls.
- **No background refresh.** There is no stale-while-revalidate and no proactive recache: a fetch is always triggered by a request whose key is missing or expired.
- **`skipCache: true` refreshes.** It bypasses the read but still writes the fresh result back into the cache.
- **Scope is per process.** The default store is in-memory, so separate instances do not share entries and drift apart. Provide a shared `cacheAdapter` (Redis, etc.) if you need a purge that reaches every instance.
- **Concurrent calls are deduplicated.** Identical in-flight requests collapse into a single fetch; the extra callers receive `shared: true` instead of another network round trip.

Because the cache key includes `ref`, tag and commit URLs are effectively immutable and TTL mostly matters when a branch such as `main` moves.

### Custom cache adapter

An adapter only needs to provide `get(key)` and `set(key, value, ttl)` (async is allowed). Example with `localStorage`:

```js
const localStorageAdapter = {
  get(key) {
    const raw = localStorage.getItem(key);
    if (!raw) return undefined;
    const { value, expiresAt } = JSON.parse(raw);
    if (expiresAt && expiresAt <= Date.now()) {
      localStorage.removeItem(key);
      return undefined;
    }
    return value;
  },
  set(key, value, ttl) {
    localStorage.setItem(key, JSON.stringify({ value, expiresAt: ttl ? Date.now() + ttl : null }));
  },
  clear() {
    Object.keys(localStorage)
      .filter((k) => k.startsWith("cdn:"))
      .forEach((k) => localStorage.removeItem(k));
  },
};

const client = createClient({ cacheAdapter: localStorageAdapter });
```

## Custom Providers

`providers` can accept your own provider objects, as long as they have `id`, `name`, and `buildUrl(source)`:

```js
const unpkg = {
  id: "unpkg",
  name: "unpkg",
  buildUrl: ({ owner, repo, ref, path }) =>
    `https://unpkg.com/gh/${owner}/${repo}@${ref}/${path}`,
};

const client = createClient({ providers: ["jsdelivr", unpkg, "github-raw"] });
```

## Error Handling

There are two failure paths: **thrown** errors for HTTP and network problems, and the **`ok: false` envelope** for JSON that could not be repaired.

```js
import { fetchJson, FetchError, ParseError } from "cascadn";

try {
  const res = await fetchJson(url);

  if (!res.ok) {
    // Every provider returned unrepairable JSON — not a network problem.
    console.error(res.message, res.attempts);
  }
} catch (error) {
  if (error instanceof ParseError) {
    console.error("Unrecognized source URL:", error.input);
  } else if (error instanceof FetchError) {
    console.error("All providers failed:", error.attempts);
  }
}
```

## API

| Export | Description |
| --- | --- |
| `fetchJson(input, options?)` | Fetch JSON + fallback; returns the full response object, or an `ok: false` envelope when JSON cannot be repaired |
| `fetchJsonData(input, options?)` | Same, but returns only `data`; throws `FetchError` instead of returning an envelope |
| `buildCdnUrls(input, options?)` | Build the list of CDN URLs without a request |
| `clearCache()` | Clear the default client's cache |
| `createClient(options?)` | Create a client with its own configuration |
| `parseSource(input)` | Normalize a URL/object into `{ owner, repo, ref, path, githubUrl }` |
| `providers`, `DEFAULT_PROVIDER_ORDER`, `resolveProviders` | Provider registry & utilities |
| `MemoryCache` | Built-in TTL + LRU cache implementation |
| `CDNError`, `ParseError`, `FetchError` | Error classes |

All of the exports above are also available via the default export:

```js
import cascadn from "cascadn";
await cascadn.fetchJson(url);
```

## Examples

The [`examples/`](./examples) folder contains runnable examples:

| File | Contents |
| --- | --- |
| [`01-basic.mjs`](./examples/01-basic.mjs) | `parseSource`, `buildCdnUrls`, `fetchJson`, `fetchJsonData`, object input |
| [`02-fallback.mjs`](./examples/02-fallback.mjs) | Simulated jsDelivr outage, all providers failing, 404 file |
| [`03-cache.mjs`](./examples/03-cache.mjs) | TTL cache, `skipCache`, single-flight, custom adapter, `MemoryCache` |
| [`04-custom-provider.mjs`](./examples/04-custom-provider.mjs) | Custom provider, fallback order, retry, text mode |
| [`05-react-hook.js`](./examples/05-react-hook.js) | Ready-to-use React hook `useCdnJson` |
| [`browser.html`](./examples/browser.html) | Demo in the browser without a bundler |

```bash
node examples/01-basic.mjs
node examples/02-fallback.mjs
node examples/03-cache.mjs
node examples/04-custom-provider.mjs
```

For the browser demo, run a static server from the package root and open `/examples/browser.html`:

```bash
npx serve .
```

> `05-react-hook.js` is illustrative (it requires React in your project) and is not run directly here.

## Test

```bash
npm test
```

## Migrating from 1.x

Version 2.0.0 changes how `fetchJson()` reports JSON that cannot be parsed.

### 1. `fetchJson()` no longer throws for unrepairable JSON

In 1.x every total failure threw `FetchError` — including a CDN serving an HTML error page. In 2.x, when all providers return JSON that cannot be repaired, the call **resolves** with an envelope instead:

```js
// 1.x
try {
  const res = await fetchJson(url);
  render(res.data);
} catch (error) {
  // also reached for invalid JSON
}

// 2.x
try {
  const res = await fetchJson(url);

  if (!res.ok) {
    console.error(res.message, res.attempts);
    return;
  }

  render(res.data);
} catch (error) {
  // HTTP and network failures still land here
}
```

Keep the `try/catch`: HTTP 404/500 and network errors still throw `FetchError`. Only the invalid-JSON case changed.

### 2. TypeScript: `fetchJson()` now returns a union

`FetchResult<T>` gained `ok: true`, and an `ok: false` counterpart named `FetchFailure` was added. The return type is now `FetchOutcome<T> = FetchResult<T> | FetchFailure`, so `res.data` needs narrowing via `if (res.ok)` before it compiles.

`fetchJsonData()` is unaffected: it still returns `T` and throws on failure.

### 3. `jsonRepair` defaults to `true`

Bodies containing a UTF-8 BOM, comments, or trailing commas used to fail outright. They are now repaired automatically and returned with `jsonRepaired: true`. To require strictly valid JSON again:

```js
const client = createClient({ jsonRepair: false });
```

Be aware that with `jsonRepair: false` such a body now yields an `ok: false` envelope rather than a thrown error.

### New in 2.0

| Addition | Location |
| --- | --- |
| `ok` | every response |
| `message` | `null` on success, English explanation on failure |
| `jsonRepaired` | result object |
| `invalidJson` | each entry of `attempts[]` |
| `jsonRepair` option | client configuration |
| `FetchFailure`, `FetchOutcome` | exported types |
| `FetchError.invalidJson` | thrown by `fetchJsonData()` |

The cache key now also includes the repair mode. The cache is in-memory only, so there is nothing to migrate.

## License

MIT © Kang Cahya
