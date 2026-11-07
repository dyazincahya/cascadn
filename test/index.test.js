import test from "node:test";
import assert from "node:assert/strict";

import {
  parseSource,
  buildCdnUrls,
  createClient,
  MemoryCache,
  FetchError,
  ParseError,
} from "../src/index.js";

const GH_URL = "https://github.com/user/repo/blob/main/data/file.json";

function jsonResponse(body, { status = 200, statusText = "OK" } = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText,
    headers: new Map(),
    async text() {
      return typeof body === "string" ? body : JSON.stringify(body);
    },
  };
}

test("parseSource: GitHub blob URL", () => {
  const source = parseSource(GH_URL);
  assert.equal(source.owner, "user");
  assert.equal(source.repo, "repo");
  assert.equal(source.ref, "main");
  assert.equal(source.path, "data/file.json");
  assert.equal(source.githubUrl, GH_URL);
});

test("parseSource: raw.githubusercontent.com (refs/heads)", () => {
  const source = parseSource("https://raw.githubusercontent.com/user/repo/refs/heads/dev/a.json");
  assert.equal(source.ref, "dev");
  assert.equal(source.path, "a.json");
});

test("parseSource: jsDelivr dan Statically", () => {
  assert.equal(parseSource("https://cdn.jsdelivr.net/gh/user/repo@v1/x.json").ref, "v1");
  assert.equal(parseSource("https://cdn.statically.io/gh/user/repo@v2/y.json").path, "y.json");
});

test("parseSource: input objek selalu punya githubUrl", () => {
  const source = parseSource({ owner: "user", repo: "repo", branch: "dev", path: "a.json" });
  assert.equal(source.ref, "dev");
  assert.equal(source.path, "a.json");
  assert.equal(source.githubUrl, "https://github.com/user/repo/blob/dev/a.json");
});

test("parseSource: query/hash diabaikan dan .git dibersihkan", () => {
  const source = parseSource("https://github.com/user/repo.git/blob/main/a.json?raw=1#L1");
  assert.equal(source.repo, "repo");
  assert.equal(source.path, "a.json");
});

test("parseSource: sumber tidak valid", () => {
  assert.throws(() => parseSource("https://example.com/foo"), ParseError);
  assert.throws(() => parseSource({ repo: "repo", path: "a.json" }), ParseError);
});

test("buildCdnUrls: urutan default dan format URL", () => {
  const urls = buildCdnUrls(GH_URL);
  assert.deepEqual(urls.map((u) => u.id), ["jsdelivr", "statically", "github-raw"]);
  assert.equal(urls[0].cdnUrl, "https://cdn.jsdelivr.net/gh/user/repo@main/data/file.json");
  assert.equal(urls[1].cdnUrl, "https://cdn.statically.io/gh/user/repo@main/data/file.json");
  assert.equal(
    urls[2].cdnUrl,
    "https://raw.githubusercontent.com/user/repo/refs/heads/main/data/file.json",
  );
});

test("buildCdnUrls: urutan kustom dan githubRawRefPrefix kosong", () => {
  const urls = buildCdnUrls(GH_URL, { providers: ["github-raw", "jsdelivr"], githubRawRefPrefix: "" });
  assert.deepEqual(urls.map((u) => u.id), ["github-raw", "jsdelivr"]);
  assert.equal(urls[0].cdnUrl, "https://raw.githubusercontent.com/user/repo/main/data/file.json");
});

test("fetchJson: sukses dari jsDelivr", async () => {
  const calls = [];
  const client = createClient({
    cache: false,
    fetch: async (url) => {
      calls.push(url);
      return jsonResponse({ hello: "world" });
    },
  });

  const result = await client.fetchJson(GH_URL);
  assert.equal(result.provider, "jsdelivr");
  assert.equal(result.providerName, "jsDelivr");
  assert.equal(result.cdnUrl, "https://cdn.jsdelivr.net/gh/user/repo@main/data/file.json");
  assert.deepEqual(result.data, { hello: "world" });
  assert.equal(result.cached, false);
  assert.equal(result.shared, false);
  assert.equal(calls.length, 1);
  assert.equal(result.attempts.length, 1);
  assert.equal(result.attempts[0].ok, true);
});

test("fetchJson: fallback ke Statically saat jsDelivr 500", async () => {
  const client = createClient({
    cache: false,
    fetch: async (url) => {
      if (url.includes("cdn.jsdelivr.net")) return jsonResponse("boom", { status: 500, statusText: "Server Error" });
      if (url.includes("cdn.statically.io")) return jsonResponse({ from: "statically" });
      return jsonResponse({ from: "raw" });
    },
  });

  const result = await client.fetchJson(GH_URL);
  assert.equal(result.provider, "statically");
  assert.deepEqual(result.data, { from: "statically" });
  assert.equal(result.attempts.length, 2);
  assert.equal(result.attempts[0].ok, false);
  assert.equal(result.attempts[0].status, 500);
});

test("fetchJson: fallback ke GitHub Raw saat dua CDN gagal", async () => {
  const client = createClient({
    cache: false,
    fetch: async (url) => {
      if (url.includes("raw.githubusercontent.com")) return jsonResponse({ from: "raw" });
      throw new Error("network down");
    },
  });

  const result = await client.fetchJson(GH_URL);
  assert.equal(result.provider, "github-raw");
  assert.deepEqual(result.data, { from: "raw" });
  assert.equal(result.attempts.length, 3);
});

test("fetchJson: JSON tidak valid memicu fallback", async () => {
  const client = createClient({
    cache: false,
    fetch: async (url) => {
      if (url.includes("cdn.jsdelivr.net")) return jsonResponse("<html>not json</html>");
      return jsonResponse({ ok: true });
    },
  });

  const result = await client.fetchJson(GH_URL);
  assert.equal(result.provider, "statically");
  assert.deepEqual(result.data, { ok: true });
});

test("fetchJsonData: hanya mengembalikan data", async () => {
  const client = createClient({
    cache: false,
    fetch: async () => jsonResponse({ a: 1 }),
  });

  const data = await client.fetchJsonData(GH_URL);
  assert.deepEqual(data, { a: 1 });
});

test("fetchJson: parseJson false mengembalikan teks mentah", async () => {
  const client = createClient({
    cache: false,
    parseJson: false,
    fetch: async () => jsonResponse("plain text"),
  });

  const result = await client.fetchJson(GH_URL);
  assert.equal(result.data, "plain text");
});

test("fetchJson: semua provider gagal melempar FetchError", async () => {
  const client = createClient({
    cache: false,
    fetch: async () => {
      throw new Error("boom");
    },
  });

  await assert.rejects(
    () => client.fetchJson(GH_URL),
    (error) => {
      assert.ok(error instanceof FetchError);
      assert.equal(error.attempts.length, 3);
      assert.equal(error.source.owner, "user");
      return true;
    },
  );
});

test("cache: panggilan kedua dilayani dari cache", async () => {
  let count = 0;
  const client = createClient({
    fetch: async () => {
      count += 1;
      return jsonResponse({ n: count });
    },
  });

  const first = await client.fetchJson(GH_URL);
  const second = await client.fetchJson(GH_URL);

  assert.equal(first.cached, false);
  assert.equal(second.cached, true);
  assert.deepEqual(second.data, { n: 1 });
  assert.equal(count, 1);

  const skipped = await client.fetchJson(GH_URL, { skipCache: true });
  assert.equal(skipped.cached, false);
  assert.equal(count, 2);
});

test("cache: single-flight menggabungkan request bersamaan", async () => {
  let count = 0;
  const client = createClient({
    fetch: async () => {
      count += 1;
      await new Promise((resolve) => setTimeout(resolve, 20));
      return jsonResponse({ n: count });
    },
  });

  const [a, b] = await Promise.all([client.fetchJson(GH_URL), client.fetchJson(GH_URL)]);
  assert.equal(count, 1);
  assert.equal(a.shared, false);
  assert.equal(b.shared, true);
  assert.deepEqual(a.data, b.data);
});

test("cache: adapter kustom dipakai", async () => {
  const store = new Map();
  const adapter = {
    get: (key) => store.get(key),
    set: (key, value) => store.set(key, value),
    clear: () => store.clear(),
  };
  const client = createClient({
    cacheAdapter: adapter,
    fetch: async () => jsonResponse({ ok: 1 }),
  });

  await client.fetchJson(GH_URL);
  assert.equal(store.size, 1);
  await client.clearCache();
  assert.equal(store.size, 0);
});

test("MemoryCache: TTL dan eviksi LRU", async () => {
  const cache = new MemoryCache({ ttl: 15, max: 2 });
  cache.set("a", 1);
  assert.equal(cache.get("a"), 1);

  cache.set("b", 2);
  cache.set("c", 3);
  assert.equal(cache.size, 2);
  assert.equal(cache.get("a"), undefined); // paling lama ter-evict

  await new Promise((resolve) => setTimeout(resolve, 25));
  assert.equal(cache.get("b"), undefined); // sudah kedaluwarsa
});
