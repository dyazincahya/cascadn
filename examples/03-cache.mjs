// Contoh 3: konsep cache (TTL, skipCache, single-flight, adapter kustom).
// Jalankan: node examples/03-cache.mjs

import { createClient, MemoryCache } from "cascadn";

const GITHUB_URL =
  "https://github.com/dyazincahya/iqro-json/blob/main/hijaiyah-letters.json";

const client = createClient({ cacheTTL: 60_000, cacheMax: 50 });

// 1. Panggilan pertama -> request ke CDN
let started = Date.now();
const first = await client.fetchJson(GITHUB_URL);
const firstMs = Date.now() - started;

// 2. Panggilan kedua -> dilayani dari cache (jauh lebih cepat, tanpa request)
started = Date.now();
const second = await client.fetchJson(GITHUB_URL);
const secondMs = Date.now() - started;

console.log("1) cache dasar");
console.log(`   pertama : ${firstMs}ms  cached=${first.cached}  provider=${first.provider}`);
console.log(`   kedua   : ${secondMs}ms  cached=${second.cached}`);

// 3. skipCache: true -> abaikan cache untuk pemanggilan ini saja
const fresh = await client.fetchJson(GITHUB_URL, { skipCache: true });
console.log(`\n2) skipCache: true -> cached=${fresh.cached} (request baru ke CDN)`);

// 4. Single-flight: request identik yang bersamaan digabung jadi satu
const [a, b, c] = await Promise.all([
  client.fetchJson(GITHUB_URL, { skipCache: true }),
  client.fetchJson(GITHUB_URL, { skipCache: true }),
  client.fetchJson(GITHUB_URL, { skipCache: true }),
]);
console.log("\n3) single-flight (3 request bersamaan)");
console.log(`   1 -> cached=${a.cached} shared=${a.shared}`);
console.log(`   2 -> cached=${b.cached} shared=${b.shared}`);
console.log(`   3 -> cached=${c.cached} shared=${c.shared}`);

// 5. Adapter cache kustom (contoh bentuk Map; di browser bisa pakai localStorage)
const store = new Map();
const customAdapter = {
  get: (key) => store.get(key),
  set: (key, value) => store.set(key, value),
  clear: () => store.clear(),
};

const customClient = createClient({ cacheAdapter: customAdapter });
await customClient.fetchJson(GITHUB_URL);
console.log(`\n4) adapter kustom -> entri tersimpan: ${store.size}`);

// 6. Bersihkan cache
await customClient.clearCache();
console.log(`   setelah clearCache() -> entri tersimpan: ${store.size}`);

// 7. MemoryCache bisa dipakai langsung (tanpa client)
const memory = new MemoryCache({ ttl: 1000, max: 2 });
memory.set("kunci", { foo: "bar" });
console.log(`\n5) MemoryCache langsung -> get("kunci") = ${JSON.stringify(memory.get("kunci"))}`);
