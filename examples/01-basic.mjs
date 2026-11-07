// Contoh 1: pemakaian dasar.
// Jalankan: node examples/01-basic.mjs

import { fetchJson, fetchJsonData, buildCdnUrls, parseSource } from "cascadn";

const GITHUB_URL =
  "https://github.com/dyazincahya/iqro-json/blob/main/hijaiyah-letters.json";

// 1. Normalisasi URL sumber menjadi bagian-bagiannya
console.log("1) parseSource");
console.log(parseSource(GITHUB_URL));

// 2. Susun daftar URL CDN tanpa melakukan request
console.log("\n2) buildCdnUrls (tanpa request)");
for (const item of buildCdnUrls(GITHUB_URL)) {
  console.log(`   [${item.id}] ${item.cdnUrl}`);
}

// 3. Ambil JSON dengan fallback otomatis + metadata
console.log("\n3) fetchJson");
const res = await fetchJson(GITHUB_URL);
console.log(`   provider : ${res.provider} (${res.providerName})`);
console.log(`   cdnUrl   : ${res.cdnUrl}`);
console.log(`   cached   : ${res.cached}`);
console.log(`   attempts : ${JSON.stringify(res.attempts)}`);
console.log(`   data     : ${Array.isArray(res.data) ? `${res.data.length} item` : "object"}`);
console.log(`   contoh   : ${JSON.stringify(res.data?.[0])}`);

// 4. Kalau hanya butuh datanya saja
console.log("\n4) fetchJsonData");
const data = await fetchJsonData(GITHUB_URL);
console.log(`   jumlah item: ${data.length}`);

// 5. Input berupa objek juga didukung
console.log("\n5) input objek");
const fromObject = await fetchJsonData({
  owner: "dyazincahya",
  repo: "iqro-json",
  ref: "main",
  path: "hijaiyah-letters.json",
});
console.log(`   jumlah item: ${fromObject.length}`);
