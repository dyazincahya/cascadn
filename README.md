# cascadn

<p align="center">
  <img src="logo-wide.png" alt="cascadn" width="600">
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
  "cached": false,
  "shared": false,
  "fetchedAt": "2026-11-05T10:00:00.000Z"
}
```

| Field | Meaning |
| --- | --- |
| `provider` / `providerName` | Id and name of the provider that served the request |
| `cdnUrl` | The CDN URL actually used |
| `data` | The parsed JSON content (or raw text when `parseJson: false`) |
| `source.githubUrl` | The canonical GitHub URL of the source |
| `attempts` | Attempt history for each provider, useful for logging |
| `cached` | `true` when the result came from cache |
| `shared` | `true` when the request was merged with an identical in-flight request |
| `fetchedAt` | Time the data was fetched (ISO 8601) |

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

Use `createClient()` for configuration reused across calls:

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

```js
import { fetchJson, FetchError, ParseError } from "cascadn";

try {
  const res = await fetchJson(url);
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
| `fetchJson(input, options?)` | Fetch JSON + fallback; returns the full response object |
| `fetchJsonData(input, options?)` | Same, but returns only `data` |
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

## License

MIT © Kang Cahya
